import type { CategoryId } from './types';
import { addDays, weekday } from './time';

export interface QuickAdd {
  title: string;
  cat: CategoryId;
  date: string;
  /** Minutes after midnight, or null when no time was given (goes to Unscheduled). */
  start: number | null;
  duration: number;
  dateGiven: boolean;
}

const TAG_ALIASES: Record<string, CategoryId> = {
  deep: 'deep', work: 'deep', focus: 'deep', study: 'deep', write: 'deep', writing: 'deep', studio: 'deep', music: 'deep',
  meet: 'meet', meeting: 'meet', meetings: 'meet', call: 'meet', calls: 'meet', sync: 'meet',
  health: 'health', gym: 'health', fitness: 'health', run: 'health', workout: 'health', sleep: 'health',
  personal: 'personal', family: 'personal', home: 'personal', social: 'personal', fun: 'personal', friends: 'personal',
  admin: 'admin', errand: 'admin', errands: 'admin', chores: 'admin', email: 'admin', finance: 'admin',
  break: 'break', rest: 'break',
};

export function categoryFromTag(tag: string): CategoryId | null {
  return TAG_ALIASES[tag.toLowerCase()] ?? null;
}

export function guessCategory(title: string): CategoryId {
  const t = title.toLowerCase();
  if (/\b(gym|run|running|yoga|walk|swim|workout|lift|stretch|doctor|dentist|therapy|meditat\w*|sleep|nap)\b/.test(t)) return 'health';
  if (/\b(call|meet|meeting|sync|1:1|interview|standup|zoom|review with|chat with)\b/.test(t)) return 'meet';
  if (/\b(email|inbox|bills?|errands?|taxes|tax|invoice|admin|groceries|laundry|clean|passport|bank)\b/.test(t)) return 'admin';
  if (/\b(break|rest|coffee)\b/.test(t)) return 'break';
  if (/\b(deep work|focus|write|writing|study|code|coding|design|research|draft|studio|mix|master|practice|read)\b/.test(t)) return 'deep';
  return 'personal';
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function to24(h: number, m: number, mer: string | undefined, evening: boolean): number {
  const p = (mer || '').toLowerCase();
  if (p.startsWith('p') && h < 12) h += 12;
  else if (p.startsWith('a') && h === 12) h = 0;
  else if (!p) {
    if (evening && h < 12) h += 12;
    else if (h >= 1 && h <= 6) h += 12; // "at 3" means 3 PM
  }
  return h * 60 + m;
}

/**
 * Parse a quick-add phrase such as "gym tomorrow 6pm 1h #health" or "call mom fri 3-3:30pm".
 * `today` is the YYYY-MM-DD the phrase is relative to.
 */
export function parseQuickAdd(input: string, today: string, defaultDuration = 60): QuickAdd | null {
  let s = ` ${input.trim()} `;
  if (!s.trim()) return null;
  const cut = (m: RegExpMatchArray | null) => {
    if (m) s = s.replace(m[0], ' ');
    return m;
  };

  // #tag
  let cat: CategoryId | null = null;
  const tag = cut(s.match(/\s#([a-z][\w-]*)/i));
  if (tag) cat = categoryFromTag(tag[1]) ?? 'personal';

  // Durations: "for 45m", "1h30", "1.5 hours", "~30m", "half an hour", "an hour"
  let dur: number | null = null;
  const hm = cut(s.match(/\s(?:for\s+|~)?(\d+)\s*h(?:ours?|rs?)?\s*(\d{1,2})\s*(?:m|mins?|minutes?)?(?=\s)/i));
  if (hm) dur = Number(hm[1]) * 60 + Number(hm[2]);
  if (dur === null) {
    const d = cut(s.match(/\s(?:for\s+|~)?(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|m|mins?|minutes?)(?=\s)/i));
    if (d) dur = Math.round(Number(d[1]) * (d[2][0].toLowerCase() === 'h' ? 60 : 1));
  }
  if (dur === null && cut(s.match(/\s(?:for\s+)?half\s+an?\s+hour(?=\s)/i))) dur = 30;
  if (dur === null && cut(s.match(/\s(?:for\s+)?an?\s+hour(?=\s)/i))) dur = 60;

  // Dates
  let date = today;
  let dateGiven = false;
  const evening = /\b(tonight|dinner|drinks|party|movie|concert|date night)\b/i.test(s);
  if (cut(s.match(/\s(?:today|tonight)(?=\s)/i))) dateGiven = true;
  else if (cut(s.match(/\s(?:tomorrow|tmrw|tmr)(?=\s)/i))) { date = addDays(today, 1); dateGiven = true; }
  else {
    const inDays = cut(s.match(/\sin\s+(\d+)\s+days?(?=\s)/i));
    if (inDays) { date = addDays(today, Number(inDays[1])); dateGiven = true; }
  }
  if (!dateGiven) {
    const wd = cut(s.match(/\s(?:on\s+)?(next\s+)?(sun|mon|tues?|wed|weds|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?(?=\s)/i));
    if (wd) {
      const target = DAY_NAMES[wd[2].toLowerCase()];
      let delta = (target - weekday(today) + 7) % 7;
      if (wd[1] && delta === 0) delta = 7;
      date = addDays(today, delta);
      dateGiven = true;
    }
  }
  if (!dateGiven) {
    let month: number | null = null;
    let dayNum: number | null = null;
    const md = cut(s.match(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?=\s)/));
    if (md) {
      month = Number(md[1]) - 1;
      dayNum = Number(md[2]);
    } else {
      for (const mn of s.matchAll(/\s(?:on\s+)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?=\s)/gi)) {
        const idx = MONTH_NAMES[mn[1].toLowerCase()];
        if (idx === undefined) continue;
        cut(mn);
        month = idx;
        dayNum = Number(mn[2]);
        break;
      }
    }
    if (month !== null && dayNum !== null) {
      const [ty] = today.split('-').map(Number);
      let y = ty;
      const candidate = `${y}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      if (candidate < today) y += 1;
      date = `${y}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      dateGiven = true;
    }
  }

  // Times: ranges first ("3-4pm", "from 9 to 10:30", "11am–1pm")
  let start: number | null = null;
  let end: number | null = null;
  const rng = cut(s.match(/\s(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?(?=\s)/i));
  if (rng) {
    const endMer = rng[6];
    let startMer = rng[3];
    const sh = Number(rng[1]);
    const eh = Number(rng[4]);
    if (!startMer && endMer) {
      // "11-1pm" → 11 AM; "3-4pm" → 3 PM
      startMer = endMer;
      const asSame = to24(sh, Number(rng[2] || 0), startMer, false);
      const e = to24(eh, Number(rng[5] || 0), endMer, false);
      if (asSame > e) startMer = endMer.toLowerCase().startsWith('p') ? 'am' : 'pm';
    }
    start = to24(sh, Number(rng[2] || 0), startMer, evening);
    end = to24(eh, Number(rng[5] || 0), endMer || startMer, evening);
    if (end <= start) end += 12 * 60;
  } else {
    const t =
      cut(s.match(/\s(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s)/i)) ||
      cut(s.match(/\s(?:at|@)\s*(\d{1,2})(?::(\d{2}))?(?=\s)/i)) ||
      cut(s.match(/\s(\d{1,2}):(\d{2})(?=\s)/));
    if (t) start = to24(Number(t[1]), Number(t[2] || 0), t[3], evening);
    else if (cut(s.match(/\s(?:at\s+)?noon(?=\s)/i))) start = 12 * 60;
  }

  const duration = end !== null && start !== null ? end - start : dur ?? defaultDuration;

  let title = s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(add|schedule|put|block|book)\s+/i, '')
    .replace(/\s+(at|on|for|from|by|@|,|-)$/i, '')
    .replace(/^(at|on|for|from|by|@|,|-)\s+/i, '')
    .replace(/[,.;]+$/, '')
    .trim();
  if (!title) title = 'New block';
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title, cat: cat ?? guessCategory(title), date, start, duration: Math.max(5, duration), dateGiven };
}
