// JesusSaid Service Worker
const CACHE = 'jesussaid-v1';
const STATIC = ['/', '/get/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network first for verse pages (fresh content), cache fallback
  if (e.request.url.includes('/verse/')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache first for static assets
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

// Push notification handler
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'JesusSaid';
  const body = data.body || 'Your daily verse is ready.';
  const url = data.url || '/';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data: { url },
      vibrate: [100, 50, 100],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(clients.openWindow(url));
});
