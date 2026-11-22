import type { Block, CheckIn, DayMeta, LifeEntry, Settings, Task } from '../../src/lib/types';

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
  listCheckins(uid: string, fromDate: string): Promise<CheckIn[]>;
  putCheckin(uid: string, c: CheckIn): Promise<void>;
  listLife(uid: string, fromDate: string, toDate: string): Promise<LifeEntry[]>;
  putLife(uid: string, e: LifeEntry): Promise<void>;
  deleteLife(uid: string, id: string): Promise<void>;
}

/** A browser that agreed to receive notifications (Web Push subscription). */
export interface PushDevice {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label: string;
  createdAt: number;
}

export interface PushStore {
  listPushUsers(): Promise<string[]>;
  listDevices(uid: string): Promise<PushDevice[]>;
  putDevice(uid: string, d: PushDevice): Promise<void>;
  deleteDevice(uid: string, id: string): Promise<void>;
  /** Records that a notification went out. Returns false if it already had (so it isn't sent twice). */
  markSent(uid: string, key: string): Promise<boolean>;
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
  setSettings(uid: string, s: Partial<Settings>) {
    this.settings[uid] = s;
  }
  private checkins = new Map<string, CheckIn[]>();
  async listCheckins(uid: string, fromDate: string) {
    return (this.checkins.get(uid) ?? []).filter((c) => c.date >= fromDate);
  }
  async putCheckin(uid: string, c: CheckIn) {
    this.checkins.set(uid, [...(this.checkins.get(uid) ?? []).filter((x) => x.id !== c.id), structuredClone(c)]);
  }
  private life = new Map<string, LifeEntry[]>();
  async listLife(uid: string, fromDate: string, toDate: string) {
    return (this.life.get(uid) ?? []).filter((e) => e.date >= fromDate && e.date <= toDate);
  }
  async putLife(uid: string, e: LifeEntry) {
    this.life.set(uid, [...(this.life.get(uid) ?? []).filter((x) => x.id !== e.id), structuredClone(e)]);
  }
  async deleteLife(uid: string, id: string) {
    this.life.set(uid, (this.life.get(uid) ?? []).filter((x) => x.id !== id));
  }
}

export class MemoryPushStore implements PushStore {
  devices = new Map<string, Map<string, PushDevice>>();
  sent = new Set<string>();
  async listPushUsers() {
    return [...this.devices.keys()].filter((u) => this.devices.get(u)!.size > 0);
  }
  async listDevices(uid: string) {
    return [...(this.devices.get(uid)?.values() ?? [])];
  }
  async putDevice(uid: string, d: PushDevice) {
    if (!this.devices.has(uid)) this.devices.set(uid, new Map());
    this.devices.get(uid)!.set(d.id, d);
  }
  async deleteDevice(uid: string, id: string) {
    this.devices.get(uid)?.delete(id);
  }
  async markSent(uid: string, key: string) {
    const k = `${uid}/${key}`;
    if (this.sent.has(k)) return false;
    this.sent.add(k);
    return true;
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
