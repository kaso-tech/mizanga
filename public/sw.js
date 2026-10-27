// Service worker de Gilli : rend l’application installable et utilisable hors connexion
// pour son interface. Les échanges avec le moteur d’IA (/api/*) ne sont jamais mis en cache.
// Il affiche aussi les notifications des alertes de recherche (Web Push).
const CACHE = 'gilli-v3'
const SHELL = ['/', '/manifest.webmanifest', '/favicon.png', '/brand/mark.png', '/icons/icon-192.png']

// Met en cache l’interface et les fichiers compilés qu’elle référence (script et feuille de style à empreinte),
// pour que l’application s’ouvre hors connexion dès le deuxième lancement.
async function precache() {
  const cache = await caches.open(CACHE)
  await cache.addAll(SHELL)
  const page = await (await cache.match('/'))?.text()
  const assets = [...(page ?? '').matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1])
  await cache.addAll(assets)
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  // Pages : réseau d’abord (pour toujours obtenir la dernière version), page en cache si hors connexion.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // Fichiers à empreinte (dist/assets), polices et icônes : cache d’abord, ils ne changent jamais.
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/brand/'))) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
      }
      return response
    })),
  )
})

// Notification d’une alerte : « Nouvelle annonce : … », qui ouvre l’annonce au toucher.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/marketplace/alertes'
  event.waitUntil(self.registration.showNotification(data.title || 'Gilli', {
    body: data.body || 'Une nouvelle annonce correspond à votre alerte.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag,
    data: { url },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/marketplace/alertes', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (open) {
      await open.navigate(url).catch(() => undefined)
      return open.focus()
    }
    return self.clients.openWindow(url)
  })())
})
