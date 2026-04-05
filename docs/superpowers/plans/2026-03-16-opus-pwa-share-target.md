# OPUS Support + PWA Web Share Target Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `.opus` file support to the upload dropzone and make the app installable as an Android PWA that receives audio files from the WhatsApp share sheet.

**Architecture:** Two independent additions. (1) Extend client-side format validation in `DropZone.tsx` to accept `.opus`/`audio/ogg`. (2) Add a `manifest.json` with a `share_target`, a service worker that intercepts the share POST and writes the file to IndexedDB, and a `useEffect` in `page.tsx` that reads and auto-uploads the stored file on load.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest + React Testing Library, native browser IndexedDB API (no library).

---

## Chunk 1: OPUS File Support

### Task 1: Add OPUS to DropZone validation

**Files:**
- Modify: `.worktrees/feature/conversation-coach-mvp/components/DropZone.tsx`
- Create: `.worktrees/feature/conversation-coach-mvp/__tests__/components/DropZone.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/DropZone.test.tsx`:

```tsx
// __tests__/components/DropZone.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DropZone } from '@/components/DropZone'

function makeFile(name: string, type: string, size = 100): File {
  return new File(['x'.repeat(size)], name, { type })
}

describe('DropZone — OPUS support', () => {
  it('accepts a .opus file by extension', () => {
    const onFile = vi.fn()
    render(<DropZone onFile={onFile} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('audio.opus', 'audio/ogg')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)
    expect(screen.queryByText(/unsupported format/i)).toBeNull()
  })

  it('accepts a .opus file with audio/ogg MIME type', () => {
    const onFile = vi.fn()
    render(<DropZone onFile={onFile} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('voice_note.opus', 'audio/ogg')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('shows an error for an unsupported format', () => {
    const onFile = vi.fn()
    render(<DropZone onFile={onFile} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('video.mp4', 'video/mp4')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).not.toHaveBeenCalled()
    expect(screen.getByText(/unsupported format/i)).toBeInTheDocument()
  })

  it('still accepts .mp3 files', () => {
    const onFile = vi.fn()
    render(<DropZone onFile={onFile} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('conv.mp3', 'audio/mpeg')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('input accept attribute includes .opus', () => {
    render(<DropZone onFile={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toContain('.opus')
  })

  it('hint text mentions OPUS', () => {
    render(<DropZone onFile={vi.fn()} />)
    expect(screen.getByText(/opus/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd .worktrees/feature/conversation-coach-mvp
npm test -- __tests__/components/DropZone.test.tsx
```

Expected: 4–6 failures (OPUS not in accepted types, missing from accept attr, hint text unchanged).

- [ ] **Step 3: Update DropZone.tsx**

In `components/DropZone.tsx`, make these exact changes:

```tsx
// Change these three constants:
const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/ogg']
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.opus']
const MAX_BYTES = 500 * 1024 * 1024 // 500 MB (unchanged)

// In validate(), update the error message:
if (!validType) return `Unsupported format. Use MP3, M4A, WAV, or OPUS.`

// In the JSX, update hint text:
<p className="text-sm text-gray-500 mt-1">MP3, M4A, WAV, OPUS · up to 500 MB / 2 hours</p>

// Update the <input> accept attribute:
<input
  ref={inputRef}
  type="file"
  accept=".mp3,.m4a,.wav,.opus"
  className="hidden"
  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
/>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/components/DropZone.test.tsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/DropZone.tsx __tests__/components/DropZone.test.tsx
git commit -m "feat: add OPUS audio format support to upload dropzone"
```

---

## Chunk 2: PWA Web Share Target

### Task 2: Create PWA manifest and placeholder icons

**Files:**
- Create: `.worktrees/feature/conversation-coach-mvp/public/manifest.json`
- Create: `.worktrees/feature/conversation-coach-mvp/public/icon-192.png`
- Create: `.worktrees/feature/conversation-coach-mvp/public/icon-512.png`

No automated test for static assets — verified manually at Step 3.

- [ ] **Step 1: Create `public/manifest.json`**

```json
{
  "name": "Conversation Coach",
  "short_name": "Coach",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f0f0f",
  "theme_color": "#0f0f0f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ],
  "share_target": {
    "action": "/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "files": [{ "name": "audio", "accept": ["audio/*"] }]
    }
  }
}
```

- [ ] **Step 2: Generate placeholder PNG icons**

Run this Node script once from the worktree root:

```bash
node -e "
const fs = require('fs');
// Minimal valid 1x1 transparent PNG — browsers scale it; replace with real artwork before shipping
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync('public/icon-192.png', png);
fs.writeFileSync('public/icon-512.png', png);
console.log('Placeholder icons written.');
"
```

