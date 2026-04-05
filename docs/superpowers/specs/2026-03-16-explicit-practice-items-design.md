# Explicit Practice Item Adding

**Date:** 2026-03-16
**Status:** Approved

## Overview

Currently, practice items are automatically created for every annotation Claude returns during analysis. This change removes that auto-creation so users can explicitly choose which annotations to add to their practice list.

The transcript screen already has an "Add to practice list" button on each `AnnotationCard`. The only missing pieces are: (1) removing the auto-creation pipeline step, (2) preventing duplicate additions by tracking which annotations have already been added — including across card remounts within the same page session.

## Changes

### 1. Remove auto-creation — `lib/pipeline.ts`

Delete the loop that inserts a `practice_items` row for every annotation after Claude analysis completes. Analysis will only write to the `annotations` table going forward.

Also fix pre-existing bug: the `select()` call and subsequent filter use the stale `user_speaker_label` (singular). Update to `user_speaker_labels` and filter using `user_speaker_labels?.[0]` (the first element).

### 2. Remove auto-deletion from re-analysis — `app/api/sessions/[id]/analyse/route.ts`

Currently the route deletes `practice_items WHERE annotation_id IS NOT NULL` before re-running Claude, with a comment explaining the deletion order. With manual-only creation, practice items should survive re-analysis. The existing `ON DELETE SET NULL` FK constraint handles the annotation link gracefully — after re-analysis, manually-added practice items persist with `annotation_id = NULL`.

Remove the `DELETE FROM practice_items WHERE annotation_id IS NOT NULL` step, its associated comment, and any surrounding comment block that explains the deletion order.

### 3. Extend session API response — `app/api/sessions/[id]/route.ts` + `lib/types.ts`

The transcript page (`app/sessions/[id]/page.tsx`) is a client component that fetches data via `GET /api/sessions/:id`. Extend that route's response to include `addedAnnotationIds: string[]` — the list of annotation IDs that already have a linked practice item for this session.

Query: `SELECT annotation_id FROM practice_items WHERE session_id = :id AND annotation_id IS NOT NULL` (uses `.select('annotation_id').eq('session_id', id)` — no `.order()` call).

Update the `SessionDetail` type in `lib/types.ts` to include `addedAnnotationIds: string[]`.

### 4. Update transcript page — `app/sessions/[id]/page.tsx`

- Delete the `handleAddToPractice` async function and remove its `onAddToPractice={handleAddToPractice}` prop from `<TranscriptView>`.
- Fix pre-existing bug: `session.user_speaker_label` (singular) no longer exists in the schema — it was replaced by `user_speaker_labels` (array) in migration 002. Update the prop to read `session.user_speaker_labels?.[0] ?? null`.
- Read `addedAnnotationIds` from the session API response in the existing `useEffect`. Store it in `useState<Set<string>>`, initialised from the API response.
- Define `handleAnnotationAdded(annotationId: string)` — appends the ID to the `Set` state using a functional update (`prev => new Set([...prev, annotationId])`).
- Pass `addedAnnotationIds` (the Set), `onAnnotationAdded={handleAnnotationAdded}`, and `sessionId={session.id}` to `<TranscriptView>`.

Holding `addedAnnotationIds` in `useState` ensures the set stays accurate when `AnnotationCard` is unmounted and remounted (e.g. the user closes and reopens a card).

### 5. Update `TranscriptView` — `components/TranscriptView.tsx`

- Remove `onAddToPractice` prop.
- Accept `addedAnnotationIds: Set<string>`, `onAnnotationAdded: (annotationId: string) => void`, and `sessionId: string` props.
- Pass `isAdded={addedAnnotationIds.has(annotation.id)}`, `onAnnotationAdded`, and `sessionId` to each `AnnotationCard`.

### 6. Update `AnnotationCard` — `components/AnnotationCard.tsx`

Props interface changes:
- Remove `onAddToPractice` callback prop.
- Retain existing `onClose: () => void` prop.
- Add `isAdded: boolean`, `onAnnotationAdded: (annotationId: string) => void`, and `sessionId: string` props.

Behaviour:
- Maintain local `added` state, initialised from the `isAdded` prop via `useState(isAdded)`. This value is read only at mount — `AnnotationCard` is fully unmounted when closed and remounted when reopened, so the parent Set is the source of truth on each open. Do not add a `useEffect` to synchronise `isAdded` changes.
- Own the `fetch('/api/practice-items', ...)` call internally. Send the full practice item body: `{ session_id: sessionId, annotation_id: annotation.id, type: annotation.type, original: annotation.original, correction: annotation.correction, explanation: annotation.explanation }`.
- On button click: call the API. On success (check `response.ok` — no need to parse the response body), set local `added = true` and call `onAnnotationAdded(annotation.id)`. On failure, leave the button enabled so the user can retry; log the error to the console.
- Render "✓ Added to practice list" (disabled, muted grey) when `added` is true.

## Data Model

No schema changes required. The existing `practice_items.annotation_id` FK (nullable, `ON DELETE SET NULL`) is sufficient.

The `POST /api/practice-items` route has no uniqueness guard on `annotation_id`. For a single-user app this is acceptable — UI-level prevention via `useState` covers the normal case. A two-tab race is theoretically possible but considered out of scope.

## Tests

The following test files must be updated:

- **`__tests__/lib/pipeline.test.ts`** — remove the assertion that `practice_items` is inserted with `annotation_id`; remove the dead `practice_items` mock.
- **`__tests__/components/AnnotationCard.test.tsx`** — rewrite tests around the new props (`isAdded`, `onAnnotationAdded`, `sessionId`, `onClose`). Cases: renders disabled "Added" state when `isAdded=true`; calls `onAnnotationAdded` after a successful fetch; does not call the API when `isAdded=true`; leaves button enabled on fetch failure; `onClose` still functions.
- **`__tests__/components/TranscriptView.test.tsx`** — replace `onAddToPractice` prop with `addedAnnotationIds`, `onAnnotationAdded`, and `sessionId` in all test cases.
- **`__tests__/api/sessions.test.ts`** — add a `practice_items` mock branch using `.select().eq()` (no `.order()`); assert `addedAnnotationIds` is present in the response body. Also fix pre-existing inconsistency: the mock session object uses `user_speaker_label: 'A'` (singular) — update to `user_speaker_labels: ['A']` to match the current schema.

## Behaviour After Re-analysis

When a session is re-analysed, annotations are deleted and recreated with new IDs. The `ON DELETE SET NULL` constraint sets `annotation_id = NULL` on any linked practice items — they persist in the practice list but lose their annotation link. On page reload after re-analysis, `addedAnnotationIds` is fetched fresh and will contain no IDs (no new annotations have been added yet), so all buttons show "not added". This reset is a consequence of the new annotations having new IDs, not a separate mechanism — do not attempt to preserve annotation IDs across re-analysis.

## Out of Scope

- No UI changes to the Practice Items page
- No ability to remove a practice item from the transcript screen (managed on Practice Items page only)
- No `UNIQUE` constraint on `practice_items.annotation_id` (two-tab race accepted for single-user app)
