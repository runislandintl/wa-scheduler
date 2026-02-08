// ============================================
// Service Worker - WA Scheduler PWA
// ============================================

const CACHE_NAME = 'wa-scheduler-v6';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/utils.js',
  './js/scheduler.js',
  './js/contacts.js',
  './js/templates.js',
  './js/stats.js',
  './js/app.js',
  './lang/fr.json',
  './lang/en.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install - cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch - cache first, then network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Cache new successful responses
          if (response.status === 200 && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const data = event.notification.data || {};

  event.notification.close();

  // "send" action: open WhatsApp deep link directly
  if (action === 'send' && data.url) {
    event.waitUntil(
      self.clients.openWindow(data.url)
    );
    return;
  }

  // "dismiss" action: just close (already closed above)
  if (action === 'dismiss') {
    return;
  }

  // Default click (no action button, just tapped notification body):
  // Focus the app and navigate to the message
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        if (clients.length > 0) {
          clients[0].focus();
          clients[0].postMessage({
            type: 'notification-click',
            data: data
          });
        } else {
          const hash = data.messageId ? `#/edit/${data.messageId}` : '#/messages';
          self.clients.openWindow('./index.html' + hash);
        }
      })
  );
});
