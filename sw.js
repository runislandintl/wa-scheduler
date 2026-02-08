// ============================================
// Service Worker - WA Scheduler PWA v7
// ============================================

const CACHE_NAME = 'wa-scheduler-v8';

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

// Files that should use network-first (code & translations change often)
const NETWORK_FIRST = [
  '/js/', '/css/', '/lang/', '/sw.js', '/index.html', '/manifest.json'
];

// ---- Install: pre-cache all assets ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ---- Activate: clean old caches, claim clients ----
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

// ---- Fetch: network-first for code, cache-first for static assets ----
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Network-first for code files (JS, CSS, JSON, HTML)
  const isCodeFile = NETWORK_FIRST.some(pattern => url.includes(pattern));

  if (isCodeFile) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.status === 200 && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        }))
    );
  } else {
    // Cache-first for images, icons, etc.
    event.respondWith(
      caches.match(event.request)
        .then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.status === 200 && event.request.method === 'GET') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return response;
          });
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        })
    );
  }
});

// ============================================
// IndexedDB access from Service Worker
// (for background notification checking)
// ============================================

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wa-scheduler', 1);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
    // Don't handle upgradeneeded — the main app creates the schema
  });
}

function getAllPendingMessages() {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('status');
      const req = index.getAll('pending');
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    } catch (e) {
      resolve([]); // DB might not exist yet
    }
  });
}

function updateMessage(msg) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      msg.updatedAt = new Date().toISOString();
      const req = store.put(msg);
      req.onsuccess = () => resolve(msg);
      req.onerror = (e) => reject(e.target.error);
    } catch (e) {
      reject(e);
    }
  });
}

// ============================================
// Background message checking
// ============================================

function buildWhatsAppLink(phone, message) {
  let cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
  if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);
  else if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.slice(2);
  if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
    cleanPhone = '33' + cleanPhone.slice(1);
  }
  const encodedMsg = encodeURIComponent(message);
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;
}

async function checkMessagesInSW() {
  try {
    const messages = await getAllPendingMessages();
    const now = new Date();
    // Read advance minutes from a simple default (can't access localStorage in SW)
    const advanceMinutes = 5;

    for (const msg of messages) {
      const scheduledTime = new Date(msg.scheduledAt);
      const notifyTime = new Date(scheduledTime.getTime() - advanceMinutes * 60000);

      // Advance reminder
      if (now >= notifyTime && !msg.notified) {
        await showSWNotification(msg, false);
        msg.notified = true;
        await updateMessage(msg);
      }

      // Exact time notification
      if (now >= scheduledTime && !msg.triggeredNotification) {
        await showSWNotification(msg, true);
        msg.triggeredNotification = true;
        await updateMessage(msg);
      }
    }
  } catch (e) {
    console.log('SW checkMessages error:', e);
  }
}

async function showSWNotification(msg, isExactTime) {
  const contactName = msg.contactName || msg.phone;
  const title = isExactTime
    ? 'C\'est l\'heure d\'envoyer !'
    : 'Message WhatsApp programmé';
  const body = `Appuyez pour envoyer votre message à ${contactName}`;

  try {
    await self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: `wa-msg-${msg.id}${isExactTime ? '-now' : ''}`,
      requireInteraction: true,
      renotify: true,
      data: {
        messageId: msg.id,
        phone: msg.phone,
        text: msg.text,
        app: msg.app,
        url: buildWhatsAppLink(msg.phone, msg.text)
      },
      actions: [
        { action: 'send', title: 'Envoyer' },
        { action: 'dismiss', title: 'Fermer' }
      ]
    });
  } catch (e) {
    console.log('SW showNotification error:', e);
  }
}

// ---- Listen for messages from the main app ----
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_MESSAGES') {
    event.waitUntil(checkMessagesInSW());
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ---- Periodic Background Sync (where supported) ----
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-messages') {
    event.waitUntil(checkMessagesInSW());
  }
});

// ---- Regular Background Sync fallback ----
self.addEventListener('sync', (event) => {
  if (event.tag === 'check-messages') {
    event.waitUntil(checkMessagesInSW());
  }
});

// ---- Handle notification click ----
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const data = event.notification.data || {};

  event.notification.close();

  // "send" action: open WhatsApp deep link
  if (action === 'send' && data.url) {
    event.waitUntil(
      self.clients.openWindow(data.url)
    );
    return;
  }

  // "dismiss" action: just close
  if (action === 'dismiss') {
    return;
  }

  // Default click (tapped notification body): open/focus the app
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
          // Open the app at the message edit page
          const hash = data.messageId ? `#/edit/${data.messageId}` : '#/messages';
          self.clients.openWindow('./index.html' + hash);
        }
      })
  );
});

// ---- Handle notification close ----
self.addEventListener('notificationclose', (event) => {
  // Nothing specific needed, but this prevents SW from terminating early
});
