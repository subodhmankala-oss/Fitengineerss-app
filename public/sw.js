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
    icon: data.icon || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">🥗</text></svg>',
    badge: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">🥗</text></svg>',
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

// Focus or open the app when a coach broadcast notification is clicked
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
