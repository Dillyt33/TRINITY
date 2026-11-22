import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryScheduleStore } from '../src/store';
import { buildServer, parseTime, resolveDate } from '../src/tools';

// Saturday Nov 21 2026, 10:12 AM in New York = 15:12 UTC
const CLOCK = () => new Date('2026-11-21T15:12:00Z');

async function connect(store: MemoryScheduleStore) {
  const server = buildServer({ store, uid: 'u1', clock: CLOCK });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content.map((c) => c.text).join('\n'), isError: !!r.isError };
  };
  return { client, call };
}

describe('helpers', () => {
  it('reads dates relative to today', () => {
    expect(resolveDate(undefined, '2026-11-21')).toBe('2026-11-21');
    expect(resolveDate('tomorrow', '2026-11-21')).toBe('2026-11-22');
    expect(resolveDate('tuesday', '2026-11-21')).toBe('2026-11-24');
    expect(resolveDate('saturday', '2026-11-21')).toBe('2026-11-21');
    expect(resolveDate('next saturday', '2026-11-21')).toBe('2026-11-28');
    expect(() => resolveDate('someday', '2026-11-21')).toThrow();
  });
  it('reads times', () => {
    expect(parseTime('14:30')).toBe(870);
    expect(parseTime('2:30pm')).toBe(870);
    expect(parseTime('9am')).toBe(540);
    expect(parseTime('12am')).toBe(0);
    expect(parseTime('3')).toBe(900);
    expect(parseTime('noon')).toBe(720);
    expect(() => parseTime('late')).toThrow();
  });
});

describe('Trinity tools', () => {
  let store: MemoryScheduleStore;
  beforeEach(() => {
    store = new MemoryScheduleStore({ u1: { tz: 'America/New_York' } });
  });

  it('lists the tools', async () => {
    const { client } = await connect(store);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['add_block', 'add_todo', 'complete_todo', 'delete_block', 'find_free_time', 'get_schedule', 'quick_add', 'schedule_todo', 'set_intention', 'update_block'].sort(),
    );
    expect(tools.find((t) => t.name === 'delete_block')?.annotations?.destructiveHint).toBe(true);
  });

  it('adds, reads, moves, completes and deletes blocks in the person’s time zone', async () => {
    const { call } = await connect(store);
    const add = await call('add_block', { title: 'Deep work', start: '9:30am', duration_minutes: 90, category: 'deep' });
    expect(add.text).toContain('Added “Deep work” on Sat, Nov 21, 9:30 – 11:00 AM');
    const id = add.text.match(/\[id: (b\w+)\]/)![1];

    const sched = await call('get_schedule');
    expect(sched.text).toContain('Today is Saturday, November 21 (2026-11-21). Time now: 10:12 AM (America/New_York).');
    expect(sched.text).toContain('Happening now: Deep work, 48 min left.');
    expect(sched.text).toContain(`[id: ${id}]`);

    const moved = await call('update_block', { id, start: '1pm' });
    expect(moved.text).toContain('1:00 – 2:30 PM');
    const done = await call('update_block', { id, done: true });
    expect(done.text).toContain('Marked done');
    const saved = await store.getBlock('u1', id);
    expect(saved).toMatchObject({ start: 780, end: 870, done: true, source: 'claude', date: '2026-11-21' });

    const del = await call('delete_block', { id });
    expect(del.text).toContain('Deleted “Deep work”');
    expect(await store.getBlock('u1', id)).toBeNull();
  });

  it('warns about overlaps and finds free time after now', async () => {
    const { call } = await connect(store);
    await call('add_block', { title: 'Call with Sam', start: '11:00', end: '12:00', category: 'meet' });
    const clash = await call('add_block', { title: 'Lunch', start: '11:30am', duration_minutes: 60 });
    expect(clash.text).toContain('overlaps “Call with Sam”');
    const free = await call('find_free_time', { duration_minutes: 45 });
    expect(free.text).toContain('10:15 – 11:00 AM');
    expect(free.text).toContain('12:30');
  });

  it('quick add handles blocks and to-dos, and to-dos can be scheduled', async () => {
    const { call } = await connect(store);
    const q = await call('quick_add', { text: 'gym tomorrow 6pm 1h #health' });
    expect(q.text).toContain('Added “Gym” on Sun, Nov 22, 6:00 – 7:00 PM');
    const todo = await call('quick_add', { text: 'renew passport ~20m' });
    expect(todo.text).toContain('Added to-do “Renew passport” (~20m)');
    const tid = todo.text.match(/\[id: (t\w+)\]/)![1];
    const sch = await call('schedule_todo', { id: tid });
    expect(sch.text).toContain('Scheduled “Renew passport” on Sat, Nov 21, 10:15 – 10:35 AM');
    expect(await store.getTask('u1', tid)).toBeNull();
  });

  it('sets the intention and reports bad input as tool errors', async () => {
    const { call } = await connect(store);
    expect((await call('set_intention', { text: 'Ship the draft' })).text).toContain('Ship the draft');
    expect((await call('get_schedule')).text).toContain('intention: Ship the draft');
    expect((await call('add_block', { title: 'X', start: 'whenever' })).isError).toBe(true);
    expect((await call('update_block', { id: 'nope', done: true })).isError).toBe(true);
  });
});
