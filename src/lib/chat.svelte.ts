import { app } from './app.svelte';
import { apiBase } from './connector';

export interface ChatMessage {
  id: string;
  role: 'trinity' | 'me';
  text: string;
  at: number;
  status: 'streaming' | 'done' | 'waiting' | 'error';
  activity?: string | null;
  confirm?: { eventId: string; tool: string; summary: string } | null;
}

export interface Conversation {
  id: string;
  kind: 'chat' | 'checkin';
  title: string;
  opener?: string;
  updatedAt: number;
}

export interface AssistantStatus {
  apiKey: boolean;
  setUp: boolean;
  bridge: { connected: boolean; lastSeen: number; vaultName: string | null } | null;
}

type Unsub = () => void;

function newId(prefix: string) {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + r.slice(0, 18);
}

/** Talking to Trinity: requests go into Firestore, her replies stream back the same way. */
class ChatState {
  conversations = $state<Conversation[]>([]);
  currentId = $state<string | null>(null);
  messages = $state<ChatMessage[]>([]);
  status = $state<AssistantStatus | null>(null);
  statusError = $state<string | null>(null);
  sending = $state(false);
  /** Messages that finished while the chat was open (so only those get spoken). */
  freshIds = new Set<string>();

  private unsubList: Unsub | null = null;
  private unsubMsgs: Unsub | null = null;
  private watchingUid: string | null = null;

  available = $derived(app.mode === 'firebase' && !!app.user);
  ready = $derived(this.available && !!this.status?.setUp);
  last = $derived(this.messages[this.messages.length - 1] ?? null);
  busy = $derived(this.sending || this.last?.status === 'streaming');

  private async fs() {
    return import('firebase/firestore');
  }

  /** Start listening once signed in. */
  async start() {
    const uid = app.user?.uid;
    if (!uid || !app.firebase || this.watchingUid === uid) return;
    this.watchingUid = uid;
    const { collection, query, orderBy, limit, onSnapshot } = await this.fs();
    this.unsubList?.();
    this.unsubList = onSnapshot(query(collection(app.firebase.db, 'users', uid, 'conversations'), orderBy('updatedAt', 'desc'), limit(20)), (snap) => {
      this.conversations = snap.docs.map((d) => d.data() as Conversation);
    });
    this.refreshStatus();
  }

  async open(id: string | null) {
    this.unsubMsgs?.();
    this.unsubMsgs = null;
    this.currentId = id;
    this.messages = [];
    const uid = app.user?.uid;
    if (!id || !uid || !app.firebase) return;
    const { collection, query, orderBy, onSnapshot } = await this.fs();
    this.unsubMsgs = onSnapshot(query(collection(app.firebase.db, 'users', uid, 'conversations', id, 'messages'), orderBy('at', 'asc')), (snap) => {
      const prev = new Map(this.messages.map((m) => [m.id, m.status]));
      this.messages = snap.docs.map((d) => d.data() as ChatMessage);
      for (const m of this.messages) {
        if (m.role === 'trinity' && m.status === 'done' && prev.get(m.id) === 'streaming') this.freshIds.add(m.id);
      }
    });
  }

  newChat() {
    this.open(null);
  }

  private async request(body: Record<string, unknown>) {
    const uid = app.user?.uid;
    if (!uid || !app.firebase) throw new Error('sign_in_required');
    const { doc, collection, setDoc } = await this.fs();
    await setDoc(doc(collection(app.firebase.db, 'users', uid, 'chat_requests'), newId('rq')), { ...body, at: Date.now() });
  }

  async send(text: string) {
    const t = text.trim();
    if (!t || this.sending) return;
    this.sending = true;
    try {
      if (!this.currentId) await this.open(newId('cv'));
      await this.request({ kind: 'send', conversationId: this.currentId, text: t });
      // optimistic: show your message right away; the server writes the real one
      this.messages = [...this.messages, { id: `local-${Date.now()}`, role: 'me', text: t, at: Date.now(), status: 'done' }];
    } finally {
      setTimeout(() => (this.sending = false), 600);
    }
  }

  async confirm(m: ChatMessage, allow: boolean) {
    if (!m.confirm || !this.currentId) return;
    await this.request({ kind: 'confirm', conversationId: this.currentId, messageId: m.id, eventId: m.confirm.eventId, allow });
  }

  /** Waits until Trinity has finished replying to what you just said (or a few minutes pass). */
  async waitForReply(sentText: string): Promise<ChatMessage | null> {
    const until = Date.now() + 4 * 60 * 1000;
    while (Date.now() < until) {
      const list = this.messages;
      let meIdx = -1;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].role === 'me' && list[i].text === sentText.trim() && !list[i].id.startsWith('local-')) {
          meIdx = i;
          break;
        }
      }
      const reply = meIdx >= 0 ? list.slice(meIdx + 1).find((m) => m.role === 'trinity') : undefined;
      if (reply && reply.status !== 'streaming') return reply;
      await new Promise((r) => setTimeout(r, 300));
    }
    return null;
  }

  async refreshStatus() {
    try {
      const token = await app.firebase?.idToken();
      if (!token) return;
      const r = await fetch(`${apiBase()}/api/assistant/status`, { headers: { authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(String(r.status));
      this.status = await r.json();
      this.statusError = null;
    } catch {
      this.statusError = 'Can’t reach Trinity’s server. Is it deployed? (docs/TRINITY-CHAT.md)';
    }
  }

  async setup(): Promise<string | null> {
    const token = await app.firebase?.idToken();
    if (!token) return 'Sign in first.';
    const r = await fetch(`${apiBase()}/api/assistant/setup`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
    const body = await r.json().catch(() => ({}));
    await this.refreshStatus();
    if (r.ok) return null;
    if (body.error === 'no_api_key') return 'Trinity’s server needs your Anthropic API key first (docs/TRINITY-CHAT.md, step 1).';
    if (body.error === 'not_allowed') return 'This Google account isn’t in ALLOWED_EMAILS on the server.';
    return body.message ? `Setup didn’t finish: ${body.message}` : 'Setup didn’t finish. Try again in a minute.';
  }

  /** Cuts off the Mac helper (and every other signed-in device). You sign in again afterwards. */
  async signOutEverywhere(): Promise<boolean> {
    const token = await app.firebase?.idToken();
    if (!token) return false;
    const r = await fetch(`${apiBase()}/api/account/sign-out-everywhere`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
    if (r.ok) await app.signOut();
    return r.ok;
  }

  /** One-time code for the Mac helper (bridge/): signs it in as you, scoped to your Trinity data. */
  macSetupCode(): string | null {
    const user = app.firebase?.auth.currentUser;
    const env = import.meta.env;
    if (!user || !env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_PROJECT_ID) return null;
    const json = JSON.stringify({ apiKey: env.VITE_FIREBASE_API_KEY, projectId: env.VITE_FIREBASE_PROJECT_ID, uid: user.uid, refreshToken: user.refreshToken });
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

export const chat = new ChatState();

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__trinity = { chat, app };
