/* global self */
self.addEventListener('notificationclick', (event) => {
  const id = event.notification.data?.messageId
  event.notification.close()
  if (!Number.isSafeInteger(id) || id < 1) return
  const url = new URL(self.registration.scope)
  url.searchParams.set('chatMessage', String(id))
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find(window => window.url.startsWith(self.registration.scope))
    if (client) {
      client.postMessage({ type: 'themis-chat-notification', messageId: id })
      await client.focus()
    } else {
      await self.clients.openWindow(url.href)
    }
  })())
})
