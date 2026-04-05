# Session Delete — Design Spec

**Date:** 2026-03-30

## Problem

Sessions that get stuck in a processing state (e.g. "Analysing…" forever) cannot be removed. Users need a way to delete them — and any other session — from the Past Sessions list.

## Approach

Swipe-left on a session row to reveal a red "Delete" background label. Swiping past the 80px threshold opens a confirmation modal warning the user that all associated data will be deleted. Confirmed deletion removes the row via a new API endpoint and animates the row out of the list.

Mirrors the existing `SwipeableItem` pattern in `PracticeList`.

---

## Architecture

### `components/SessionList.tsx`

- Convert from a pure presentational component to a `'use client'` component.
- Extract a `SwipeableSessionItem` sub-component (same file) that owns:
  - Swipe state (`translateX`, `isAnimating`, `rowHeight`) via `useSwipeable`
  - Slide-out + row-collapse animation on delete (same two-phase approach as `SwipeableItem`)
  - A `confirmPending` boolean that controls whether the confirmation modal is shown
- `SessionList` gains an `onDeleted: (id: string) => void` prop.
- On swipe > 80px: set `confirmPending = true` and snap `translateX` back to 0 (modal opens, row returns to rest position).
- On modal "Delete": fire the delete API call, run slide-out + collapse animation, call `onDeleted`.
- On modal "Cancel": dismiss modal, no animation.
- On delete failure: show a toast ("Couldn't delete session — try again."), no animation change needed since the row never moved.

### `app/page.tsx`

- Pass `onDeleted` to `SessionList`:
  ```ts
  function handleSessionDeleted(id: string) {
    const interval = pollingRefs.current.get(id)
    if (interval) { clearInterval(interval); pollingRefs.current.delete(id) }
    setSessions(prev => prev.filter(s => s.id !== id))
  }
  ```

### `app/api/sessions/[id]/route.ts`

- Add `DELETE` handler: deletes the session row from Supabase. Child rows (transcript_segments, annotations, practice_items) are already covered by `ON DELETE CASCADE` in the DB schema (confirmed in `001_initial.sql`). Returns `{ ok: true }` on success.

---

## Modal Copy

**Title:** Delete session?

**Body:** `<session title>` will be permanently deleted, along with all its annotations and any practice items you've saved from it. This can't be undone.

**Actions:** Cancel | Delete (red)

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| DELETE API returns non-2xx | Toast: "Couldn't delete session — try again." Row stays in list. |
| Session is being polled | `onDeleted` clears the polling interval before removing from state. |
| Component unmounts during animation | `mountedRef` guard prevents state updates (same as `SwipeableItem`). |

---

## What's Not Changing

- No DB migration needed — cascades already exist.
- No R2 cleanup needed — audio is deleted after transcription completes.
- `Modal` component is reused as-is.
- `react-swipeable` is already installed.