> **Note:** These are intentional placeholder icons. Replace `public/icon-192.png` and `public/icon-512.png` with properly sized artwork before deploying. For correct Android adaptive icon rendering, add a `"purpose": "maskable"` variant with 20% safe-zone padding around the artwork.

- [ ] **Step 3: Verify manifest is served**

Start the dev server (`npm run dev`) and open `http://localhost:3000/manifest.json` in a browser. Confirm the JSON is returned with all fields including `share_target`.

- [ ] **Step 4: Commit**

```bash
git add public/manifest.json public/icon-192.png public/icon-512.png
git commit -m "feat: add PWA manifest with share_target"
```

---

### Task 3: Create service worker

**Files:**
- Create: `.worktrees/feature/conversation-coach-mvp/public/sw.js`

The service worker runs in the browser, not Node — it cannot be unit tested with Vitest. Verification is manual (Step 3).

- [ ] **Step 1: Create `public/sw.js`**

```javascript
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
```

- [ ] **Step 2: Verify the SW file is served**

With dev server running, open `http://localhost:3000/sw.js` in a browser. Confirm the JavaScript is returned without a 404.

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat: add service worker for PWA share target"
```

---

### Task 4: Register manifest and service worker in layout

**Files:**
- Modify: `.worktrees/feature/conversation-coach-mvp/app/layout.tsx`

- [ ] **Step 1: No automated test for layout.tsx — verification is manual (Step 3). Proceed to Step 2.**

- [ ] **Step 2: Update `app/layout.tsx`**

Replace the current file with:

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Conversation Coach',
  description: 'Analyse your Spanish conversations',
  manifest: '/manifest.json',
  themeColor: '#0f0f0f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* SW registration: runtime behaviour, not a document-head metadata concern */}
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
          }
        ` }} />
      </head>
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-lg font-semibold tracking-tight">Conversation Coach</a>
          <a href="/practice" className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Practice Items
          </a>
        </nav>
        <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify in browser**

With dev server running, open `http://localhost:3000` and check DevTools:
- **Application → Manifest**: should show "Conversation Coach" with the `share_target` entry
- **Application → Service Workers**: `sw.js` should be registered and active
- **Console**: no errors

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
npm test
```

Expected: all tests PASS (layout changes do not affect existing tests).

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: register PWA manifest and service worker in layout"
```

---

### Task 5: Add /share-target fallback route

**Files:**
- Create: `.worktrees/feature/conversation-coach-mvp/app/share-target/route.ts`

This route handles the POST from the browser on the very first share, before the service worker has installed. It simply redirects to `/`. On all subsequent shares, the SW intercepts the request before it reaches this handler.

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/share-target.test.ts`:

```ts
// __tests__/api/share-target.test.ts
import { describe, it, expect } from 'vitest'
import { POST } from '@/app/share-target/route'

