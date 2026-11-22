import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { findFreeSlot } from '../../src/lib/layout';
import { guessCategory, parseQuickAdd } from '../../src/lib/parse';
import { addDays, clockAp, duration, hhmm, longDate, shortDate, timeRange, weekday } from '../../src/lib/time';
import { CATEGORY_NAMES, DEFAULT_SETTINGS, type Block, type CategoryId, type Subtask, type Task } from '../../src/lib/types';
import type { ScheduleStore } from './store';
import { nowIn } from './zone';

export interface ToolContext {
  store: ScheduleStore;
  uid: string;
  /** Used when the person's settings don't include a time zone yet. */
  defaultTz?: string;
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

  return server;
}

