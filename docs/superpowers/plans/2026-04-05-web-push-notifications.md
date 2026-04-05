# Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a Web Push notification to the user's Android device when a session finishes analysing, working even if the browser tab has been killed.

**Architecture:** The existing service worker (`public/sw.js`) gains `push` and `notificationclick` event handlers. A `usePushNotifications` hook subscribes the device on the status page and POSTs to a new `/api/push-subscription` route which upserts a single-row `push_subscriptions` table. `lib/push.ts` reads that row and calls `webpush.sendNotification()` from the end of `runClaudeAnalysis` in `lib/pipeline.ts`.

**Tech Stack:** `web-push` npm package, Supabase (existing), Next.js App Router API routes, Web Push API, Service Worker Push API

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260405000000_add_push_subscriptions.sql` | Create | DB migration for `push_subscriptions` table |
| `lib/push.ts` | Create | `sendPushNotification(sessionId, title)` helper |
| `lib/pipeline.ts` | Modify | Call `sendPushNotification` after status → `ready` |
| `app/api/push-subscription/route.ts` | Create | `POST` endpoint to upsert push subscription |
| `hooks/usePushNotifications.ts` | Create | Client hook to register + subscribe for push |
| `components/PipelineStatus.tsx` | Modify | Invoke `usePushNotifications` on mount |
| `public/sw.js` | Modify | Add `push` and `notificationclick` handlers |
| `.env.local.example` | Modify | Document `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| `__tests__/lib/push.test.ts` | Create | Unit tests for `sendPushNotification` |
| `__tests__/api/push-subscription.test.ts` | Create | Unit tests for POST route |

---

### Task 1: Generate VAPID keys and add env vars

**Files:**
- Modify: `.env.local.example`
- Modify: `.env.local` (local only, not committed)

- [ ] **Step 1: Generate VAPID keys**

```bash
npx web-push generate-vapid-keys
```

Expected output: two lines — a public key and a private key.

- [ ] **Step 2: Add keys to `.env.local`**

Add these two lines to `.env.local` (fill in the values from Step 1):

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<paste public key here>
VAPID_PRIVATE_KEY=<paste private key here>
```

- [ ] **Step 3: Document in `.env.local.example`**

Add after the `R2_PUBLIC_URL=` line:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

- [ ] **Step 4: Add `web-push` package**

```bash
npm install web-push
npm install --save-dev @types/web-push
```

- [ ] **Step 5: Commit**

```bash
git add .env.local.example package.json package-lock.json
git commit -m "chore: add web-push dependency and document VAPID env vars"
```

---

### Task 2: DB migration — `push_subscriptions` table

**Files:**
- Create: `supabase/migrations/20260405000000_add_push_subscriptions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260405000000_add_push_subscriptions.sql
create table push_subscriptions (
  id         integer primary key default 1,
  endpoint   text        not null,
  p256dh     text        not null,
  auth       text        not null,
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 2: Apply migration**

```bash
supabase db push
```

Expected: migration applied with no errors.

- [ ] **Step 3: Verify**

```bash
supabase db query --linked "select * from push_subscriptions;"
```

Expected: empty result set (no rows yet), no error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260405000000_add_push_subscriptions.sql
git commit -m "feat: add push_subscriptions table migration"
```

---

### Task 3: `lib/push.ts` — server-side push helper

**Files:**
- Create: `lib/push.ts`
- Create: `__tests__/lib/push.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/push.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn() } }))

import { createServerClient } from '@/lib/supabase-server'
import webpush from 'web-push'
import { sendPushNotification } from '@/lib/push'

