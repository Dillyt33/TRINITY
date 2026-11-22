import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as fbSignOut,
  type Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  setDoc,
  deleteDoc,
  type Firestore,
} from 'firebase/firestore';
import type { AuthUser, Backend, Unsubscribe } from './backend';
import type { Block, CheckIn, DayMeta, Settings, Task } from './types';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

/** Strip undefined so Firestore accepts the object. */
function clean<T extends object>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

export class FirebaseSession {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Firestore;

  constructor(config: FirebaseConfig) {
    this.app = initializeApp(config);
    this.auth = getAuth(this.app);
    this.db = initializeFirestore(this.app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    getRedirectResult(this.auth).catch(() => undefined);
  }

  onUser(cb: (u: AuthUser | null) => void): Unsubscribe {
    return onAuthStateChanged(this.auth, (u) =>
      cb(u ? { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL } : null),
    );
  }

  async signIn(): Promise<void> {
    const provider = new GoogleAuthProvider();
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // Popups are unreliable inside an installed iPhone app, so use a redirect there.
    if (standalone) await signInWithRedirect(this.auth, provider);
    else await signInWithPopup(this.auth, provider);
  }

  /** Proves who is signed in to Trinity's server (used when connecting Claude). */
  async idToken(): Promise<string | null> {
    return (await this.auth.currentUser?.getIdToken()) ?? null;
  }

  signOut(): Promise<void> {
    return fbSignOut(this.auth);
  }

  backendFor(uid: string): Backend {
    return new FirebaseBackend(this.db, uid);
  }
}

class FirebaseBackend implements Backend {
  readonly kind = 'firebase' as const;
  constructor(private db: Firestore, private uid: string) {}

  private col(name: string) {
    return collection(this.db, 'users', this.uid, name);
  }

  watchBlocks(from: string, to: string, cb: (blocks: Block[]) => void): Unsubscribe {
    const q = query(this.col('blocks'), where('date', '>=', from), where('date', '<=', to));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as Block)));
  }

  watchTasks(cb: (tasks: Task[]) => void): Unsubscribe {
    return onSnapshot(this.col('tasks'), (snap) => cb(snap.docs.map((d) => d.data() as Task)));
  }

  watchDays(from: string, to: string, cb: (days: DayMeta[]) => void): Unsubscribe {
    const q = query(this.col('days'), where('date', '>=', from), where('date', '<=', to));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as DayMeta)));
  }

  watchSettings(cb: (s: Partial<Settings>) => void): Unsubscribe {
    return onSnapshot(doc(this.db, 'users', this.uid, 'meta', 'settings'), (snap) => cb((snap.data() as Partial<Settings>) ?? {}));
  }

  putBlock(b: Block) {
    return setDoc(doc(this.col('blocks'), b.id), clean(b));
  }

  deleteBlock(id: string) {
    return deleteDoc(doc(this.col('blocks'), id));
  }

  putTask(t: Task) {
    return setDoc(doc(this.col('tasks'), t.id), clean(t));
  }

  deleteTask(id: string) {
    return deleteDoc(doc(this.col('tasks'), id));
  }

  putDay(d: DayMeta) {
    return setDoc(doc(this.col('days'), d.date), clean(d));
  }

  putSettings(s: Settings) {
    return setDoc(doc(this.db, 'users', this.uid, 'meta', 'settings'), clean(s));
  }

  putCheckin(c: CheckIn) {
    return setDoc(doc(this.col('checkins'), c.id), clean(c));
  }
}
