import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createApp } from './app';
import { FirestoreOAuthStore, FirestoreScheduleStore } from './firestore';

// Set these in functions/.env (see docs/CONNECT-CLAUDE.md).
const ALLOWED_EMAILS = defineString('ALLOWED_EMAILS', { default: '', description: 'Google accounts allowed to connect Claude to Trinity (comma-separated).' });
const DEFAULT_TIMEZONE = defineString('DEFAULT_TIMEZONE', { default: 'America/New_York', description: 'Used until the Trinity app saves your time zone.' });
const APP_URL = defineString('APP_URL', { default: '', description: 'Address of the Trinity app, if different from this server.' });

initializeApp();

let handler: ReturnType<typeof createApp> | null = null;

/** Trinity's connector: OAuth + MCP tools for Claude. Served at https://<project>.web.app/mcp through Hosting rewrites. */
export const api = onRequest({ region: 'us-central1', memory: '256MiB', maxInstances: 3, timeoutSeconds: 60 }, (req, res) => {
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
    });
  }
  handler(req, res);
});
