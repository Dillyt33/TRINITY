import { describe, expect, it } from 'vitest';
import { dueReminders, runReminders, templateNotice, type DayContext, type Notice } from '../src/reminders';
import { MemoryPushStore, MemoryScheduleStore } from '../src/store';
import { MemoryChatStore } from '../src/assistant';
import type { Block } from '../../src/lib/types';

const blk = (id: string, start: number, end: number, over: Partial<Block> = {}): Block => ({
  id, date: '2026-11-21', start, end, title: id, cat: 'deep', done: false, notes: '', subtasks: [], source: 'app', createdAt: 0, updatedAt: 0, ...over,
});
const ctx = (now: number, blocks: Block[]): DayContext => ({ date: '2026-11-21', now, tz: 'America/New_York', blocks, intention: '', profile: '', recent: [] });

describe('dueReminders', () => {
  it('reminds a few minutes before a block, and checks in when it ends', () => {
    const b = blk('Gym', 16 * 60, 17 * 60, { cat: 'health' });
    expect(dueReminders(ctx(955, [b]), {}).map((r) => r.kind)).toEqual(['upnext']);
    expect(dueReminders(ctx(950, [b]), {})).toEqual([]);
    expect(dueReminders(ctx(960, [b]), {})).toEqual([]); // already started
    expect(dueReminders(ctx(1021, [b]), {}).map((r) => r.kind)).toEqual(['blockcheck']);
    expect(dueReminders(ctx(1040, [b]), {})).toEqual([]); // too long ago
  });

  it('skips done blocks, breaks, short blocks for check-ins, and quiet hours', () => {
    expect(dueReminders(ctx(955, [blk('a', 960, 1020, { done: true })]), {})).toEqual([]);
    expect(dueReminders(ctx(955, [blk('b', 960, 975, { cat: 'break' })]), {})).toEqual([]);
    expect(dueReminders(ctx(976, [blk('c', 960, 975)]), {})).toEqual([]); // 15-min block: no check-in
    expect(dueReminders(ctx(6 * 60 + 55, [blk('d', 7 * 60 - 0, 8 * 60)]), { quietEnd: '07:30' })).toEqual([]);
  });

  it('respects settings and daily check-in times', () => {
    const b = blk('Gym', 960, 1020);
    expect(dueReminders(ctx(945, [b]), { leadMinutes: 15 }).map((r) => r.kind)).toEqual(['upnext']);
    expect(dueReminders(ctx(955, [b]), { blockReminders: false })).toEqual([]);
    expect(dueReminders(ctx(8 * 60 + 3, []), {}).map((r) => r.kind)).toEqual(['morning']);
    expect(dueReminders(ctx(13 * 60, []), {}).map((r) => r.key)).toEqual(['midday_2026-11-21']);
    expect(dueReminders(ctx(13 * 60, []), { midday: null })).toEqual([]);
  });
});

describe('templateNotice', () => {
  it('writes plain reminders that open the right screen', () => {
    const b = blk('Deep work', 510, 630, { subtasks: [{ id: 's', text: 'Outline sections', done: false }] });
    const up = templateNotice({ kind: 'upnext', key: 'k', block: b }, ctx(505, [b]));
    expect(up).toMatchObject({ title: 'Trinity', url: '/?block=Deep%20work' });
    expect(up.body).toBe('Deep work in 5 min (8:30 – 10:30 AM). Start with: Outline sections.');
    const ci = templateNotice({ kind: 'blockcheck', key: 'k', block: b }, ctx(631, [b]));
    expect(ci.url).toBe('/checkin?kind=block&id=Deep%20work');
    const mid = templateNotice({ kind: 'midday', key: 'k' }, ctx(780, [blk('x', 500, 560, { done: true }), blk('y', 840, 900)]));
    expect(mid.body).toBe('Halfway check: 1 of 2 done. Next up is y at 2:00 PM. How are you holding up?');
    expect(ci.title).toBe('Trinity');
  });
});

