import * as webpush from 'web-push';
import type { Notice, Sender } from './reminders';
import type { PushDevice } from './store';

/** Sends Web Push messages signed with the project's VAPID keys. */
export function makeSender(publicKey: string, privateKey: string, subject: string): Sender {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return async (d: PushDevice, n: Notice) => {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: d.keys }, JSON.stringify(n), { TTL: 15 * 60, urgency: 'high' });
      return 'ok';
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) return 'gone'; // the device unsubscribed or the app was removed
      console.error('push failed', code, (e as Error).message);
      return 'error';
    }
  };
}
