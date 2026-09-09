/// <reference lib="webworker" />

/**
 * The service worker.
 *
 * Written out rather than generated because it does two jobs: the caching that makes the
 * pet card open without a signal, and the push handling that a generated worker has no way
 * to include.
 */

import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import type { WorkboxPlugin } from 'workbox-core';

/**
 * Workbox declares its plugin callbacks as optional properties, which
 * `exactOptionalPropertyTypes` reads as "may be explicitly undefined" and then rejects. The
 * cast is confined to this one helper rather than loosening the setting for the whole app.
 */
const expire = (options: { maxEntries: number; maxAgeSeconds: number }): WorkboxPlugin =>
  new ExpirationPlugin(options) as unknown as WorkboxPlugin;

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/**
 * Reads fall back to the last copy, so the pet card opens in a clinic with no signal. Only
 * GET: a write that cannot reach the server must fail loudly rather than look successful.
 */
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'api-reads',
    networkTimeoutSeconds: 4,
    plugins: [expire({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/files/'),
  new CacheFirst({
    cacheName: 'files',
    plugins: [expire({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 90 })],
  }),
);

/**
 * Any navigation is answered with the shell, which the router then reads.
 *
 * Written out because `injectManifest` has no `navigateFallback` of its own — and without it
 * a deep link opened offline is a browser error page rather than the application.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
);

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

self.addEventListener('push', (event) => {
  // A push with no readable payload is still worth showing: something is due, and an empty
  // notification is better than a silent one the owner never learns about.
  let payload: PushPayload = { title: 'Питомец', body: '', url: '/' };
  try {
    payload = { ...payload, ...(event.data?.json() as Partial<PushPayload>) };
  } catch {
    /* keep the fallback */
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // One tag per reminder day: a second push replaces the first rather than stacking.
      tag: 'pet-care-reminder',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus a tab that is already open rather than opening a fifth one.
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
