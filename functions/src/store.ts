import type { Block, DayMeta, Settings, Task } from '../../src/lib/types';

/** Server-side access to one person's Trinity data (users/{uid}/...). */
export interface ScheduleStore {
  listBlocks(uid: string, from: string, to: string): Promise<Block[]>;
  getBlock(uid: string, id: string): Promise<Block | null>;
  putBlock(uid: string, b: Block): Promise<void>;
  deleteBlock(uid: string, id: string): Promise<void>;
  listTasks(uid: string): Promise<Task[]>;
  getTask(uid: string, id: string): Promise<Task | null>;
  putTask(uid: string, t: Task): Promise<void>;
  deleteTask(uid: string, id: string): Promise<void>;
  getDay(uid: string, date: string): Promise<DayMeta | null>;
  putDay(uid: string, d: DayMeta): Promise<void>;
  getSettings(uid: string): Promise<Partial<Settings>>;
}

export type OAuthKind = 'clients' | 'requests' | 'codes' | 'tokens';

/** Key-value storage for the OAuth server (clients, pending requests, codes, tokens). */
export interface OAuthStore {
  get<T>(kind: OAuthKind, id: string): Promise<T | null>;
  put<T extends object>(kind: OAuthKind, id: string, value: T): Promise<void>;
  delete(kind: OAuthKind, id: string): Promise<void>;
}

/** In-memory stores, used by tests and local development. */
export class MemoryScheduleStore implements ScheduleStore {
  private blocks = new Map<string, Map<string, Block>>();
  private tasks = new Map<string, Map<string, Task>>();
  private days = new Map<string, Map<string, DayMeta>>();
  constructor(private settings: Record<string, Partial<Settings>> = {}) {}

  private table<T>(m: Map<string, Map<string, T>>, uid: string): Map<string, T> {
    if (!m.has(uid)) m.set(uid, new Map());
    return m.get(uid)!;
  }
  async listBlocks(uid: string, from: string, to: string) {
    return [...this.table(this.blocks, uid).values()].filter((b) => b.date >= from && b.date <= to);
  }
  async getBlock(uid: string, id: string) {
    return this.table(this.blocks, uid).get(id) ?? null;
  }
  async putBlock(uid: string, b: Block) {
    this.table(this.blocks, uid).set(b.id, structuredClone(b));
  }
  async deleteBlock(uid: string, id: string) {
    this.table(this.blocks, uid).delete(id);
  }
  async listTasks(uid: string) {
    return [...this.table(this.tasks, uid).values()];
  }
  async getTask(uid: string, id: string) {
    return this.table(this.tasks, uid).get(id) ?? null;
  }
  async putTask(uid: string, t: Task) {
    this.table(this.tasks, uid).set(t.id, structuredClone(t));
  }
  async deleteTask(uid: string, id: string) {
    this.table(this.tasks, uid).delete(id);
  }
  async getDay(uid: string, date: string) {
    return this.table(this.days, uid).get(date) ?? null;
  }
  async putDay(uid: string, d: DayMeta) {
    this.table(this.days, uid).set(d.date, structuredClone(d));
  }
  async getSettings(uid: string) {
    return this.settings[uid] ?? {};
  }
}

export class MemoryOAuthStore implements OAuthStore {
  private data = new Map<string, unknown>();
  async get<T>(kind: OAuthKind, id: string) {
    return (this.data.get(`${kind}/${id}`) as T | undefined) ?? null;
  }
  async put<T extends object>(kind: OAuthKind, id: string, value: T) {
    this.data.set(`${kind}/${id}`, structuredClone(value));
  }
  async delete(kind: OAuthKind, id: string) {
    this.data.delete(`${kind}/${id}`);
  }
}
