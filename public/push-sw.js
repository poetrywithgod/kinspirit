// Pulled into the app's service worker: shows a notification when a message arrives while the app is closed.
self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch (e) {}
  event.waitUntil(
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(self.navigator.userAgent)
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // The open app already shows new messages itself. iPhones insist every push is shown.
      if (!ios && open.some((c) => c.visibilityState === 'visible' && c.focused)) return
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
