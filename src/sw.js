// Kinspirit service worker: works offline (app files are cached) and shows push notifications.
// The push handlers sit at the top level on purpose: browsers only deliver push events to handlers
// registered while the worker file is first read.
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Files shared from other apps arrive as a form post. Park them in a cache and open the app.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData()
        const files = form.getAll('files').filter((f) => typeof f !== 'string')
        const cache = await caches.open('kinspirit-share')
        for (const k of await cache.keys()) await cache.delete(k)
        let i = 0
        for (const f of files) {
          await cache.put(
            '/shared/' + i++,
            new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Name': encodeURIComponent(f.name || 'shared-file') } }),
          )
        }
        return Response.redirect('/?share=' + files.length, 303)
      } catch (e) {
        return Response.redirect('/', 303)
      }
    })(),
  )
})

self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch (e) {
    d = { title: 'Kinspirit', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(self.navigator.userAgent)
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // The open app already shows new messages itself. iPhones insist every push is shown.
      if (!d.test && !ios && open.some((c) => c.visibilityState === 'visible' && c.focused)) return
      await self.registration.showNotification(d.title || 'Kinspirit', {
        body: d.body || '',
        tag: d.cid || 'kinspirit',
        renotify: true,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        requireInteraction: d.call === true,
        data: { cid: d.cid },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const cid = event.notification.data && event.notification.data.cid
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (all.length) {
        const c = all[0]
        await c.focus()
        if (cid) c.postMessage({ type: 'open-chat', cid })
        return
      }
      await self.clients.openWindow(cid ? '/?chat=' + cid : '/')
    })(),
  )
})