describe('sendPushNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pubkey'
    process.env.VAPID_PRIVATE_KEY = 'privkey'
  })

  it('returns early and does not call sendNotification when no subscription row exists', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)

    await sendPushNotification('session-1', 'My Session')

    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('calls sendNotification with correct payload when subscription exists', async () => {
    const sub = { endpoint: 'https://fcm.example', p256dh: 'abc', auth: 'def' }
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: sub, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as any)

    await sendPushNotification('session-1', 'My Session')

    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://fcm.example', keys: { p256dh: 'abc', auth: 'def' } },
      JSON.stringify({ title: 'My Session', body: 'Your session is ready to review.', sessionId: 'session-1' }),
    )
  })

  it('does not throw when sendNotification rejects', async () => {
    const sub = { endpoint: 'https://fcm.example', p256dh: 'abc', auth: 'def' }
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: sub, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)
    vi.mocked(webpush.sendNotification).mockRejectedValue(new Error('push failed'))

    await expect(sendPushNotification('session-1', 'My Session')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- __tests__/lib/push.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/push'`

- [ ] **Step 3: Implement `lib/push.ts`**

```typescript
// lib/push.ts
import webpush from 'web-push'
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

export async function sendPushNotification(sessionId: string, title: string): Promise<void> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  if (!vapidPublicKey || !vapidPrivateKey) {
    log.error('VAPID keys not configured — skipping push notification', { sessionId })
    return
  }

  webpush.setVapidDetails('mailto:noreply@example.com', vapidPublicKey, vapidPrivateKey)

  const db = createServerClient()
  const { data: sub } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('id', 1)
    .single()

  if (!sub) return

  const payload = JSON.stringify({
    title,
    body: 'Your session is ready to review.',
    sessionId,
  })

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    )
    log.info('Push notification sent', { sessionId })
  } catch (err) {
    log.error('Push notification failed', { sessionId, err })
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/lib/push.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/push.ts __tests__/lib/push.test.ts
git commit -m "feat: add sendPushNotification helper"
```

---

### Task 4: `POST /api/push-subscription` route

**Files:**
- Create: `app/api/push-subscription/route.ts`
- Create: `__tests__/api/push-subscription.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/api/push-subscription.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn() } }))

import { createServerClient } from '@/lib/supabase-server'
import { POST } from '@/app/api/push-subscription/route'
import { NextRequest } from 'next/server'

describe('POST /api/push-subscription', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts subscription and returns 200', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert: upsertMock }),
    } as any)

    const req = new NextRequest('http://localhost/api/push-subscription', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: 'https://fcm.example',
        keys: { p256dh: 'abc', auth: 'def' },
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledWith({
      id: 1,
      endpoint: 'https://fcm.example',
      p256dh: 'abc',
      auth: 'def',
      updated_at: expect.any(String),
    })
  })

  it('returns 400 when body is missing required fields', async () => {
    const req = new NextRequest('http://localhost/api/push-subscription', {
      method: 'POST',
      body: JSON.stringify({ endpoint: 'https://fcm.example' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when upsert fails', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { message: 'db error' } }),
      }),
    } as any)

    const req = new NextRequest('http://localhost/api/push-subscription', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: 'https://fcm.example',
        keys: { p256dh: 'abc', auth: 'def' },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- __tests__/api/push-subscription.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/push-subscription/route'`

- [ ] **Step 3: Implement the route**

```typescript
// app/api/push-subscription/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { endpoint, keys } = body ?? {}

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db.from('push_subscriptions').upsert({
    id: 1,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    log.error('Failed to upsert push subscription', { error: error.message })
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }

  log.info('Push subscription saved')
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/api/push-subscription.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/push-subscription/route.ts __tests__/api/push-subscription.test.ts
git commit -m "feat: add POST /api/push-subscription route"
```

---

### Task 5: Call `sendPushNotification` from `pipeline.ts`

**Files:**
- Modify: `lib/pipeline.ts`
- Modify: `__tests__/lib/pipeline.test.ts`

- [ ] **Step 1: Add mock for `lib/push` to existing test file**

Open `__tests__/lib/pipeline.test.ts`. Add this mock at the top with the other `vi.mock` calls:

```typescript
vi.mock('@/lib/push', () => ({ sendPushNotification: vi.fn() }))
```

Also add this import after the other imports:

```typescript
import { sendPushNotification } from '@/lib/push'
```

- [ ] **Step 2: Add a test asserting `sendPushNotification` is called**

Add this test inside the existing `describe('runClaudeAnalysis')` block. You'll need to adapt the existing mock structure — here is a self-contained test that adds a named title expectation. Add it after the last existing `it(...)`:

```typescript
it('calls sendPushNotification with sessionId and title on success', async () => {
  const updateEqMock = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock })
  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { user_speaker_labels: ['A'], audio_r2_key: null, original_filename: 'talk.ogg' },
                error: null,
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'transcript_segments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'seg-a', speaker: 'A', text: 'Hola.' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'annotations') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
    }),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as any)
  vi.mocked(analyseUserTurns).mockResolvedValue({ annotations: [], title: 'Session Title' })
  vi.mocked(deleteObject).mockResolvedValue(undefined)

  await runClaudeAnalysis('session-1')

  expect(sendPushNotification).toHaveBeenCalledWith('session-1', 'Session Title')
})
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
npm test -- __tests__/lib/pipeline.test.ts
```

Expected: the new test FAIL — `sendPushNotification not called`

- [ ] **Step 4: Update `lib/pipeline.ts`**

Add the import at the top:

```typescript
import { sendPushNotification } from '@/lib/push'
```

Replace the final `await db.from('sessions').update(...)` block (lines 114–118) with:

```typescript
  await db.from('sessions').update({
    status: 'ready',
    title,
    processing_completed_at: new Date().toISOString(),
  }).eq('id', sessionId)

  await sendPushNotification(sessionId, title)
```

- [ ] **Step 5: Run all pipeline tests to confirm they pass**

```bash
npm test -- __tests__/lib/pipeline.test.ts
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline.ts __tests__/lib/pipeline.test.ts
git commit -m "feat: send push notification when analysis completes"
```

---

### Task 6: `usePushNotifications` hook

**Files:**
- Create: `hooks/usePushNotifications.ts`

No unit test for this hook — it depends entirely on browser APIs (`navigator.serviceWorker`, `PushManager`, `Notification`) that are not meaningfully testable in jsdom without extensive mocking that adds no value.

- [ ] **Step 1: Create the hook**

```typescript
// hooks/usePushNotifications.ts
'use client'
import { useEffect } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return
    if (!('PushManager' in window)) return
    if (Notification.permission === 'denied') return

    async function subscribe() {
      try {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          // Already subscribed — re-POST to ensure DB row is up to date
          await postSubscription(existing)
          return
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        await postSubscription(sub)
      } catch {
        // Silent failure — push unavailable or user denied
      }
    }

    subscribe()
  }, [])
}

async function postSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  await fetch('/api/push-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/usePushNotifications.ts
git commit -m "feat: add usePushNotifications hook"
```

---

### Task 7: Wire hook into `PipelineStatus`

**Files:**
- Modify: `components/PipelineStatus.tsx`
- Modify: `__tests__/components/PipelineStatus.test.tsx`

- [ ] **Step 1: Add mock for the hook to the existing test**

Open `__tests__/components/PipelineStatus.test.tsx`. Add this mock after the existing `vi.mock('next/navigation', ...)` line:

```typescript
vi.mock('@/hooks/usePushNotifications', () => ({ usePushNotifications: vi.fn() }))
```

- [ ] **Step 2: Run existing tests to confirm they still pass**

```bash
npm test -- __tests__/components/PipelineStatus.test.tsx
```

Expected: all existing tests PASS

- [ ] **Step 3: Import and call the hook in `PipelineStatus`**

Add the import at the top of `components/PipelineStatus.tsx`:

```typescript
import { usePushNotifications } from '@/hooks/usePushNotifications'
```

Add the hook call inside the `PipelineStatus` function body, after the existing `useState`/`useRef` declarations:

```typescript
  usePushNotifications()
```

- [ ] **Step 4: Run tests to confirm they still pass**

```bash
npm test -- __tests__/components/PipelineStatus.test.tsx
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/PipelineStatus.tsx __tests__/components/PipelineStatus.test.tsx
git commit -m "feat: register push subscription on status page"
```

---

### Task 8: Add push handlers to `sw.js`

**Files:**
- Modify: `public/sw.js`

No unit test — service worker push events require a browser environment.

- [ ] **Step 1: Add push and notificationclick handlers**

Append to the end of `public/sw.js`:

```js
// ── Push notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (e) => {
  if (!e.data) return
  const { title, body, sessionId } = e.data.json()
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      data: { sessionId },
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const { sessionId } = e.notification.data ?? {}
  if (!sessionId) return
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const target = `/sessions/${sessionId}`
      for (const client of clientList) {
        if (client.url.includes(target) && 'focus' in client) return client.focus()
      }
      return clients.openWindow(target)
    })
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add public/sw.js
git commit -m "feat: add push and notificationclick handlers to service worker"
```

---

### Task 9: Full run test and manual smoke test

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS, no regressions

- [ ] **Step 2: Build to verify no TypeScript/import errors**

```bash
npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 3: Manual smoke test on Android**

1. Open the app in Chrome on Android and navigate to a session's status page (or trigger a new upload)
2. Chrome should prompt for notification permission — tap Allow
3. Complete a session analysis (or re-analyse an existing session via the retry button)
4. Switch to another Android app
5. Expect: a push notification appears with the session title and "Your session is ready to review."
6. Tap the notification — expect: Chrome opens and navigates to `/sessions/:id`
