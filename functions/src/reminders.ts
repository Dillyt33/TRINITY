import { addDays, clockAp, duration, timeRange } from '../../src/lib/time';
import { DEFAULT_NOTIFY, MOOD_LABELS, type Block, type CheckIn, type NotifySettings } from '../../src/lib/types';
import type { PushDevice, PushStore, ScheduleStore } from './store';
import { startCheckinConversation, type ChatStore } from './assistant';
import { nowIn } from './zone';

export type ReminderKind = 'upnext' | 'blockcheck' | 'morning' | 'midday' | 'evening';

export interface Reminder {
  kind: ReminderKind;
  key: string;
  block?: Block;
}

/** What the phone shows. `url` is where tapping it goes inside Trinity. */
export interface Notice {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface DayContext {
  date: string;
  now: number;
  tz: string;
  blocks: Block[];
  intention: string;
  profile: string;
  recent: CheckIn[];
}

/** Writes nicer text (Claude, in Trinity's voice). Falls back to the template on any problem. */
export interface Writer {
  write(r: Reminder, ctx: DayContext, fallback: Notice): Promise<Notice>;
}

export type Sender = (d: PushDevice, n: Notice) => Promise<'ok' | 'gone' | 'error'>;

export function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function inQuiet(min: number, n: NotifySettings): boolean {
  const s = toMinutes(n.quietStart);
  const e = toMinutes(n.quietEnd);
  if (s === null || e === null || s === e) return false;
  return s < e ? min >= s && min < e : min >= s || min < e;
}

const WINDOW = 15; // minutes a reminder stays eligible (covers a missed scheduler run)

/** Which reminders are due right now. Pure, so it's easy to test. */
export function dueReminders(ctx: DayContext, notify: Partial<NotifySettings> | undefined): Reminder[] {
  const n = { ...DEFAULT_NOTIFY, ...notify };
  const out: Reminder[] = [];
  for (const b of ctx.blocks) {
    if (b.done || b.cat === 'break') continue;
    const until = b.start - ctx.now;
    if (n.blockReminders && until > 0 && until <= n.leadMinutes && !inQuiet(b.start, n)) {
      out.push({ kind: 'upnext', key: `up_${ctx.date}_${b.id}_${b.start}`, block: b });
    }
    const since = ctx.now - b.end;
    if (n.checkIns && since >= 0 && since < WINDOW && b.end - b.start >= 25 && !inQuiet(ctx.now, n)) {
      out.push({ kind: 'blockcheck', key: `ci_${ctx.date}_${b.id}_${b.end}`, block: b });
    }
  }
  for (const moment of ['morning', 'midday', 'evening'] as const) {
    const t = toMinutes(n[moment]);
    if (t !== null && ctx.now >= t && ctx.now - t < WINDOW) out.push({ kind: moment, key: `${moment}_${ctx.date}` });
  }
  return out.slice(0, 3);
}

/** Plain, no-AI wording, like a text from a person. Also the fallback when Claude isn't set up. */
export function templateNotice(r: Reminder, ctx: DayContext): Notice {
  const real = ctx.blocks.filter((b) => b.cat !== 'break');
  const done = real.filter((b) => b.done).length;
  const next = real.find((b) => !b.done && b.start > ctx.now);
  const b = r.block;
  const t = (body: string, url: string): Notice => ({ title: 'Trinity', body, url, tag: r.key });
  switch (r.kind) {
    case 'upnext': {
      const step = b!.subtasks.find((s) => !s.done);
      return t(`${b!.title} in ${b!.start - ctx.now} min (${timeRange(b!.start, b!.end)}).${step ? ` Start with: ${step.text}.` : ''}`, `/?block=${encodeURIComponent(b!.id)}`);
    }
    case 'blockcheck':
      return t(`${b!.title} just wrapped. How did it go?`, `/checkin?kind=block&id=${encodeURIComponent(b!.id)}`);
    case 'morning':
      return t(
        real.length
          ? `Morning! ${real.length} blocks today${ctx.intention ? `, and the one that matters is ${ctx.intention}` : next ? `, starting with ${next.title} at ${clockAp(next.start)}` : ''}. How did you sleep?`
          : 'Morning! Nothing planned yet. How did you sleep, and what should today look like?',
        '/checkin?kind=mood&moment=morning',
      );
    case 'midday':
      return t(`Halfway check: ${done} of ${real.length} done.${next ? ` Next up is ${next.title} at ${clockAp(next.start)}.` : ''} How are you holding up?`, '/checkin?kind=mood&moment=midday');
    case 'evening':
      return t(real.length ? `Day's winding down: ${done} of ${real.length} done. How was today?` : 'How was today?', '/checkin?kind=mood&moment=evening');
  }
}

/** A short text version of the day, for Claude when it writes a notification. */
export function describeDay(ctx: DayContext): string {
  const lines = ctx.blocks.map((b) => `- ${timeRange(b.start, b.end)} ${b.title} (${b.cat}${b.done ? ', done' : ''}${b.subtasks.length ? `, checklist ${b.subtasks.filter((s) => s.done).length}/${b.subtasks.length}` : ''})`);
  const real = ctx.blocks.filter((b) => b.cat !== 'break');
  const recent = ctx.recent
    .slice(-6)
    .map((c) => `- ${c.date}: ${c.kind === 'mood' ? `felt ${c.mood ? MOOD_LABELS[c.mood].toLowerCase() : '?'}` : `${c.blockTitle ?? 'a block'}: ${c.outcome}`}${c.note ? ` (“${c.note}”)` : ''}`);
  return [
    `Time now: ${clockAp(ctx.now)} on ${ctx.date}.`,
    ctx.intention ? `Today's intention: ${ctx.intention}` : '',
    `Today's blocks (${real.filter((b) => b.done).length} of ${real.length} done, ${duration(real.reduce((a, b) => a + b.end - b.start, 0))} planned):`,
    ...(lines.length ? lines : ['- nothing planned']),
    recent.length ? 'Recent check-ins:' : '',
    ...recent,
  ]
    .filter(Boolean)
    .join('\n');
}

export interface RunDeps {
  schedule: ScheduleStore;
  push: PushStore;
  send: Sender;
  writer?: Writer | null;
  /** When Trinity's chat is set up, check-ins open a conversation instead of the quick check-in screen. */
  chat?: ChatStore | null;
  newId?: (prefix: string) => string;
  defaultTz: string;
  clock?: () => Date;
  log?: (msg: string) => void;
}

/** One pass over everyone with notifications on. Called every couple of minutes. */
export async function runReminders(deps: RunDeps): Promise<{ users: number; sent: number }> {
  let sent = 0;
  const users = await deps.push.listPushUsers();
  for (const uid of users) {
    const devices = await deps.push.listDevices(uid);
    if (!devices.length) continue;
    const settings = await deps.schedule.getSettings(uid);
    const tz = settings.tz || deps.defaultTz;
    const { date, minutes } = nowIn(tz, deps.clock?.() ?? new Date());
    const blocks = (await deps.schedule.listBlocks(uid, date, date)).sort((a, b) => a.start - b.start);
    const base: DayContext = { date, now: minutes, tz, blocks, intention: '', profile: settings.profile ?? '', recent: [] };
    const due = dueReminders(base, settings.notify);
    if (!due.length) continue;
    const ctx: DayContext = {
      ...base,
      intention: (await deps.schedule.getDay(uid, date))?.intention ?? '',
      recent: (await deps.schedule.listCheckins(uid, addDays(date, -3))).sort((a, b) => a.at - b.at),
    };
    for (const r of due) {
      if (!(await deps.push.markSent(uid, r.key))) continue;
      const plain = templateNotice(r, ctx);
      let notice = plain;
      if (deps.writer && r.kind !== 'upnext') {
        try {
          notice = await deps.writer.write(r, ctx, plain);
        } catch (e) {
          deps.log?.(`writer failed, using template: ${(e as Error).message}`);
        }
      }
      if (r.kind !== 'upnext' && deps.chat && deps.newId && (await deps.chat.getAssistant(uid))) {
        const conversationId = await startCheckinConversation({ chat: deps.chat, newId: deps.newId }, uid, notice.body);
        notice = { ...notice, url: `/chat?c=${encodeURIComponent(conversationId)}` };
      }
      for (const d of devices) {
        const result = await deps.send(d, notice);
        if (result === 'gone') await deps.push.deleteDevice(uid, d.id);
        if (result === 'ok') sent++;
      }
    }
  }
  return { users: users.length, sent };
}
