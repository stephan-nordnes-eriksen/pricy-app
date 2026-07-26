// Service worker — exists so Chrome/Android offers "Install app" (its
// installability check wants a manifest AND a non-empty fetch handler; iOS
// needs only the manifest + apple-touch-icon and ignores this file).
//
// ponytail: network-first, no precache, no cache versioning — a deploy always
// wins while online, so stale-shell bugs can't happen; the cache is only the
// offline fallback. Switch to cache-first + a versioned cache name if shell
// latency ever matters.
const CACHE = 'pricy-shell';

// Never cache the API (sessions, watches, personal data) or product images
// (R2-served, already immutable + far-future max-age).
const cacheable = (req) => {
  const u = new URL(req.url);
  return req.method === 'GET' && u.origin === self.location.origin
    && !u.pathname.startsWith('/api/') && !u.pathname.startsWith('/img/');
};

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (!cacheable(e.request)) return; // fall through to the network untouched
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
      }
      return res;
    }).catch(() => caches.match(e.request).then(
      // an offline deep link still gets the SPA shell, which routes client-side
      (hit) => hit || (e.request.mode === 'navigate' ? caches.match('/') : undefined)
        || Response.error(),
    )),
  );
});
