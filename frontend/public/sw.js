/* Минимальный service worker — нужен, чтобы «Задачи — <имя>» ставились как приложение
   (PWA) и открывались даже при плохой сети. Кэшируем оболочку, API всегда идёт в сеть. */
const CACHE = 'albert-tasks-shell-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // подчищаем старые версии кэша, чтобы они не копились
  const keys = await caches.keys()
  await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  await self.clients.claim()
})()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return  // данные — всегда из сети

  // сеть-первым с подстраховкой кэшем (офлайн → отдаём сохранённую оболочку)
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
