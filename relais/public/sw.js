/* Service worker : l'écran se charge hors ligne ; les appels /api/ ne passent jamais par le cache. */
const VERSION = 'rp-v1';
const COQUE = ['/', '/index.html', '/app.css', '/manifest.webmanifest', '/icon-192.png', '/js/app.js', '/js/api.js', '/js/camera.js', '/js/dom.js', '/js/file.js', '/js/photo.js', '/js/prise.js', '/js/pur.mjs'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cache1 = await cache.match(e.request);
    const reseau = fetch(e.request).then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => cache1);
    return cache1 || reseau;
  }));
});
