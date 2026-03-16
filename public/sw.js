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

function storeFile(file) {
  return new Promise(async (resolve, reject) => {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(file, 'file')
    tx.oncomplete = () => resolve()
    tx.onerror = (e) => reject(e.target.error)
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
    // 1. Parse the shared file from the multipart POST body
    const formData = await e.request.formData()
    const file = formData.get('audio')

    // 2. Write to IndexedDB — MUST complete before redirect so page.tsx can read it
    if (file instanceof File) {
      await storeFile(file)
    }

    // 3. Open or focus the app window
    const allClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    if (allClients.length > 0) {
      await allClients[0].focus()
    } else {
      await self.clients.openWindow('/')
    }

    // 4. Redirect to home — browser navigates the app
    return Response.redirect('/', 303)
  })()

  // waitUntil keeps the SW alive for the duration of the async work (IndexedDB write included)
  e.waitUntil(work)
  e.respondWith(work)
})
