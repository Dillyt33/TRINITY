import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createApp } from './app';
import { FirestoreOAuthStore, FirestorePushStore, FirestoreScheduleStore } from './firestore';
import { makeSender } from './push';
import { runReminders } from './reminders';
import { ClaudeWriter } from './writer';

// Plain settings live in functions/.env; keys live in Secret Manager. See docs/CONNECT-CLAUDE.md and docs/REMINDERS.md.
const ALLOWED_EMAILS = defineString('ALLOWED_EMAILS', { default: '', description: 'Google accounts allowed to connect Claude to Trinity (comma-separated).' });
const DEFAULT_TIMEZONE = defineString('DEFAULT_TIMEZONE', { default: 'America/New_York', description: 'Used until the Trinity app saves your time zone.' });
const APP_URL = defineString('APP_URL', { default: '', description: 'Address of the Trinity app, if different from this server.' });
const VAPID_PUBLIC_KEY = defineString('VAPID_PUBLIC_KEY', { default: '', description: 'Public key for notifications (npm run vapid).' });
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

initializeApp();

function vapidSubject() {
  const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'trinity';
  return `https://${project}.web.app`;
}

function sender() {
  return makeSender(VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value(), vapidSubject());
}

let handler: ReturnType<typeof createApp> | null = null;

/** Trinity's server: Claude connector (OAuth + MCP tools) and the notification sign-up API. */
export const api = onRequest(
  { region: 'us-central1', memory: '256MiB', maxInstances: 3, timeoutSeconds: 60, secrets: [VAPID_PRIVATE_KEY] },
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
      });
    }
    handler(req, res);
  },
);

/** Every 2 minutes: send due reminders and check-ins. Claude writes the check-ins when an API key is set. */
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
      defaultTz: DEFAULT_TIMEZONE.value(),
      log: (m) => console.warn(m),
    });
    if (result.sent) console.log(`reminders: sent ${result.sent}`);
  },
);
