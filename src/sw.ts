/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

// Offline support: cache the app shell.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Phase 2: reminders and coach messages arrive here, even when Trinity is closed.
self.addEventListener('push', (event) => {
  const data = (() => {
    try {
      return event.data?.json() ?? {};
    } catch {
      return { title: 'Trinity', body: event.data?.text() ?? '' };
    }
  })() as { title?: string; body?: string; url?: string; tag?: string };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Trinity', {
      body: data.body,
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => 'focus' in w);
      if (existing) {
        existing.navigate(url).catch(() => undefined);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
