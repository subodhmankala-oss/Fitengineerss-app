self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  // standard fetch passthrough so developers don't experience caching delays during code pushes
  e.respondWith(fetch(e.request));
});

// Wake up Service Worker on Lock-Screen Background Push Notifications
self.addEventListener('push', (e) => {
  let data = { 
    title: 'Fitengineers Coach 🥗', 
    body: 'Time to log your daily glass of water and review your protein target! 💪' 
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
    data: {
      url: '/'
    },
    tag: 'fitengineers-coach-nudge',
    renotify: true,
    requireInteraction: true,
    silent: false
  };

  e.waitUntil(
    self.registration.showNotification(data.title, options)
  );
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
        // Reuse an already-open app window: navigate it to the target (when
        // supported) and bring it forward. This is the path that actually
        // fires when the PWA is backgrounded rather than fully closed.
        if ('focus' in client) {
          const focusFirst = () => client.focus();
          if ('navigate' in client && client.url !== targetUrl) {
            return client.navigate(targetUrl).then((c) => (c || client).focus()).catch(focusFirst);
          }
          return focusFirst();
        }
      }
      // No window open (app was fully closed) — launch a fresh one.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
