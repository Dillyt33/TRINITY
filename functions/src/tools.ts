import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { findFreeSlot } from '../../src/lib/layout';
import { guessCategory, parseQuickAdd } from '../../src/lib/parse';
import { addDays, clockAp, duration, hhmm, longDate, shortDate, timeRange, weekday } from '../../src/lib/time';
import { CATEGORY_NAMES, DEFAULT_NOTIFY, DEFAULT_SETTINGS, LIFE_AREAS, MOOD_LABELS, type Block, type CategoryId, type CheckIn, type LifeArea, type LifeEntry, type Mood, type Subtask, type Task } from '../../src/lib/types';
import type { ScheduleStore } from './store';
import { registerVaultTools, type BridgeStore } from './bridge';
import { nowIn } from './zone';

export interface ToolContext {
  store: ScheduleStore;
  uid: string;
  /** Used when the person's settings don't include a time zone yet. */
  defaultTz?: string;
  /** Obsidian access through the Mac helper. */
  bridge?: BridgeStore;
  clock?: () => Date;
}

const CATEGORY = z
  .enum(['deep', 'meet', 'health', 'personal', 'admin', 'break'])
  .describe('deep = focused work, meet = meetings/calls, health = exercise/sleep/doctor, personal, admin = chores/email/errands, break');
const DATE = z
  .string()
  .describe('"today", "tomorrow", "yesterday", a weekday like "friday" or "next monday", or YYYY-MM-DD. Defaults to today.');
const TIME = z.string().describe('Local time, e.g. "14:30", "2:30pm" or "9am".');

const WEEKDAY: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function resolveDate(input: string | undefined, today: string): string {
  const s = (input ?? '').trim().toLowerCase();
  if (!s || s === 'today' || s === 'tonight') return today;
  if (s === 'tomorrow') return addDays(today, 1);
  if (s === 'yesterday') return addDays(today, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(next\s+|this\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*$/);
  if (m) {
    let delta = (WEEKDAY[m[2]] - weekday(today) + 7) % 7;
    if (m[1]?.startsWith('next') && delta === 0) delta = 7;
    return addDays(today, delta);
  }
  throw new Error(`Couldn't read the date "${input}". Use YYYY-MM-DD, today, tomorrow, or a weekday.`);
}

export function parseTime(input: string): number {
  const s = input.trim().toLowerCase().replace(/\./g, '');
  if (s === 'noon') return 12 * 60;
  if (s === 'midnight') return 24 * 60;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) throw new Error(`Couldn't read the time "${input}". Use something like "14:30" or "2:30pm".`);
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const mer = m[3];
  if (h > 24 || min > 59) throw new Error(`"${input}" isn't a valid time.`);
  if (mer?.startsWith('p') && h < 12) h += 12;
  else if (mer?.startsWith('a') && h === 12) h = 0;
  else if (!mer && !m[2] && h >= 1 && h <= 6) h += 12; // a bare "3" means 3 PM
  return h * 60 + min;
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true });

function blockLine(b: Block): string {
  const steps = b.subtasks.length ? ` · checklist ${b.subtasks.filter((s) => s.done).length}/${b.subtasks.length}` : '';
  return `- ${timeRange(b.start, b.end)} · ${b.title} · ${CATEGORY_NAMES[b.cat]}${b.done ? ' · DONE' : ''}${steps} [id: ${b.id}]`;
}

