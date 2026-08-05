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

// Web Push: payload is the JSON the worker's sendPush encrypted —
// { title, body, url }. Click focuses the installed app (or opens a tab)
// on the payload's URL.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'Pricy', {
    body: d.body || '',
    icon: '/icon-512.png',
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const w = wins[0];
    return w ? w.focus().then(() => w.navigate(url)) : self.clients.openWindow(url);
  }));
});

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