describe('runReminders', () => {
  it('sends each reminder once to every device, uses the writer for check-ins, and drops dead devices', async () => {
    const schedule = new MemoryScheduleStore({ u1: { tz: 'America/New_York' } });
    await schedule.putBlock('u1', blk('Gym', 16 * 60, 17 * 60, { cat: 'health' }));
    await schedule.putBlock('u1', blk('Deep', 14 * 60, 15 * 60 + 55));
    const push = new MemoryPushStore();
    await push.putDevice('u1', { id: 'phone', endpoint: 'https://push/phone', keys: { p256dh: 'a', auth: 'b' }, label: 'iPhone', createdAt: 0 });
    await push.putDevice('u1', { id: 'old', endpoint: 'https://push/old', keys: { p256dh: 'a', auth: 'b' }, label: 'old', createdAt: 0 });
    const sent: { device: string; notice: Notice }[] = [];
    const send = async (d: { id: string }, n: Notice) => {
      if (d.id === 'old') return 'gone' as const;
      sent.push({ device: d.id, notice: n });
      return 'ok' as const;
    };
    const writer = { write: async (_r: unknown, _c: unknown, fb: Notice) => ({ ...fb, body: 'Written by Trinity' }) };
    // 3:56 PM in New York: Gym starts in 4 minutes, and Deep ended 1 minute ago.
    const clock = () => new Date('2026-11-21T20:56:00Z');
    const r1 = await runReminders({ schedule, push, send, writer, defaultTz: 'UTC', clock });
    expect(r1.sent).toBe(2);
    expect(sent.map((s) => s.notice.title)).toEqual(['Trinity', 'Trinity']);
    const checkin = sent.find((s) => s.notice.url.startsWith('/checkin'))!;
    expect(checkin.notice.body).toBe('Written by Trinity');
    const upnext = sent.find((s) => s.notice.url.startsWith('/?block='))!;
    expect(upnext.notice.body).toBe('Gym in 4 min (4:00 – 5:00 PM).');
    expect(await push.listDevices('u1')).toHaveLength(1); // the dead device was removed
    const r2 = await runReminders({ schedule, push, send, writer, defaultTz: 'UTC', clock });
    expect(r2.sent).toBe(0); // not sent twice
  });
});

describe('check-ins with Trinity’s chat set up', () => {
  it('opens a conversation with the check-in message and links the notification to it', async () => {
    const schedule = new MemoryScheduleStore({ u1: { tz: 'America/New_York' } });
    await schedule.putBlock('u1', blk('Deep', 14 * 60, 15 * 60 + 55));
    const push = new MemoryPushStore();
    await push.putDevice('u1', { id: 'phone', endpoint: 'https://push/phone', keys: { p256dh: 'a', auth: 'b' }, label: 'iPhone', createdAt: 0 });
    const chat = new MemoryChatStore();
    await chat.putAssistant('u1', { environmentId: 'env', agentId: 'agent', agentVersion: 1, vaultId: 'vlt', mcpUrl: 'https://x/mcp', personaVersion: '3', createdAt: 0, updatedAt: 0 });
    const sent: Notice[] = [];
    let n = 0;
    await runReminders({
      schedule, push, chat, newId: (p) => `${p}${++n}`,
      send: async (_d, notice) => { sent.push(notice); return 'ok' as const; },
      defaultTz: 'UTC',
      clock: () => new Date('2026-11-21T20:56:00Z'),
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('/chat?c=cv1');
    expect(sent[0].body).toBe('Deep just wrapped. How did it go?');
    expect(await chat.getConversation('u1', 'cv1')).toMatchObject({ kind: 'checkin', opener: 'Deep just wrapped. How did it go?', sessionId: null });
    expect(chat.messages.get('u1/cv1')).toEqual([expect.objectContaining({ role: 'trinity', text: 'Deep just wrapped. How did it go?', status: 'done' })]);
  });
});
