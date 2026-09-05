// Custom service worker source, bundled by vite-plugin-pwa's `injectManifest`
// strategy into public build output. `self.__WB_MANIFEST` below is replaced
// at build time with the real precache list (hashed JS/CSS/HTML from this
// build), so the cache is automatically busted on every Vercel deploy —
// nothing here needs manual version bumping.
import { cleanupOutdatedCaches, precacheAndRoute, matchPrecache } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';

// New service worker installs and sits "waiting" until every open tab is
// closed, UNLESS the page explicitly tells it to activate (see the
// UpdateToast component / main.jsx, which posts this message when the user
// taps "Refresh"). That's what makes updates safe: nothing is torn out from
// under a client mid-session.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

cleanupOutdatedCaches();

// Coach/client data must never be served stale: API routes and Supabase
// calls always go straight to the network, never through the cache.
//
// This (and the NavigationRoute right below) MUST be registered before
// precacheAndRoute(). Workbox's router dispatches each fetch to the first
// registered route that matches, and precacheAndRoute() registers its own
// catch-all route for every precached URL — including '/', which its
// default directoryIndex option maps to the precached 'index.html' entry.
// With precacheAndRoute() registered first (as this used to be), THAT route
// won every navigation to '/' outright, serving the cached app shell from
// whatever build was active when this worker last activated — the
// network-first NavigationRoute below never even ran. Confirmed live
// (2026-09-05): a coach's browser kept rendering pre-#142 markup and
// referencing hashed JS chunks the current deployment no longer has (404 on
// direct fetch), well after two newer deploys had gone out, with no console
// error to point at it — the SW was quietly serving its own stale cache
// instead of ever asking the network. Registering these two routes first
// makes them win the match instead, so the "network first, cached shell as
// fallback" behavior the comment below describes is what actually runs.
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/') ||
    url.hostname.endsWith('.supabase.co'),
  new NetworkOnly()
);

// SPA navigations: try the network first (so users always get the latest
// deploy when online); if that fails, fall back to the precached app shell
// so a previously visited route still opens offline, and finally to a
// dedicated offline page if even the shell isn't cached yet.
registerRoute(
  new NavigationRoute(async (params) => {
    try {
      return await new NetworkOnly().handle(params);
    } catch (err) {
      const shell = await matchPrecache('/index.html');
      if (shell) return shell;
      const offline = await matchPrecache('/offline.html');
      if (offline) return offline;
      throw err;
    }
  })
);

precacheAndRoute(self.__WB_MANIFEST);

// Same-origin images/fonts get a lightweight runtime cache on top of the
// precache list, so icons/logo etc. that change rarely don't need a network
// round trip every load, without ever going stale for more than one visit.
registerRoute(
  ({ request, sameOrigin }) =>
    sameOrigin && (request.destination === 'image' || request.destination === 'font'),
  new StaleWhileRevalidate({ cacheName: 'fitengineers-assets' })
);

// --- Push notifications (unchanged from the pre-existing hand-rolled SW) ---

self.addEventListener('push', (e) => {
  let data = {
    title: 'Fitengineers Coach 🥗',
    body: 'Time to log your daily glass of water and review your protein target! 💪',
  };

  if (e.data) {
    try {
      data = e.data.json();
    } catch (err) {
      data = { title: 'Fitengineers Coach 🥗', body: e.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/logo.png',
    badge: '/logo.png',
    vibrate: data.vibrate || [300, 100, 300, 100, 300],
    // Was hardcoded to '/' regardless of what the sender actually put in
    // the payload — api/push.js has never sent a `url` field at all, so
    // every notification (measurement reminder, session reminder, coach
    // note, everything) opened the bare homepage on tap and did nothing
    // else, no matter how specific the notification's own text was.
    data: {
      url: data.url || '/',
    },
    tag: 'fitengineers-coach-nudge',
    renotify: true,
    requireInteraction: true,
    silent: false,
  };

  e.waitUntil(self.registration.showNotification(data.title, options));
});

// Focus or open the app when a notification is clicked. Made deliberately
// robust for installed iOS PWAs, where the naive "focus the first client"
// often no-ops: an existing window is navigated to the target and focused,
// and only if there's genuinely no window do we openWindow. The target is an
// absolute URL (relative paths can silently fail to open from a standalone
// PWA notification on iOS).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetPath = (e.notification.data && e.notification.data.url) || '/';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          const focusFirst = () => client.focus();
          if ('navigate' in client && client.url !== targetUrl) {
            return client.navigate(targetUrl).then((c) => (c || client).focus()).catch(focusFirst);
          }
          return focusFirst();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
