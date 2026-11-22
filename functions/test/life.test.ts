import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryScheduleStore } from '../src/store';
import { buildServer } from '../src/tools';

// Saturday Nov 21 2026, 10:12 AM in New York
const CLOCK = () => new Date('2026-11-21T15:12:00Z');

async function connect(store: MemoryScheduleStore) {
  const server = buildServer({ store, uid: 'u1', clock: CLOCK });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    return { text: r.content.map((c) => c.text).join('\n'), isError: !!r.isError };
  };
}

describe('life log', () => {
  it('records entries across areas and reports per-day totals', async () => {
    const store = new MemoryScheduleStore({ u1: { tz: 'America/New_York' } });
    const call = await connect(store);
    await call('log_life', { area: 'sleep', summary: 'Slept 6 hours, woke up twice', date: 'yesterday', hours: 6, quality: 2 });
    await call('log_life', { area: 'sleep', summary: 'Slept 7.5 hours', hours: 7.5 });
    await call('log_life', { area: 'food', summary: 'Burrito for lunch', calories: 900, protein_g: 35, kind: 'lunch' });
    await call('log_life', { area: 'exercise', summary: 'Ran 3 miles', minutes: 30, kind: 'run' });
    await call('log_life', { area: 'money', summary: 'Groceries', amount: 42.5, kind: 'groceries' });
    await call('log_life', { area: 'mind', summary: 'Anxious about the deadline', stress: 4, mood: 2 });

    const log = await call('get_life_log', { days: 2 });
    expect(log.text).toContain('Fri, Nov 20 — sleep 6h');
    expect(log.text).toContain('Sat, Nov 21 — sleep 7.5h · exercise 30 min · ~900 kcal · spent $42.50 · mood 2.0/5');
    expect(log.text).toContain('- Mental health: Anxious about the deadline');

    const onlySleep = await call('get_life_log', { days: 2, area: 'sleep' });
    expect(onlySleep.text).not.toContain('Burrito');

    const id = log.text.match(/Groceries \[id: (l\w+)\]/)![1];
    expect((await call('delete_life_entry', { id })).text).toBe('Removed: Groceries');
    expect((await call('log_life', { area: 'sleep', summary: 'x', date: 'someday' })).isError).toBe(true);
  });
});
