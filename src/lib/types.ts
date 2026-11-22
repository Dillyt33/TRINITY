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
