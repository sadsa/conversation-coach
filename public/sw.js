// public/sw.js
const DB_NAME = 'conversation-coach-db'
const DB_VERSION = 1
const STORE_NAME = 'pending-share'

// ── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = (e) => reject(e.target.error)
  })
}

async function storeFile(file) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(file, 'file')
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = (e) => reject(e.target.error)
    tx.onabort = (e) => reject(e.target.error)
  })
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// ── Share target ─────────────────────────────────────────────────────────────

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (url.pathname !== '/share-target' || e.request.method !== 'POST') return

  const work = (async () => {
    try {
      // 1. Parse the shared file from the multipart POST body
      const formData = await e.request.formData()
      const file = formData.get('audio')

      // 2. Write to IndexedDB — MUST complete before redirect so page.tsx can read it
      if (!(file instanceof File)) {
        console.warn('[sw] share-target: no audio file in form data', { type: typeof file, value: file })
        return Response.redirect('/', 303)
      }
      await storeFile(file)
    } catch (err) {
      console.error('[sw] share-target error:', err)
    }

    // Always redirect home, even on error
    return Response.redirect('/', 303)
  })()

  // waitUntil keeps the SW alive for the duration of the async work (IndexedDB write included)
  e.waitUntil(work)
  e.respondWith(work)
})

// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (e) => {
  if (!e.data) return
  let payload
  try {
    payload = e.data.json()
  } catch {
    console.warn('[sw] push: invalid JSON payload')
    return
  }
  const { title, body, sessionId } = payload
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      vibrate: [200, 100, 200],
      data: { sessionId },
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const { sessionId } = e.notification.data ?? {}
  if (!sessionId) return
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const target = `/sessions/${sessionId}`
      for (const client of clientList) {
        if (client.url.includes(target) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(target)
    })
  )
})