describe('POST /share-target', () => {
  it('redirects to /', async () => {
    const req = new Request('http://localhost/share-target', { method: 'POST' })
    let redirected = false
    let redirectUrl = ''
    // next/navigation redirect throws a special error in test env — catch it
    try {
      await POST(req)
    } catch (e: unknown) {
      // Next.js redirect() throws NEXT_REDIRECT
      if (e && typeof e === 'object' && 'digest' in e) {
        const digest = (e as { digest: string }).digest
        redirected = digest.includes('NEXT_REDIRECT')
        redirectUrl = digest
      }
    }
    expect(redirected).toBe(true)
    expect(redirectUrl).toContain('/')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/api/share-target.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `app/share-target/route.ts`**

```ts
// app/share-target/route.ts
import { redirect } from 'next/navigation'

// Handles the share target POST on first share (before SW is installed).
// The SW intercepts this route on all subsequent shares.
export async function POST() {
  redirect('/')
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- __tests__/api/share-target.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/share-target/route.ts __tests__/api/share-target.test.ts
git commit -m "feat: add /share-target fallback route for first share before SW installs"
```

---

### Task 6: Add IndexedDB share pickup to page.tsx

**Files:**
- Modify: `.worktrees/feature/conversation-coach-mvp/app/page.tsx`

- [ ] **Step 1: Write the failing test**

Add a new describe block to a new test file `__tests__/components/HomePage.share.test.tsx` (kept separate from any existing HomePage tests to avoid test setup complexity):

```tsx
// __tests__/components/HomePage.share.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock fetch for sessions list and session creation
global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
  if (url === '/api/sessions' && (!options?.method || options.method === 'GET')) {
    return Promise.resolve({ json: () => Promise.resolve([]) })
  }
  if (url === '/api/sessions' && options?.method === 'POST') {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ session_id: 's1', upload_url: 'http://r2/put' }) })
  }
  // R2 PUT, upload-complete, etc.
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
})

// Minimal IndexedDB mock
function setupIDB(file: File | null) {
  const store: Record<string, unknown> = file ? { file } : {}
  const mockIDB = {
    open: vi.fn().mockImplementation(() => {
      const req: Record<string, unknown> = {}
      setTimeout(() => {
        const db = {
          transaction: vi.fn().mockImplementation(() => {
            const tx: Record<string, unknown> = {}
            const objectStore = {
              get: vi.fn().mockImplementation(() => {
                const getReq: Record<string, unknown> = {}
                setTimeout(() => {
                  ;(getReq as { result: unknown }).result = store['file'] ?? undefined
                  ;(getReq as { onsuccess?: () => void }).onsuccess?.()
                }, 0)
                return getReq
              }),
              delete: vi.fn().mockImplementation(() => {
                delete store['file']
              }),
            }
            tx.objectStore = vi.fn().mockReturnValue(objectStore)
            setTimeout(() => {
              ;(tx as { oncomplete?: () => void }).oncomplete?.()
            }, 10)
            return tx
          }),
        }
        ;(req as { result: unknown }).result = db
        ;(req as { onsuccess?: () => void }).onsuccess?.()
      }, 0)
      return req
    }),
  }
  Object.defineProperty(global, 'indexedDB', { value: mockIDB, writable: true })
}

describe('HomePage — share pickup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules() // force fresh module import per test — avoids useEffect running with stale IDB mock
  })

  it('calls handleFile with the stored file on mount if a share is pending', async () => {
    const sharedFile = new File(['audio'], 'voice_note.opus', { type: 'audio/ogg' })
    setupIDB(sharedFile)

    // Import after mocks are set up
    const { default: HomePage } = await import('@/app/page')

    // Verify the upload flow is triggered by checking "Uploading…" appears in the DOM
    const { getByText } = render(<HomePage />)

    await waitFor(() => {
      // "Uploading…" text appears when handleFile is called
      expect(getByText(/uploading/i)).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('does nothing if no share is pending', async () => {
    setupIDB(null)
    const { default: HomePage } = await import('@/app/page')
    const { queryByText } = render(<HomePage />)
    await new Promise(r => setTimeout(r, 100))
    expect(queryByText(/uploading/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/components/HomePage.share.test.tsx
```

Expected: FAIL — `indexedDB` not referenced in `page.tsx`.

- [ ] **Step 3: Add IndexedDB helper and `useEffect` to `page.tsx`**

Add the helper function at the bottom of the file (alongside `getAudioDuration`):

```ts
function readPendingShare(): Promise<File | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open('conversation-coach-db', 1)
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result.createObjectStore('pending-share')
    }
    req.onsuccess = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      const tx = db.transaction('pending-share', 'readwrite')
      const store = tx.objectStore('pending-share')
      const getReq = store.get('file')
      getReq.onsuccess = () => {
        const file = (getReq as IDBRequest<File | undefined>).result ?? null
        if (file) store.delete('file')
        tx.oncomplete = () => resolve(file)
      }
      getReq.onerror = () => resolve(null)
    }
    req.onerror = () => resolve(null)
  })
}
```

Add this `useEffect` to `HomePage`, after the existing sessions-fetch effect:

```ts
// Check for a file shared via the PWA share target
useEffect(() => {
  if (typeof indexedDB === 'undefined') return
  readPendingShare().then(file => {
    if (file) handleFile(file)
  })
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

> **Note on the empty deps array:** The preferred approach is to wrap `handleFile` in `useCallback` with its deps (`title`, `router`) so `react-hooks/exhaustive-deps` is satisfied without a lint-disable comment:
>
> ```ts
> const handleFile = useCallback(async (file: File) => { ... }, [title, router])
> ```
>
> If `handleFile` is not wrapped in `useCallback`, use `// eslint-disable-line react-hooks/exhaustive-deps` on the effect — the run-once-on-mount behaviour is intentional.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/components/HomePage.share.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx __tests__/components/HomePage.share.test.tsx
git commit -m "feat: auto-upload audio files shared via PWA share target"
```

---

## Manual End-to-End Verification

Once all tasks are complete, verify the full flow on Android:

1. Deploy the app to Vercel (or use `ngrok` to expose the local dev server over HTTPS — service workers require HTTPS)
2. Open the app in Chrome on Android
3. Tap the browser menu → "Add to Home screen" → confirm
4. Open WhatsApp → find a voice note → tap and hold → Share → select "Conversation Coach" from the share sheet
5. Confirm the app opens to the home screen and immediately starts uploading
6. Confirm the session status page appears and processing begins

> **HTTPS requirement:** Service workers only register on `https://` origins (or `localhost`). The app must be deployed to Vercel or tunnelled via a secure proxy before testing on a real device.
