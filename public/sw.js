const CACHE_NAME = 'corc-v27';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/styles.css?v=27',
  '/app.js',
  '/app.js?v=27',
  '/logo.jpg',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Do NOT cache API endpoints or non-GET requests
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) {
    return;
  }

  // Network-First for HTML navigation documents so updates take effect immediately
  if (e.request.mode === 'navigate' || e.request.destination === 'document' || e.request.url.endsWith('/') || e.request.url.includes('/index.html')) {
    e.respondWith(
      fetch(e.request)
        .then((networkRes) => {
          if (networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
          }
          return networkRes;
        })
        .catch(() => caches.match('/index.html') || caches.match(e.request))
    );
    return;
  }

  // Cache-First for static assets
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).then((networkRes) => {
        if (networkRes.status === 200 && e.request.url.startsWith(self.location.origin)) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return networkRes;
      });
    })
  );
});
