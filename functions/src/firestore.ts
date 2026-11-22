import type { Firestore } from 'firebase-admin/firestore';
import type { Block, CheckIn, DayMeta, LifeEntry, Settings, Task } from '../../src/lib/types';
import type { OAuthKind, OAuthStore, PushDevice, PushStore, ScheduleStore } from './store';

const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Same layout the app uses: users/{uid}/blocks|tasks|days, users/{uid}/meta/settings. */
export class FirestoreScheduleStore implements ScheduleStore {
  constructor(private db: Firestore) {}

  private col(uid: string, name: string) {
    return this.db.collection('users').doc(uid).collection(name);
  }

  async listBlocks(uid: string, from: string, to: string) {
    const snap = await this.col(uid, 'blocks').where('date', '>=', from).where('date', '<=', to).get();
    return snap.docs.map((d) => d.data() as Block);
  }
  async getBlock(uid: string, id: string) {
    const d = await this.col(uid, 'blocks').doc(id).get();
    return d.exists ? (d.data() as Block) : null;
  }
  async putBlock(uid: string, b: Block) {
    await this.col(uid, 'blocks').doc(b.id).set(clean(b));
  }
  async deleteBlock(uid: string, id: string) {
    await this.col(uid, 'blocks').doc(id).delete();
  }
  async listTasks(uid: string) {
    const snap = await this.col(uid, 'tasks').get();
    return snap.docs.map((d) => d.data() as Task);
  }
  async getTask(uid: string, id: string) {
    const d = await this.col(uid, 'tasks').doc(id).get();
    return d.exists ? (d.data() as Task) : null;
  }
  async putTask(uid: string, t: Task) {
    await this.col(uid, 'tasks').doc(t.id).set(clean(t));
  }
  async deleteTask(uid: string, id: string) {
    await this.col(uid, 'tasks').doc(id).delete();
  }
  async getDay(uid: string, date: string) {
    const d = await this.col(uid, 'days').doc(date).get();
    return d.exists ? (d.data() as DayMeta) : null;
  }
  async putDay(uid: string, day: DayMeta) {
    await this.col(uid, 'days').doc(day.date).set(clean(day));
  }
  async getSettings(uid: string) {
    const d = await this.db.collection('users').doc(uid).collection('meta').doc('settings').get();
    return (d.data() ?? {}) as Partial<Settings>;
  }
  async listCheckins(uid: string, fromDate: string) {
    const snap = await this.col(uid, 'checkins').where('date', '>=', fromDate).get();
    return snap.docs.map((d) => d.data() as CheckIn);
  }
  async putCheckin(uid: string, c: CheckIn) {
    await this.col(uid, 'checkins').doc(c.id).set(clean(c));
  }
  async listLife(uid: string, fromDate: string, toDate: string) {
    const snap = await this.col(uid, 'life').where('date', '>=', fromDate).where('date', '<=', toDate).get();
    return snap.docs.map((d) => d.data() as LifeEntry);
  }
  async putLife(uid: string, e: LifeEntry) {
    await this.col(uid, 'life').doc(e.id).set(clean(e));
  }
  async deleteLife(uid: string, id: string) {
    await this.col(uid, 'life').doc(id).delete();
  }
}

/** Devices live under users/{uid}/devices; push_users lists who has any; sent markers live under users/{uid}/sent. */
export class FirestorePushStore implements PushStore {
  constructor(private db: Firestore) {}

  async listPushUsers() {
    const snap = await this.db.collection('push_users').get();
    return snap.docs.map((d) => d.id);
  }
  async listDevices(uid: string) {
    const snap = await this.db.collection('users').doc(uid).collection('devices').get();
    return snap.docs.map((d) => d.data() as PushDevice);
  }
  async putDevice(uid: string, d: PushDevice) {
    await this.db.collection('users').doc(uid).collection('devices').doc(d.id).set(clean(d));
    await this.db.collection('push_users').doc(uid).set({ updatedAt: Date.now() });
  }
  async deleteDevice(uid: string, id: string) {
    await this.db.collection('users').doc(uid).collection('devices').doc(id).delete();
    const left = await this.db.collection('users').doc(uid).collection('devices').limit(1).get();
    if (left.empty) await this.db.collection('push_users').doc(uid).delete();
  }
  async markSent(uid: string, key: string) {
    try {
      // create() fails if the document exists, so two runs can't both send the same reminder.
      await this.db.collection('users').doc(uid).collection('sent').doc(key.replace(/\//g, '_')).create({ at: Date.now(), expireAt: new Date(Date.now() + 3 * 24 * 3600 * 1000) });
      return true;
    } catch (e) {
      if ((e as { code?: number }).code === 6) return false; // ALREADY_EXISTS
      throw e;
    }
  }
}

/** OAuth records live in top-level oauth_* collections that the app's security rules don't expose. */
export class FirestoreOAuthStore implements OAuthStore {
  constructor(private db: Firestore) {}

  private ref(kind: OAuthKind, id: string) {
    return this.db.collection(`oauth_${kind}`).doc(id);
  }
  async get<T>(kind: OAuthKind, id: string) {
    const d = await this.ref(kind, id).get();
    return d.exists ? (d.data() as T) : null;
  }
  async put<T extends object>(kind: OAuthKind, id: string, value: T) {
    await this.ref(kind, id).set(clean(value));
  }
  async delete(kind: OAuthKind, id: string) {
    await this.ref(kind, id).delete();
  }
}
