import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '../src/lib/parse';

const TODAY = '2026-11-21'; // a Saturday

describe('parseQuickAdd', () => {
  it('parses time, duration and tag', () => {
    const p = parseQuickAdd('Gym 6pm 1h #health', TODAY)!;
    expect(p).toMatchObject({ title: 'Gym', cat: 'health', date: TODAY, start: 18 * 60, duration: 60 });
  });

  it('parses tomorrow and a range with shared meridiem', () => {
    const p = parseQuickAdd('call mom tomorrow 3-3:30pm', TODAY)!;
    expect(p).toMatchObject({ title: 'Call mom', cat: 'meet', date: '2026-11-22', start: 15 * 60, duration: 30 });
  });

  it('handles 11-1pm as late morning to afternoon', () => {
    const p = parseQuickAdd('workshop 11-1pm', TODAY)!;
    expect(p.start).toBe(11 * 60);
    expect(p.duration).toBe(120);
  });

  it('parses weekday names to the next occurrence', () => {
    expect(parseQuickAdd('dentist tuesday at 2 for an hour', TODAY)).toMatchObject({
      title: 'Dentist', date: '2026-11-24', start: 14 * 60, duration: 60, cat: 'health',
    });
    expect(parseQuickAdd('brunch saturday 11am', TODAY)!.date).toBe(TODAY);
    expect(parseQuickAdd('brunch next saturday 11am', TODAY)!.date).toBe('2026-11-28');
  });

  it('assumes PM for small hours and evening words', () => {
    expect(parseQuickAdd('pick up package at 4', TODAY)!.start).toBe(16 * 60);
    expect(parseQuickAdd('dinner with friends friday at 7', TODAY)!.start).toBe(19 * 60);
    expect(parseQuickAdd('standup at 9', TODAY)!.start).toBe(9 * 60);
  });

  it('parses compound and decimal durations', () => {
    expect(parseQuickAdd('deep work 9am 1h30', TODAY)!.duration).toBe(90);
    expect(parseQuickAdd('studio 2pm for 1.5 hours', TODAY)!.duration).toBe(90);
    expect(parseQuickAdd('review notes 10am 45 min', TODAY)!.duration).toBe(45);
  });

  it('leaves the start empty when there is no time', () => {
    const p = parseQuickAdd('Renew passport ~20m #admin', TODAY)!;
    expect(p).toMatchObject({ title: 'Renew passport', start: null, duration: 20, cat: 'admin' });
  });

  it('parses month dates and rolls into next year when past', () => {
    expect(parseQuickAdd('flight dec 3 8am', TODAY)!.date).toBe('2026-12-03');
    expect(parseQuickAdd('taxes jan 15', TODAY)!.date).toBe('2027-01-15');
    expect(parseQuickAdd('party 11/28 8pm', TODAY)!.date).toBe('2026-11-28');
  });

  it('does not treat ordinary words as months', () => {
    const p = parseQuickAdd('meeting 3 to 4', TODAY)!;
    expect(p.title).toBe('Meeting');
    expect(p.start).toBe(15 * 60);
    expect(p.duration).toBe(60);
  });

  it('returns null for empty input', () => {
    expect(parseQuickAdd('   ', TODAY)).toBeNull();
  });
});
