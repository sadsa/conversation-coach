# Web Push Notifications — Design Spec

**Date:** 2026-04-05
**Status:** Approved

## Overview

Send a Web Push notification to the user's Android device when a session finishes analysing. The user typically triggers analysis then switches to another app, so the notification must work even if Chrome has backgrounded or killed the tab.

## Architecture

```
pipeline.ts (runClaudeAnalysis)
  └─ sets status = 'ready'
  └─ calls sendPushNotification(sessionId, title)

lib/push.ts
  └─ reads push_subscriptions row from Supabase
  └─ calls webpush.sendNotification()

sw.js (push event handler)
  └─ showNotification(title, body)
  └─ notificationclick → clients.openWindow(/sessions/:id)

PipelineStatus.tsx
  └─ usePushNotifications hook
       └─ subscribes via pushManager.subscribe(VAPID public key)
       └─ POSTs to /api/push-subscription (upserts DB row)
```

## Components

### DB: `push_subscriptions` table

Single-row table (single-user app). Upserted on each subscription registration.

```sql
create table push_subscriptions (
  id       integer primary key default 1,
  endpoint text    not null,
  p256dh   text    not null,
  auth     text    not null,
  updated_at timestamptz not null default now()
);
```

### `lib/push.ts`

Helper called from `pipeline.ts` after status → `ready`.

- Reads the single `push_subscriptions` row
- Returns silently if none exists (user never granted permission)
- Calls `webpush.sendNotification()` with payload `{ title, body, sessionId }`
- Logs push errors but does not throw — push failure must not affect the pipeline

### `POST /api/push-subscription`

Upserts the push subscription row. Body: `{ endpoint, keys: { p256dh, auth } }`.
Returns 200 on success, 500 on DB error.

### `usePushNotifications` hook

Client-side hook, invoked from `PipelineStatus`.

1. Checks `'PushManager' in window` and `Notification.permission !== 'denied'`
2. Gets the active SW registration
3. Calls `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY })`
4. POSTs subscription to `/api/push-subscription`
5. Fails silently — no visible error shown to the user if push is unavailable or denied

### `sw.js` additions

```js
self.addEventListener('push', (e) => {
  const { title, body, sessionId } = e.data.json()
  e.waitUntil(
    self.registration.showNotification(title, { body, data: { sessionId } })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const { sessionId } = e.notification.data
  e.waitUntil(clients.openWindow(`/sessions/${sessionId}`))
})
```

## Environment Variables

Two new vars added to `.env.local` and Vercel:

- `VAPID_PUBLIC_KEY` — exposed to client as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY` — server-only

Generated once with `npx web-push generate-vapid-keys`.

## Dependencies

- `web-push` npm package (server-side only)

## Error Handling

- Push subscription failure: silent, no UI error
- Push send failure: logged via `log.error`, does not throw
- Missing subscription row: `sendPushNotification` returns early

## Out of Scope

- Multiple device support (single subscription row per single-user app)
- Notification preferences/settings UI
- Notifications for error states (only `ready` is notified)
