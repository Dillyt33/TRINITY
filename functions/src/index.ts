import { randomBytes } from 'node:crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import { createApp } from './app';
import { ChatRelay } from './assistant';
import { FirestoreBridgeStore, FirestoreChatStore, FirestoreOAuthStore, FirestorePushStore, FirestoreScheduleStore } from './firestore';
import { makeSender } from './push';
import { runReminders } from './reminders';
import { ClaudeWriter } from './writer';

// Plain settings live in functions/.env; keys live in Secret Manager. See docs/CONNECT-CLAUDE.md, docs/REMINDERS.md, docs/TRINITY-CHAT.md.
const ALLOWED_EMAILS = defineString('ALLOWED_EMAILS', { default: '', description: 'Google accounts allowed to use Trinity’s server (comma-separated).' });
const DEFAULT_TIMEZONE = defineString('DEFAULT_TIMEZONE', { default: 'America/New_York', description: 'Used until the Trinity app saves your time zone.' });
const APP_URL = defineString('APP_URL', { default: '', description: 'Address of the Trinity app, if different from this server.' });
const VAPID_PUBLIC_KEY = defineString('VAPID_PUBLIC_KEY', { default: '', description: 'Public key for notifications (npm run vapid).' });
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

initializeApp();

const newId = (prefix: string) => prefix + randomBytes(9).toString('base64url');

function vapidSubject() {
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'trinity';
  return `https://${project}.web.app`;
}

function sender() {
  return makeSender(VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value(), vapidSubject());
}

function anthropic(): Anthropic | null {
  const key = ANTHROPIC_API_KEY.value().trim();
  return key && key.toLowerCase() !== 'none' ? new Anthropic({ apiKey: key }) : null;
}

let handler: ReturnType<typeof createApp> | null = null;

/** Trinity's server: Claude connector (OAuth + MCP tools), notification sign-up, Trinity's chat setup. */
export const api = onRequest(
  { region: 'us-central1', memory: '256MiB', maxInstances: 3, timeoutSeconds: 60, secrets: [VAPID_PRIVATE_KEY, ANTHROPIC_API_KEY] },
  (req, res) => {
    if (!handler) {
      const db = getFirestore();
      handler = createApp({
        schedule: new FirestoreScheduleStore(db),
        oauth: new FirestoreOAuthStore(db),
        verifyIdToken: async (token) => {
          const t = await getAuth().verifyIdToken(token);
          return { uid: t.uid, email: t.email };
        },
        allowedEmails: ALLOWED_EMAILS.value().split(',').filter(Boolean),
        defaultTz: DEFAULT_TIMEZONE.value(),
        appUrl: APP_URL.value() || undefined,
        push: VAPID_PUBLIC_KEY.value() ? { store: new FirestorePushStore(db), publicKey: VAPID_PUBLIC_KEY.value(), send: sender } : undefined,
        bridge: new FirestoreBridgeStore(db),
        assistant: { chat: new FirestoreChatStore(db), client: anthropic },
        revokeSessions: (uid) => getAuth().revokeRefreshTokens(uid),
      });
    }
    handler(req, res);
  },
);

/** Every 2 minutes: send due reminders and check-ins. With Trinity's chat set up, check-ins open a conversation. */
export const reminders = onSchedule(
  { schedule: 'every 2 minutes', region: 'us-central1', memory: '256MiB', timeoutSeconds: 120, retryCount: 0, secrets: [VAPID_PRIVATE_KEY, ANTHROPIC_API_KEY] },
  async () => {
    if (!VAPID_PUBLIC_KEY.value()) return;
    const db = getFirestore();
    const key = ANTHROPIC_API_KEY.value().trim();
    const result = await runReminders({
      schedule: new FirestoreScheduleStore(db),
      push: new FirestorePushStore(db),
      send: sender(),
      writer: key && key.toLowerCase() !== 'none' ? new ClaudeWriter(key) : null,
      chat: new FirestoreChatStore(db),
      newId,
      defaultTz: DEFAULT_TIMEZONE.value(),
      log: (m) => console.warn(m),
    });
    if (result.sent) console.log(`reminders: sent ${result.sent}`);
  },
);

/**
 * You talk to Trinity by writing users/{uid}/chat_requests/{id} from the app (a message, or a yes/no to
 * "OK to do this?"). Her reply streams into users/{uid}/conversations/{id}/messages as it arrives.
 */
export const chat = onDocumentCreated(
  { document: 'users/{uid}/chat_requests/{rid}', region: 'us-central1', memory: '256MiB', timeoutSeconds: 300, retry: false, secrets: [ANTHROPIC_API_KEY] },
  async (event) => {
    const req = event.data?.data() as
      | { kind: 'send'; conversationId?: string; text: string }
      | { kind: 'confirm'; conversationId: string; messageId: string; eventId: string; allow: boolean }
      | undefined;
    const uid = event.params.uid;
    const client = anthropic();
    if (!req || !client) return;
    const db = getFirestore();
    const schedule = new FirestoreScheduleStore(db);
    const relay = new ChatRelay({
      client,
      chat: new FirestoreChatStore(db),
      issueAgentToken: async () => {
        throw new Error('not used here');
      },
      getTz: async (u) => (await schedule.getSettings(u)).tz || DEFAULT_TIMEZONE.value(),
      newId,
    });
    try {
      const result =
        req.kind === 'confirm'
          ? await relay.confirm(uid, req)
          : await relay.send(uid, { conversationId: req.conversationId, text: String(req.text ?? '').slice(0, 8000) });
      await event.data?.ref.set({ status: result.status, conversationId: result.conversationId, messageId: result.messageId, doneAt: Date.now() }, { merge: true });
    } catch (e) {
      console.error('chat request failed', e);
      await event.data?.ref.set({ status: 'error', error: (e as Error).message, doneAt: Date.now() }, { merge: true });
    }
  },
);
