export type CategoryId = 'deep' | 'meet' | 'health' | 'personal' | 'admin' | 'break';

export const CATEGORY_IDS: CategoryId[] = ['deep', 'meet', 'health', 'personal', 'admin', 'break'];

export const CATEGORY_NAMES: Record<CategoryId, string> = {
  deep: 'Deep work',
  meet: 'Meetings',
  health: 'Health',
  personal: 'Personal',
  admin: 'Admin',
  break: 'Break',
};

export type Source = 'app' | 'coach' | 'claude' | 'siri' | 'import';

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

/** A time block on a specific day. `start`/`end` are minutes after local midnight. */
export interface Block {
  id: string;
  date: string; // YYYY-MM-DD (local)
  start: number;
  end: number;
  title: string;
  cat: CategoryId;
  done: boolean;
  notes: string;
  subtasks: Subtask[];
  source: Source;
  createdAt: number;
  updatedAt: number;
}

/** Something to do that isn't on the timeline yet. */
export interface Task {
  id: string;
  title: string;
  estimate: number; // minutes
  cat: CategoryId;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DayMeta {
  date: string;
  intention: string;
  updatedAt: number;
}

export type ThemeName = 'Paper' | 'Midnight' | 'Sage' | 'Dusk' | 'Sunrise';
export type ThemeSetting = ThemeName | 'auto';

export interface Settings {
  theme: ThemeSetting;
  weekStart: 0 | 1; // 0 = Sunday, 1 = Monday
  dayStart: number; // minutes, first hour shown
  dayEnd: number; // minutes, last hour shown
  snap: number; // minutes
  tz?: string; // IANA time zone, saved by the app so the server knows what "today" is
  notify?: NotifySettings;
  /** "About me" for Trinity: goals, weekly targets, usual day, how hard to push. */
  profile?: string;
}

export interface NotifySettings {
  blockReminders: boolean; // "Up next" before each block
  leadMinutes: number;
  checkIns: boolean; // "How did it go?" when a block ends
  morning: string | null; // 'HH:MM' or null for off
  midday: string | null;
  evening: string | null;
  quietStart: string; // no block reminders between quietStart and quietEnd
  quietEnd: string;
}

export const DEFAULT_NOTIFY: NotifySettings = {
  blockReminders: true,
  leadMinutes: 5,
  checkIns: true,
  morning: '08:00',
  midday: '13:00',
  evening: '21:00',
  quietStart: '22:00',
  quietEnd: '07:00',
};

export type LifeArea = 'sleep' | 'food' | 'exercise' | 'mood' | 'study' | 'project' | 'money' | 'health' | 'mind';

export const LIFE_AREAS: Record<LifeArea, string> = {
  sleep: 'Sleep',
  food: 'Diet',
  exercise: 'Exercise',
  mood: 'Mood',
  study: 'Study',
  project: 'Projects',
  money: 'Finance',
  health: 'Health',
  mind: 'Mental health',
};

/** One thing Trinity recorded about your life ("slept 6h, woke twice", "spent $42 on groceries"). */
export interface LifeEntry {
  id: string;
  at: number; // ms
  date: string; // local YYYY-MM-DD the entry is about
  area: LifeArea;
  summary: string; // in plain words
  data?: {
    hours?: number;
    minutes?: number;
    quality?: number; // 1–5
    calories?: number;
    protein_g?: number;
    amount?: number; // money: positive = spent, negative = earned
    mood?: number; // 1–5
    energy?: number; // 1–5
    stress?: number; // 1–5
    project?: string;
    kind?: string; // e.g. "run", "lunch", "groceries", "therapy"
  };
  source: 'claude' | 'app' | 'health' | 'shortcut';
}

export type Mood = 'great' | 'good' | 'meh' | 'rough';
export const MOOD_LABELS: Record<Mood, string> = { great: 'Great', good: 'Good', meh: 'Meh', rough: 'Rough' };

export interface CheckIn {
  id: string;
  at: number; // ms
  date: string; // local YYYY-MM-DD
  kind: 'block' | 'mood';
  moment?: 'morning' | 'midday' | 'evening' | 'anytime';
  blockId?: string;
  blockTitle?: string;
  outcome?: 'done' | 'more' | 'moved' | 'dropped';
  mood?: Mood;
  note?: string;
  source: 'app' | 'claude';
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  weekStart: 0,
  dayStart: 6 * 60,
  dayEnd: 23 * 60,
  snap: 15,
};

export type BlockInput = Omit<Block, 'id' | 'createdAt' | 'updatedAt' | 'done' | 'notes' | 'subtasks' | 'source'> &
  Partial<Pick<Block, 'done' | 'notes' | 'subtasks' | 'source'>>;
