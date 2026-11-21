export const MIN_PER_DAY = 24 * 60;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as a local date at midnight. */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayIso(now = new Date()): string {
  return isoDate(now);
}

export function addDays(iso: string, n: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekday(iso: string): number {
  return fromIso(iso).getDay();
}

export function nowMinutes(now = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function snapTo(min: number, step: number): number {
  return Math.round(min / step) * step;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** 24h "HH:MM" used in Markdown. */
export function hhmm(min: number): string {
  const m = ((min % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "9:30" (12h, no suffix). */
export function clock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}:${pad(m)}`;
}

export function meridiem(min: number): 'AM' | 'PM' {
  return Math.floor(min / 60) % 24 >= 12 ? 'PM' : 'AM';
}

/** "9:30 AM" */
export function clockAp(min: number): string {
  return `${clock(min)} ${meridiem(min)}`;
}

/** "8:30 – 10:30 AM" or "11:00 AM – 12:00 PM" */
export function timeRange(start: number, end: number): string {
  return meridiem(start) === meridiem(end)
    ? `${clock(start)} – ${clock(end)} ${meridiem(end)}`
    : `${clockAp(start)} – ${clockAp(end)}`;
}

/** "1h 30m", "45m" */
export function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "Saturday, November 21" */
export function longDate(iso: string): string {
  const d = fromIso(iso);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "Sat, Nov 21" */
export function shortDate(iso: string): string {
  const d = fromIso(iso);
  return `${WEEKDAYS[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function monthTitle(iso: string): string {
  const d = fromIso(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function firstOfMonth(iso: string): string {
  const d = fromIso(iso);
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function addMonths(iso: string, n: number): string {
  const d = fromIso(iso);
  return isoDate(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export interface MonthCell {
  date: string;
  day: number;
  inMonth: boolean;
}

/** Calendar grid for the month containing `iso`, padded to full weeks. */
export function monthGrid(iso: string, weekStart: 0 | 1): MonthCell[] {
  const first = fromIso(firstOfMonth(iso));
  const month = first.getMonth();
  const lead = (first.getDay() - weekStart + 7) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - lead);
  const cells: MonthCell[] = [];
  const cur = new Date(start);
  do {
    for (let i = 0; i < 7; i++) {
      cells.push({ date: isoDate(cur), day: cur.getDate(), inMonth: cur.getMonth() === month });
      cur.setDate(cur.getDate() + 1);
    }
  } while (cur.getMonth() === month);
  return cells;
}

/** Days of the week containing `iso`. */
export function weekOf(iso: string, weekStart: 0 | 1): string[] {
  const lead = (weekday(iso) - weekStart + 7) % 7;
  const start = addDays(iso, -lead);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekdayLetters(weekStart: 0 | 1): string[] {
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return weekStart === 1 ? [...letters.slice(1), letters[0]] : letters;
}

export function weekdayShort(weekStart: 0 | 1): string[] {
  const names = WEEKDAYS.map((w) => w.slice(0, 3));
  return weekStart === 1 ? [...names.slice(1), names[0]] : names;
}
