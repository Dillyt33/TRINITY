import type { Block, CheckIn, DayMeta, Settings, Task } from './types';

export type Unsubscribe = () => void;

export interface AuthUser {
  uid: string;
  name: string | null;
  email: string | null;
  photo: string | null;
}

/** Where Trinity's data lives. LocalBackend = this browser only; FirebaseBackend = synced across devices. */
export interface Backend {
  readonly kind: 'local' | 'firebase';
  watchBlocks(from: string, to: string, cb: (blocks: Block[]) => void): Unsubscribe;
  watchTasks(cb: (tasks: Task[]) => void): Unsubscribe;
  watchDays(from: string, to: string, cb: (days: DayMeta[]) => void): Unsubscribe;
  watchSettings(cb: (s: Partial<Settings>) => void): Unsubscribe;
  putBlock(b: Block): Promise<void>;
  deleteBlock(id: string): Promise<void>;
  putTask(t: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;
  putDay(d: DayMeta): Promise<void>;
  putSettings(s: Settings): Promise<void>;
  putCheckin(c: CheckIn): Promise<void>;
}

type Table<T> = Record<string, T>;

/** Demo mode: everything in localStorage, synced between tabs of the same browser. */
export class LocalBackend implements Backend {
  readonly kind = 'local' as const;
  private listeners = new Set<() => void>();

  constructor(private prefix = 'trinity:') {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key?.startsWith(this.prefix)) this.emit();
      });
    }
  }

  private read<T>(name: string): Table<T> {
    try {
      return JSON.parse(localStorage.getItem(this.prefix + name) || '{}') as Table<T>;
    } catch {
      return {};
    }
  }

  private write<T>(name: string, table: Table<T>) {
    try {
      localStorage.setItem(this.prefix + name, JSON.stringify(table));
    } catch {
      /* storage full or blocked: keep running in memory */
    }
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private watch(run: () => void): Unsubscribe {
    this.listeners.add(run);
    queueMicrotask(run);
    return () => this.listeners.delete(run);
  }

  watchBlocks(from: string, to: string, cb: (blocks: Block[]) => void) {
    return this.watch(() => cb(Object.values(this.read<Block>('blocks')).filter((b) => b.date >= from && b.date <= to)));
  }

  watchTasks(cb: (tasks: Task[]) => void) {
    return this.watch(() => cb(Object.values(this.read<Task>('tasks'))));
  }

  watchDays(from: string, to: string, cb: (days: DayMeta[]) => void) {
    return this.watch(() => cb(Object.values(this.read<DayMeta>('days')).filter((d) => d.date >= from && d.date <= to)));
  }

  watchSettings(cb: (s: Partial<Settings>) => void) {
    return this.watch(() => cb((this.read<unknown>('settings') as Partial<Settings>) ?? {}));
  }

  async putBlock(b: Block) {
    const t = this.read<Block>('blocks');
    t[b.id] = b;
    this.write('blocks', t);
  }

  async deleteBlock(id: string) {
    const t = this.read<Block>('blocks');
    delete t[id];
    this.write('blocks', t);
  }

  async putTask(task: Task) {
    const t = this.read<Task>('tasks');
    t[task.id] = task;
    this.write('tasks', t);
  }

  async deleteTask(id: string) {
    const t = this.read<Task>('tasks');
    delete t[id];
    this.write('tasks', t);
  }

  async putDay(d: DayMeta) {
    const t = this.read<DayMeta>('days');
    t[d.date] = d;
    this.write('days', t);
  }

  async putSettings(s: Settings) {
    this.write('settings', s as unknown as Table<unknown>);
  }

  async putCheckin(c: CheckIn) {
    const t = this.read<CheckIn>('checkins');
    t[c.id] = c;
    this.write('checkins', t);
  }
}
