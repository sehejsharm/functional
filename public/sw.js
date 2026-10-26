// Network-first app shell cache so the Employee portal opens on flaky back-of-house wifi.
const CACHE = 'mise-shell-v1'
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html']))); self.skipWaiting() })
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  e.respondWith(
    fetch(req)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res })
      .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
  )
})
