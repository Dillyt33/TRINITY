import { describe, expect, it } from 'vitest';
import { findFreeSlot, layoutColumns } from '../src/lib/layout';
import { monthGrid, weekOf, timeRange, duration } from '../src/lib/time';

describe('layoutColumns', () => {
  it('keeps non-overlapping blocks full width', () => {
    const m = layoutColumns([{ id: 'a', start: 0, end: 60 }, { id: 'b', start: 60, end: 120 }]);
    expect(m.get('a')).toEqual({ col: 0, cols: 1 });
    expect(m.get('b')).toEqual({ col: 0, cols: 1 });
  });

  it('splits overlapping blocks into columns', () => {
    const m = layoutColumns([
      { id: 'a', start: 0, end: 120 },
      { id: 'b', start: 30, end: 60 },
      { id: 'c', start: 60, end: 90 },
    ]);
    expect(m.get('a')).toEqual({ col: 0, cols: 2 });
    expect(m.get('b')).toEqual({ col: 1, cols: 2 });
    expect(m.get('c')).toEqual({ col: 1, cols: 2 });
  });
});

describe('findFreeSlot', () => {
  it('finds the first gap', () => {
    const busy = [{ start: 540, end: 600 }, { start: 600, end: 660 }, { start: 720, end: 780 }];
    expect(findFreeSlot(busy, 60, 540, 480, 1320)).toBe(660);
    expect(findFreeSlot(busy, 90, 540, 480, 1320)).toBe(780);
    expect(findFreeSlot(busy, 30, 0, 480, 1320)).toBe(480);
    expect(findFreeSlot(busy, 600, 540, 480, 1320)).toBeNull();
  });
});

describe('time helpers', () => {
  it('builds a Sunday-first November 2026 grid', () => {
    const g = monthGrid('2026-11-21', 0);
    expect(g[0]).toEqual({ date: '2026-11-01', day: 1, inMonth: true });
    expect(g).toHaveLength(35);
  });
  it('builds a Monday-first grid', () => {
    const g = monthGrid('2026-11-21', 1);
    expect(g[0].date).toBe('2026-10-26');
    expect(g).toHaveLength(42);
  });
  it('lists the week', () => {
    expect(weekOf('2026-11-21', 0)[0]).toBe('2026-11-15');
    expect(weekOf('2026-11-21', 1)[0]).toBe('2026-11-16');
  });
  it('formats ranges and durations', () => {
    expect(timeRange(510, 630)).toBe('8:30 – 10:30 AM');
    expect(timeRange(660, 720)).toBe('11:00 AM – 12:00 PM');
    expect(duration(90)).toBe('1h 30m');
    expect(duration(45)).toBe('45m');
  });
});
