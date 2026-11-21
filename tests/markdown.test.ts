import { describe, expect, it } from 'vitest';
import { dayToMarkdown, parseDayMarkdown } from '../src/lib/markdown';
import type { Block, Task } from '../src/lib/types';

const block = (over: Partial<Block>): Block => ({
  id: 'b', date: '2026-11-21', start: 510, end: 630, title: 'Deep work', cat: 'deep', done: false,
  notes: '', subtasks: [], source: 'app', createdAt: 0, updatedAt: 0, ...over,
});

describe('markdown', () => {
  it('round-trips a day', () => {
    const blocks = [
      block({ id: 'a', start: 420, end: 465, title: 'Morning routine', cat: 'health', done: true }),
      block({ id: 'b', subtasks: [{ id: '1', text: 'Outline', done: true }, { id: '2', text: 'Send to Alex', done: false }], notes: 'Use last deck.\nKeep it short.' }),
      block({ id: 'c', start: 660, end: 720, title: 'Call with Sam', cat: 'meet', source: 'claude' }),
    ];
    const tasks: Task[] = [{ id: 't', title: 'Reply to landlord', estimate: 15, cat: 'admin', done: false, createdAt: 0, updatedAt: 0 }];
    const md = dayToMarkdown('2026-11-21', 'Ship it', blocks, tasks);
    expect(md).toContain('- [x] 07:00-07:45 Morning routine #health');
    expect(md).toContain('- [ ] 11:00-12:00 Call with Sam #meet ✦');
    const back = parseDayMarkdown(md);
    expect(back.date).toBe('2026-11-21');
    expect(back.intention).toBe('Ship it');
    expect(back.blocks).toHaveLength(3);
    expect(back.blocks[1]).toMatchObject({ start: 510, end: 630, title: 'Deep work', cat: 'deep', notes: 'Use last deck.\nKeep it short.' });
    expect(back.blocks[1].subtasks.map((s) => [s.text, s.done])).toEqual([['Outline', true], ['Send to Alex', false]]);
    expect(back.blocks[2].byClaude).toBe(true);
    expect(back.tasks).toEqual([{ title: 'Reply to landlord', estimate: 15, cat: 'admin', done: false }]);
  });

  it('accepts Day Planner style spacing and unknown tags', () => {
    const back = parseDayMarkdown('- [ ] 09:00 - 10:30 Write #focus\n- [ ] 13:00 - 14:00 Lunch\n');
    expect(back.blocks.map((b) => [b.start, b.end, b.title, b.cat])).toEqual([
      [540, 630, 'Write', 'deep'],
      [780, 840, 'Lunch', 'personal'],
    ]);
  });
});
