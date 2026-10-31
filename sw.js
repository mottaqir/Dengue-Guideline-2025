/* Dengue Guide — service worker (cache-first, instant start)
 *  • the app opens straight from the cache — no waiting for the network
 *  • update checking is done by the page itself (index.html): every ~5 s it sends a tiny HEAD request and
 *    only when the file really changed does it download the new copy, put it in this cache and reload.
 *    So "no update" = nothing is downloaded.
 *  • never needs a manual version bump. (Edit this file only if the caching rules themselves change.)
 */
const CACHE = 'dengue-runtime';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // remove only this app's older caches (the origin may be shared with other apps, e.g. iCU Calc — leave theirs alone)
    for (const k of await caches.keys()) if (k.startsWith('dengue') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The page tells us its own URL once registered, so the very first visit is stored for offline use too.
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.cache) e.waitUntil(caches.open(CACHE).then(c => c.add(new Request(d.cache, { cache: 'reload' }))).catch(() => {}));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.get('X-Update-Check')) return;          // update downloads go straight to the network
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  e.respondWith(isPage ? cacheFirst(req) : staleWhileRevalidate(e, req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;                               // instant
  const res = await fetch(req);                            // first ever visit
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(e, req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  e.waitUntil(net.catch(() => {}));
  return cached || net;
}
