// Service worker de la plateforme : appli installable, pages déjà visitées lisibles hors ligne.
// Pages : réseau d'abord (toujours à jour), copie de secours en cache. Fichiers /_astro (noms hachés) : cache d'abord.
// L'API n'est jamais mise en cache (données privées, toujours fraîches).
const VERSION = 'huburton-os-v3'
const STATIC = ['/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/offline.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION)
      try {
        const res = await fetch(req)
        if (res.ok) cache.put(url.pathname, res.clone())
        return res
      } catch {
        return (await cache.match(url.pathname)) ?? (await cache.match('/offline.html')) ?? Response.error()
      }
    })())
    return
  }
  if (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)) }
      return res
    })))
  }
})
