/* Minimal service worker for the whole site (the dashboard + the "Tasks" assistant) — it is
   what lets the PWA install properly on the home screen and open even on a poor connection.
   We cache the shell (HTML/JS/CSS); API calls always go to the network — personal data is never cached. */
const CACHE = 'redlava-shell-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // clear out old cache versions so they don't pile up
  const keys = await caches.keys()
  await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  await self.clients.claim()
})()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return  // data always comes from the network

  // network-first with a cache fallback (offline → serve the stored shell)
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        return res
      })
      .catch(() => caches.match(req))
  )
})
