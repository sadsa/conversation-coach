# Design: Practice Toggle, Processing Time, Home Page Polling

Date: 2026-03-28

## Overview

Three related UX improvements:
1. Toggle practice items on/off from the annotation card (remove as well as add)
2. Track and display pipeline processing time per session
3. Stay on the home page after upload — show processing status inline rather than navigating away

---

## Feature 1: Remove from Practice List

### Problem
Once an annotation is added to the practice list, the button becomes disabled with no way to undo. The user must go to the practice page to delete it.

### Design

**`GET /api/sessions/:id`** — change `practice_items` select from `annotation_id` to `id, annotation_id`. Return a map `addedAnnotations: Record<annotationId, practiceItemId>` instead of the current flat `addedAnnotationIds: string[]`.

**`lib/types.ts`** — update `SessionDetail.addedAnnotationIds: string[]` to `addedAnnotations: Record<string, string>`.

**`app/sessions/[id]/page.tsx`** — change state from `Set<string>` to `Map<string, string>` (annotationId → practiceItemId). Add `handleAnnotationRemoved(annotationId)` that removes from the map. Pass both callbacks and the map to `TranscriptView`.

**`components/TranscriptView.tsx`** — thread updated props through to `AnnotationCard`.

**`components/AnnotationCard.tsx`**:
- Props: replace `isAdded: boolean` with `practiceItemId: string | null`
- Local state: `practiceItemId: string | null` (initialised from prop)
- `handleAdd`: POST as before; on success store returned `id` in state, call `onAnnotationAdded(annotationId, practiceItemId)`
- `handleRemove`: `DELETE /api/practice-items/:practiceItemId`; on success set `practiceItemId` to null, call `onAnnotationRemoved(annotationId)`
- When `practiceItemId` is non-null: show a clickable "✓ Added to practice list" button styled in muted grey (not disabled) that calls `handleRemove` on click. No hover-only state — tapping it directly removes the item (mobile-first)
- When null: show the "Add to practice list" indigo button as before

The `DELETE /api/practice-items/[id]` endpoint already exists — no API changes needed.

---

## Feature 2: Processing Time Tracking

### Problem
No record of how long the pipeline takes per session (upload → ready).

### Design

**Migration** — add `processing_completed_at timestamptz` (nullable) to `sessions`. Existing rows remain null (no time shown for them).

**`lib/pipeline.ts`** — when writing `status: 'ready'`, also set `processing_completed_at: new Date().toISOString()`. Re-analysis updates this field to reflect the latest run.

**`GET /api/sessions`** — add `processing_completed_at` to the select column list.

**`lib/types.ts`** — add `processing_completed_at: string | null` to `SessionListItem`.

**`components/SessionList.tsx`** — for `ready` sessions with non-null `processing_completed_at`, compute elapsed seconds as `Math.round((new Date(processing_completed_at) - new Date(created_at)) / 1000)` and display inline after the audio duration: `· ⚡ 1m 23s`. Re-use the existing `formatDuration` helper.

---

## Feature 3: Stay on Home Page After Upload (with polling)

### Problem
After upload completes, the app navigates to `/sessions/:id/status`. The user wants to stay on the home page and see the processing state inline.

### Design

**`app/page.tsx`**:
- Remove `router.push(...)` after `upload-complete` succeeds
- Instead, prepend the new session to the local `sessions` state with status `transcribing` (the first post-upload status)
- Start polling `GET /api/sessions/:id/status` every 3 seconds for any session in the list whose status is not `ready` or `error`
- On each poll response, update that session's `status` (and `processing_completed_at` once ready) in local state
- Stop polling a session once it reaches `ready` or `error`
- Clean up all polling intervals on component unmount

**`components/SessionList.tsx`** — for sessions not yet `ready` or `error`, render a spinning indicator next to the status label. Add an indigo left border (`border-l-2 border-indigo-600 bg-[#0d0f1e]`) to the row to visually distinguish it as active. Tapping still navigates to `/sessions/:id/status` for detail.

**Polling endpoint** — `GET /api/sessions/:id/status` already exists and returns `{ status, error_stage }`. To also get `processing_completed_at` when ready, update this endpoint to include it in the response, or use a separate fetch of the session list on completion.

**Simplest approach for completion**: when a polled session reaches `ready`, re-fetch `GET /api/sessions` to refresh the full list (gets `processing_completed_at` and final title in one shot), then stop polling.

**`lib/types.ts`** — update `StatusResponse` to include `processing_completed_at: string | null`.

### Polling implementation detail
Use a `useRef` map of `sessionId → intervalId` to track active polls. On mount, start polling for any non-terminal session already in the list (handles page refresh mid-processing). On unmount, clear all intervals.

---

## What stays the same
- The status detail page (`/sessions/:id/status`) remains — it's still reachable by tapping a processing row
- Speaker identification flow (`/sessions/:id/identify`) is unchanged; when a session hits `identifying` status during polling, the row label updates to "Awaiting speaker ID" and tapping takes the user to the identify page
- Error state: when a session reaches `error`, polling stops and the row shows "Error" in red as before