function newId(prefix: string) {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/** Builds the Trinity MCP server for one signed-in person. */
export function buildServer(ctx: ToolContext): McpServer {
  const { store, uid } = ctx;
  const server = new McpServer(
    { name: 'trinity', version: '0.2.0' },
    {
      instructions:
        "Trinity's tools manage the person's Trinity calendar (time blocks) and to-do list. Times are in their local time zone. " +
        'Call get_schedule before changing things so you use real block ids. Ask before deleting, and before changing more than two blocks at once. ' +
        'After a change, confirm it in one short sentence.',
    },
  );

  async function now() {
    const settings = await store.getSettings(uid);
    const tz = settings.tz || ctx.defaultTz || 'UTC';
    const n = nowIn(tz, ctx.clock?.() ?? new Date());
    return { ...n, tz, settings: { ...DEFAULT_SETTINGS, ...settings } };
  }

  async function dayBlocks(date: string) {
    return (await store.listBlocks(uid, date, date)).sort((a, b) => a.start - b.start);
  }

  function overlapNote(blocks: Block[], b: Block): string {
    const clash = blocks.filter((x) => x.id !== b.id && x.start < b.end && x.end > b.start);
    return clash.length ? ` Heads up: it overlaps ${clash.map((c) => `“${c.title}” (${timeRange(c.start, c.end)})`).join(', ')}.` : '';
  }

  server.registerTool(
    'get_schedule',
    {
      title: 'Get schedule',
      description: "Read the person's time blocks (with ids), the day's intention, what's happening now, and unscheduled to-dos.",
      inputSchema: {
        date: DATE.optional(),
        days: z.number().int().min(1).max(14).optional().describe('How many days to include, starting at date. Default 1.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ date, days }) => {
      const n = await now();
      let start: string;
      try {
        start = resolveDate(date, n.date);
      } catch (e) {
        return fail((e as Error).message);
      }
      const count = days ?? 1;
      const end = addDays(start, count - 1);
      const all = (await store.listBlocks(uid, start, end)).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
      const out: string[] = [`Today is ${longDate(n.date)} (${n.date}). Time now: ${clockAp(n.minutes)} (${n.tz}).`];
      const todays = all.filter((b) => b.date === n.date);
      const cur = todays.find((b) => !b.done && b.start <= n.minutes && n.minutes < b.end);
      if (cur) out.push(`Happening now: ${cur.title}, ${cur.end - n.minutes} min left.`);
      for (let i = 0; i < count; i++) {
        const d = addDays(start, i);
        const meta = await store.getDay(uid, d);
        const list = all.filter((b) => b.date === d);
        const real = list.filter((b) => b.cat !== 'break');
        out.push('');
        out.push(`${longDate(d)}${d === n.date ? ' (today)' : ''}${meta?.intention ? ` · intention: ${meta.intention}` : ''}`);
        if (!list.length) out.push('- nothing planned');
        for (const b of list) out.push(blockLine(b));
        if (real.length) {
          const planned = real.reduce((a, b) => a + b.end - b.start, 0);
          out.push(`Planned ${duration(planned)} · ${real.filter((b) => b.done).length} of ${real.length} done`);
        }
      }
      const todos = (await store.listTasks(uid)).filter((t) => !t.done);
      out.push('');
      out.push(todos.length ? 'Unscheduled to-dos:' : 'Unscheduled to-dos: none');
      for (const t of todos) out.push(`- ${t.title} (~${duration(t.estimate)}, ${CATEGORY_NAMES[t.cat]}) [id: ${t.id}]`);
      return text(out.join('\n'));
    },
  );

  server.registerTool(
    'find_free_time',
    {
      title: 'Find free time',
      description: 'Find open slots of a given length on a day. On today, only slots after the current time are returned.',
      inputSchema: {
        duration_minutes: z.number().int().min(5).max(720),
        date: DATE.optional(),
        after: TIME.optional(),
        before: TIME.optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ duration_minutes, date, after, before }) => {
      const n = await now();
      try {
        const d = resolveDate(date, n.date);
        const from = after ? parseTime(after) : d === n.date ? n.minutes : n.settings.dayStart;
        const until = before ? parseTime(before) : n.settings.dayEnd;
        const busy = (await dayBlocks(d)).map((b) => ({ start: b.start, end: b.end }));
        const slots: string[] = [];
        let t = from;
        while (slots.length < 5) {
          const s = findFreeSlot(busy, duration_minutes, t, n.settings.dayStart, until, 15);
          if (s === null) break;
          const nextBusy = busy.filter((b) => b.start >= s + duration_minutes).sort((a, b) => a.start - b.start)[0];
          const gapEnd = Math.min(nextBusy?.start ?? until, until);
          slots.push(`- ${timeRange(s, gapEnd)} (open ${duration(gapEnd - s)})`);
          t = gapEnd + 1;
        }
        return text(slots.length ? `Free on ${shortDate(d)} for ${duration(duration_minutes)}:\n${slots.join('\n')}` : `No ${duration(duration_minutes)} gap on ${shortDate(d)} in that window.`);
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    'add_block',
    {
      title: 'Add a time block',
      description: 'Put a block on the calendar. Give start plus either end or duration_minutes (default 60).',
      inputSchema: {
        title: z.string().min(1).max(200),
        start: TIME,
        date: DATE.optional(),
        end: TIME.optional(),
        duration_minutes: z.number().int().min(5).max(1440).optional(),
        category: CATEGORY.optional(),
        notes: z.string().max(4000).optional(),
        checklist: z.array(z.string().max(200)).max(30).optional(),
      },
    },
    async (a) => {
      const n = await now();
      try {
        const date = resolveDate(a.date, n.date);
        const start = parseTime(a.start);
        const end = a.end ? parseTime(a.end) : start + (a.duration_minutes ?? 60);
        if (end <= start) return fail('The end time has to be after the start time.');
        const t = Date.now();
        const b: Block = {
          id: newId('b'),
          date,
          start,
          end,
          title: a.title.trim(),
          cat: (a.category as CategoryId | undefined) ?? guessCategory(a.title),
          done: false,
          notes: a.notes ?? '',
          subtasks: (a.checklist ?? []).map((x): Subtask => ({ id: newId('s'), text: x, done: false })),
          source: 'claude',
          createdAt: t,
          updatedAt: t,
        };
        const existing = await dayBlocks(date);
        await store.putBlock(uid, b);
        return text(`Added “${b.title}” on ${shortDate(date)}, ${timeRange(b.start, b.end)} [id: ${b.id}].${overlapNote(existing, b)}`);
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    'quick_add',
    {
      title: 'Quick add from a phrase',
      description: 'Add from natural language, e.g. "gym tomorrow 6pm 1h", "call mom fri 3-3:30pm". Phrases without a time become unscheduled to-dos.',
      inputSchema: { text: z.string().min(1).max(300) },
    },
    async ({ text: phrase }) => {
      const n = await now();
      const p = parseQuickAdd(phrase, n.date);
      if (!p) return fail('That phrase was empty.');
      const t = Date.now();
      if (p.start === null) {
        const task: Task = { id: newId('t'), title: p.title, estimate: p.duration === 60 ? 30 : p.duration, cat: p.cat, done: false, createdAt: t, updatedAt: t };
        await store.putTask(uid, task);
        return text(`Added to-do “${task.title}” (~${duration(task.estimate)}) [id: ${task.id}].`);
      }
      const b: Block = { id: newId('b'), date: p.date, start: p.start, end: p.start + p.duration, title: p.title, cat: p.cat, done: false, notes: '', subtasks: [], source: 'claude', createdAt: t, updatedAt: t };
      const existing = await dayBlocks(p.date);
      await store.putBlock(uid, b);
      return text(`Added “${b.title}” on ${shortDate(b.date)}, ${timeRange(b.start, b.end)} [id: ${b.id}].${overlapNote(existing, b)}`);
    },
  );

  server.registerTool(
    'update_block',
    {
      title: 'Change a time block',
      description: 'Move, resize, rename, recategorize, mark done/undone, edit notes, or add checklist items. Moving with only a new start keeps the same length.',
      inputSchema: {
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        date: DATE.optional(),
        start: TIME.optional(),
        end: TIME.optional(),
        duration_minutes: z.number().int().min(5).max(1440).optional(),
        category: CATEGORY.optional(),
        done: z.boolean().optional(),
        notes: z.string().max(4000).optional(),
        add_checklist: z.array(z.string().max(200)).max(30).optional(),
      },
    },
    async (a) => {
      const cur = await store.getBlock(uid, a.id);
      if (!cur) return fail(`No block with id ${a.id}. Call get_schedule for current ids.`);
      const n = await now();
      try {
        const next: Block = { ...cur, updatedAt: Date.now() };
        if (a.title) next.title = a.title.trim();
        if (a.date) next.date = resolveDate(a.date, n.date);
        const len = cur.end - cur.start;
        if (a.start) {
          next.start = parseTime(a.start);
          next.end = next.start + len;
        }
        if (a.duration_minutes) next.end = next.start + a.duration_minutes;
        if (a.end) next.end = parseTime(a.end);
        if (next.end <= next.start) return fail('The end time has to be after the start time.');
        if (a.category) next.cat = a.category as CategoryId;
        if (a.done !== undefined) next.done = a.done;
        if (a.notes !== undefined) next.notes = a.notes;
        if (a.add_checklist?.length) next.subtasks = [...cur.subtasks, ...a.add_checklist.map((x) => ({ id: newId('s'), text: x, done: false }))];
        const existing = await dayBlocks(next.date);
        await store.putBlock(uid, next);
        const moved = next.date !== cur.date || next.start !== cur.start || next.end !== cur.end;
        const what = a.done !== undefined && !moved ? (a.done ? 'Marked done' : 'Marked not done') : 'Updated';
        return text(`${what}: “${next.title}”, ${shortDate(next.date)} ${timeRange(next.start, next.end)}.${moved ? overlapNote(existing, next) : ''}`);
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    'delete_block',
    {
      title: 'Delete a time block',
      description: 'Remove a block from the calendar. Ask the person first.',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      const cur = await store.getBlock(uid, id);
      if (!cur) return fail(`No block with id ${id}.`);
      await store.deleteBlock(uid, id);
      return text(`Deleted “${cur.title}” (${shortDate(cur.date)}, ${timeRange(cur.start, cur.end)}).`);
    },
  );

  server.registerTool(
    'add_todo',
    {
      title: 'Add a to-do',
      description: 'Add something to the unscheduled list (no time yet).',
      inputSchema: { title: z.string().min(1).max(200), estimate_minutes: z.number().int().min(5).max(600).optional(), category: CATEGORY.optional() },
    },
    async (a) => {
      const t = Date.now();
      const task: Task = { id: newId('t'), title: a.title.trim(), estimate: a.estimate_minutes ?? 30, cat: (a.category as CategoryId | undefined) ?? guessCategory(a.title), done: false, createdAt: t, updatedAt: t };
      await store.putTask(uid, task);
      return text(`Added to-do “${task.title}” (~${duration(task.estimate)}) [id: ${task.id}].`);
    },
  );

  server.registerTool(
    'complete_todo',
    {
      title: 'Complete a to-do',
      description: 'Mark an unscheduled to-do as done.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const t = await store.getTask(uid, id);
      if (!t) return fail(`No to-do with id ${id}.`);
      await store.putTask(uid, { ...t, done: true, updatedAt: Date.now() });
      return text(`Done: “${t.title}”.`);
    },
  );

  server.registerTool(
    'schedule_todo',
    {
      title: 'Schedule a to-do',
      description: 'Turn an unscheduled to-do into a time block, at a given start or in the next free slot.',
      inputSchema: { id: z.string(), date: DATE.optional(), start: TIME.optional() },
    },
    async (a) => {
      const task = await store.getTask(uid, a.id);
      if (!task) return fail(`No to-do with id ${a.id}.`);
      const n = await now();
      try {
        const date = resolveDate(a.date, n.date);
        const existing = await dayBlocks(date);
        let start = a.start ? parseTime(a.start) : null;
        if (start === null) {
          const after = date === n.date ? n.minutes : Math.max(n.settings.dayStart, 9 * 60);
          start = findFreeSlot(existing, task.estimate, after, n.settings.dayStart, n.settings.dayEnd, 15);
          if (start === null) return fail(`No free ${duration(task.estimate)} slot on ${shortDate(date)}.`);
        }
        const t = Date.now();
        const b: Block = { id: newId('b'), date, start, end: start + task.estimate, title: task.title, cat: task.cat, done: false, notes: '', subtasks: [], source: 'claude', createdAt: t, updatedAt: t };
        await store.putBlock(uid, b);
        await store.deleteTask(uid, task.id);
        return text(`Scheduled “${b.title}” on ${shortDate(date)}, ${timeRange(b.start, b.end)} [id: ${b.id}].${overlapNote(existing, b)}`);
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    'set_intention',
    {
      title: "Set the day's intention",
      description: 'The one thing that would make the day a win. Shown at the top of the day in Trinity.',
      inputSchema: { text: z.string().min(1).max(300), date: DATE.optional() },
    },
    async (a) => {
      const n = await now();
      try {
        const date = resolveDate(a.date, n.date);
        await store.putDay(uid, { date, intention: a.text.trim(), updatedAt: Date.now() });
        return text(`Intention for ${shortDate(date)}: ${a.text.trim()}`);
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );

  server.registerTool(
    'get_about_me',
    {
      title: 'About me and how I have been',
      description: "The person's own notes for Trinity (goals, weekly targets, usual day, how hard to push) and their recent check-ins (moods, how blocks went). Read this at the start of a conversation.",
      inputSchema: { days: z.number().int().min(1).max(30).optional().describe('How many days of check-ins. Default 7.') },
      annotations: { readOnlyHint: true },
    },
    async ({ days }) => {
      const n = await now();
      const since = addDays(n.date, -((days ?? 7) - 1));
      const checkins = (await store.listCheckins(uid, since)).sort((a, b) => a.at - b.at);
      const notify = { ...DEFAULT_NOTIFY, ...n.settings.notify };
      const lines = [
        `About me:\n${n.settings.profile?.trim() || '(not filled in yet: they can add it in Trinity → Settings → About you)'}`,
        '',
        checkins.length ? `Check-ins since ${shortDate(since)}:` : 'No check-ins recently.',
        ...checkins.map((c) => {
          const what = c.kind === 'mood' ? `felt ${c.mood ? MOOD_LABELS[c.mood].toLowerCase() : 'unknown'}` : `“${c.blockTitle ?? 'a block'}”: ${c.outcome}`;
          return `- ${shortDate(c.date)}${c.moment && c.moment !== 'anytime' ? ` ${c.moment}` : ''}: ${what}${c.note ? ` — “${c.note}”` : ''}`;
        }),
        '',
        `Reminders: ${notify.blockReminders ? `${notify.leadMinutes} min before blocks` : 'off before blocks'}; check-ins after blocks ${notify.checkIns ? 'on' : 'off'}; daily check-ins at ${[notify.morning, notify.midday, notify.evening].filter(Boolean).join(', ') || 'none'}.`,
      ];
      return text(lines.join('\n'));
    },
  );

  server.registerTool(
    'log_checkin',
    {
      title: 'Log how I am doing',
      description: 'Record how the person is feeling (when they tell you in conversation), so Trinity remembers it and adjusts.',
      inputSchema: {
        mood: z.enum(['great', 'good', 'meh', 'rough']).describe('Their overall state, in their words mapped to one of these.'),
        note: z.string().max(500).optional().describe('A short note in their words, e.g. "slept badly, low energy".'),
      },
    },
    async ({ mood, note }) => {
      const n = await now();
      const c: CheckIn = { id: newId('c'), at: Date.now(), date: n.date, kind: 'mood', moment: 'anytime', mood: mood as Mood, source: 'claude', ...(note ? { note } : {}) };
      await store.putCheckin(uid, c);
      return text(`Logged: feeling ${MOOD_LABELS[mood as Mood].toLowerCase()}${note ? ` (“${note}”)` : ''}.`);
    },
  );

  const AREA = z.enum(['sleep', 'food', 'exercise', 'mood', 'study', 'project', 'money', 'health', 'mind']);
  const scale = z.number().int().min(1).max(5);

  server.registerTool(
    'log_life',
    {
      title: 'Record something about my life',
      description:
        'Log sleep, food, exercise, mood, study, projects, money, health or mental health whenever the person mentions it ' +
        '("slept 6 hours", "had a burrito", "ran 3 miles", "spent $40 on groceries", "studied chemistry for an hour", "anxious today"). ' +
        'One entry per thing. Fill the numbers you can reasonably infer; put everything in summary too. ' +
        'For food, estimate calories and protein if they did not say. For money, amount is positive when spent and negative when earned.',
      inputSchema: {
        area: AREA,
        summary: z.string().min(1).max(500).describe('Plain words, as they said it.'),
        date: DATE.optional().describe('The day it is about. Defaults to today.'),
        hours: z.number().min(0).max(24).optional(),
        minutes: z.number().int().min(0).max(1440).optional(),
        quality: scale.optional().describe('1 (bad) to 5 (great), e.g. sleep quality.'),
        calories: z.number().int().min(0).max(10000).optional(),
        protein_g: z.number().min(0).max(500).optional(),
        amount: z.number().min(-1_000_000).max(1_000_000).optional(),
        mood: scale.optional(),
        energy: scale.optional(),
        stress: scale.optional(),
        project: z.string().max(120).optional(),
        kind: z.string().max(60).optional().describe('Short type, e.g. "run", "lunch", "groceries", "therapy".'),
      },
    },
    async (a) => {
      const n = await now();
      try {
        const date = resolveDate(a.date, n.date);
        const data: NonNullable<LifeEntry['data']> = {};
        for (const k of ['hours', 'minutes', 'quality', 'calories', 'protein_g', 'amount', 'mood', 'energy', 'stress', 'project', 'kind'] as const) {
          if (a[k] !== undefined) (data as Record<string, unknown>)[k] = a[k];
        }
        const e: LifeEntry = { id: newId('l'), at: Date.now(), date, area: a.area as LifeArea, summary: a.summary.trim(), source: 'claude', ...(Object.keys(data).length ? { data } : {}) };
        await store.putLife(uid, e);
        return text(`Logged ${LIFE_AREAS[e.area].toLowerCase()} for ${shortDate(date)}: ${e.summary} [id: ${e.id}]`);
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  );

  server.registerTool(
    'get_life_log',
    {
      title: 'Read my life log',
      description:
        'Entries and per-day totals for sleep, food, exercise, mood, study, projects, money, health and mental health, plus finished calendar time. ' +
        'Use it to spot patterns and to answer "how have I been sleeping?" or "what did I spend this week?".',
      inputSchema: {
        days: z.number().int().min(1).max(90).optional().describe('How many days back from today. Default 7.'),
        area: AREA.optional().describe('Only this area.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ days, area }) => {
      const n = await now();
      const count = days ?? 7;
      const from = addDays(n.date, -(count - 1));
      const entries = (await store.listLife(uid, from, n.date))
        .filter((e) => !area || e.area === area)
        .sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
      const checkins = area && area !== 'mood' ? [] : await store.listCheckins(uid, from);
      const blocks = area ? [] : await store.listBlocks(uid, from, n.date);
      const moodScore: Record<Mood, number> = { great: 5, good: 4, meh: 2.5, rough: 1 };
      const out: string[] = [`Life log, ${shortDate(from)} – ${shortDate(n.date)}${area ? ` (${LIFE_AREAS[area as LifeArea]})` : ''}:`];
      for (let i = 0; i < count; i++) {
        const d = addDays(from, i);
        const es = entries.filter((e) => e.date === d);
        const cs = checkins.filter((c) => c.date === d && c.kind === 'mood' && c.mood);
        const done = blocks.filter((b) => b.date === d && b.done && b.cat !== 'break');
        if (!es.length && !cs.length && !done.length) continue;
        const sum = (f: (e: LifeEntry) => number | undefined, ar: LifeArea) => es.filter((e) => e.area === ar).reduce((s, e) => s + (f(e) ?? 0), 0);
        const totals: string[] = [];
        const sleep = sum((e) => e.data?.hours, 'sleep');
        if (sleep) totals.push(`sleep ${sleep}h`);
        const ex = sum((e) => e.data?.minutes, 'exercise');
        if (ex) totals.push(`exercise ${ex} min`);
        const kcal = sum((e) => e.data?.calories, 'food');
        if (kcal) totals.push(`~${kcal} kcal`);
        const study = sum((e) => e.data?.minutes ?? (e.data?.hours ? e.data.hours * 60 : undefined), 'study');
        if (study) totals.push(`study ${duration(Math.round(study))}`);
        const money = sum((e) => e.data?.amount, 'money');
        if (money) totals.push(money > 0 ? `spent $${money.toFixed(2)}` : `net +$${(-money).toFixed(2)}`);
        const moods = [...es.filter((e) => e.data?.mood).map((e) => e.data!.mood!), ...cs.map((c) => moodScore[c.mood!])];
        if (moods.length) totals.push(`mood ${(moods.reduce((x, y) => x + y, 0) / moods.length).toFixed(1)}/5`);
        if (done.length) totals.push(`calendar: ${done.length} blocks done (${duration(done.reduce((s, b) => s + b.end - b.start, 0))})`);
        out.push('', `${shortDate(d)}${totals.length ? ` — ${totals.join(' · ')}` : ''}`);
        for (const e of es) out.push(`- ${LIFE_AREAS[e.area]}: ${e.summary} [id: ${e.id}]`);
        for (const c of cs) out.push(`- Check-in: felt ${MOOD_LABELS[c.mood!].toLowerCase()}${c.note ? ` — “${c.note}”` : ''}`);
      }
      if (out.length === 1) out.push('Nothing logged yet.');
      return text(out.join('\n'));
    },
  );

  server.registerTool(
    'delete_life_entry',
    {
      title: 'Remove a life-log entry',
      description: 'Remove a wrong or duplicate life-log entry by id.',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      const n = await now();
      const all = await store.listLife(uid, addDays(n.date, -365), addDays(n.date, 1));
      const e = all.find((x) => x.id === id);
      if (!e) return fail(`No life-log entry with id ${id}.`);
      await store.deleteLife(uid, id);
      return text(`Removed: ${e.summary}`);
    },
  );


  if (ctx.bridge) registerVaultTools(server, { store: ctx.bridge, uid });
  return server;
}

