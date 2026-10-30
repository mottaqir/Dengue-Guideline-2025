/* Dengue Guide — service worker
 *  • HTML / navigation: NETWORK-FIRST (always the newest file when online; cached copy if offline or the network is slow > 4 s)
 *  • everything else (icons, manifest, fonts): stale-while-revalidate
 * Because the page is always fetched fresh, you never have to bump a version number after editing the HTML.
 * (Only edit this file if you change the caching rules themselves — the browser auto-detects changes to sw.js.)
 */
const CACHE = 'dengue-runtime';            // single fixed name — content is refreshed in place
const SLOW_MS = 4000;

self.addEventListener('install', e => { self.skipWaiting(); });

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // remove only this app's older caches (the origin may be shared with other apps, e.g. iCU Calc — leave theirs alone)
    for (const k of await caches.keys()) if (k.startsWith('dengue') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// The page tells us its own URL once registered, so the first visit is available offline too.
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.cache) e.waitUntil(caches.open(CACHE).then(c => c.add(new Request(d.cache, { cache: 'reload' }))).catch(() => {}));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isPage) { e.respondWith(networkFirst(e, req)); return; }
  e.respondWith(staleWhileRevalidate(e, req));
});

async function networkFirst(e, req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req, { cache: 'no-store' }).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  });
  e.waitUntil(net.catch(() => {}));            // keep updating the cache even if we answered from it
  if (!cached) return net.catch(() => Response.error());
  const slow = new Promise(r => setTimeout(() => r(cached), SLOW_MS));
  return Promise.race([net.catch(() => cached), slow]);
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
