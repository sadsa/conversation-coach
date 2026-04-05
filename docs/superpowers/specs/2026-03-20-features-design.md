# Feature Design: Auto-title, Annotation Modal, Simplified Practice Items

Date: 2026-03-20

## Overview

Four features to improve the mobile experience and reduce visual clutter:

1. **Auto-title** — generate a descriptive session title automatically after analysis
2. **Annotation modal** — replace the inline AnnotationCard with a centred modal overlay
3. **Simplified practice items** — show only correction data, remove explanation/metadata
4. **Bulk deletion** — swipe-to-delete and long-press bulk select on mobile; checkbox toolbar on desktop

---

## Feature 1: Auto-title

### What it does

After analysis completes, Claude automatically generates a short descriptive title (≤5 words) for the session based on the conversation content and original filename. Examples: "Football con Kevin", "WhatsApp: Planificando el fin de semana".

### Implementation

**DB migration:**

```sql
ALTER TABLE sessions ADD COLUMN original_filename TEXT;
```

**`app/page.tsx`:**
- Remove `const [title, setTitle] = useState('')`, the "Session title (optional)" `<input>`, and the `sessionTitle = title.trim() || file.name.replace(...)` fallback. Auto-title makes the field redundant.
- Update `useCallback`'s dependency array from `[title, router]` to `[router]`.
- Read `file.name` and include it as `original_filename` in the `POST /api/sessions` body.
- Always send `"Untitled"` as the `title` placeholder:

  ```ts
  body: JSON.stringify({ title: 'Untitled', extension: ext, original_filename: file.name })
  ```

**`app/api/sessions/route.ts`:**
- Update the request body type cast from `{ title?: string; extension?: string }` to `{ title?: string; extension?: string; original_filename?: string }`.
- Destructure `original_filename` from the request body alongside `title` and `extension`.
- Include `original_filename` in the Supabase `insert` call.
- The existing non-empty `title` validation is preserved (`"Untitled"` passes it).

**`lib/types.ts`:**
- Add `original_filename: string | null` to the `Session` interface.

**`lib/claude.ts` — `analyseUserTurns`:**
- Updated signature: `analyseUserTurns(turns: UserTurn[], originalFilename: string | null)`
- Replace the system prompt instruction `"Respond ONLY with a JSON array. No other text."` with:
  `"Respond ONLY with a JSON object with this exact shape: { \"title\": string, \"annotations\": [...] }. No other text."`
- Prepend the filename to the user message content:

  ```ts
  `Original filename: ${originalFilename ?? 'unknown'}\n\n${...existing transcript content...}`
  ```

- Change the response parse logic from:

  ```ts
  return JSON.parse(text) as ClaudeAnnotation[]
  ```

  to:

  ```ts
  const parsed = JSON.parse(text) as { title: string; annotations: ClaudeAnnotation[] }
  return { title: parsed.title?.trim() || 'Untitled', annotations: parsed.annotations }
  ```

  The function now returns `Promise<{ title: string; annotations: ClaudeAnnotation[] }>`.

- Prompt instructions for the title field:
  - Summarise the conversation topic in ≤5 words (natural Spanish/English mix).
  - Infer the source app from filename patterns (e.g. `PTT-*.ogg`, `WhatsApp Audio *.ogg` → prepend "WhatsApp: "). Fall back to topic-only if no pattern matches.

**`lib/pipeline.ts` — `runClaudeAnalysis`:**
- Update the session `select` to include `original_filename`:

  ```ts
  .select('user_speaker_labels, audio_r2_key, original_filename')
  ```

- Hoist `annotations` and `title` declarations above the try/catch, then destructure inside:

  ```ts
  let annotations: ClaudeAnnotation[] = []  // initialised so TypeScript doesn't flag use-before-assign below
  let title = 'Untitled'  // initialised here; catch always throws so TypeScript can't prove assignment
  try {
    const result = await analyseUserTurns(userTurns, session.original_filename ?? null)
    annotations = result.annotations
    title = result.title
  } catch (err) {
    // existing error handling unchanged (sets status: error, throws — title is never used after this)
  }
  ```

- Use `annotations` exactly as the current bare array (offset correction, DB insert on lines 42–72 unchanged).
- Update the final status update on line 80 to also save the title:

  ```ts
  await db.from('sessions').update({ status: 'ready', title }).eq('id', sessionId)
  ```

- If `analyseUserTurns` throws, the existing `catch` block (lines 31–37) sets `status: 'error'` as before — no title is saved.

**Re-analysis (`POST /api/sessions/[id]/analyse/route.ts`):**
- This route calls `runClaudeAnalysis(params.id)` unchanged. No modifications needed here. Re-analysis regenerates the title — any user-edited title is overwritten, which is consistent with the full-replace intent. The user can rename via `InlineEdit` after re-analysis.

### Files touched

`lib/types.ts`, `lib/claude.ts`, `lib/pipeline.ts`, `app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts`, `app/page.tsx`, new migration `supabase/migrations/..._add_original_filename.sql`

---

## Feature 2: Annotation Modal

### What it does

Tapping an annotated word in the transcript opens a centred modal overlay instead of the current inline `AnnotationCard` below the segment. The modal is dismissible by tapping the backdrop or the X button.

### Implementation

**`components/Modal.tsx` (new):**

```tsx
interface Props {
  title: React.ReactNode  // rendered in modal header left side
  onClose: () => void
  children: React.ReactNode
}
```

- Fixed full-screen backdrop: `fixed inset-0 bg-black/65 flex items-center justify-center p-5 z-50`
- Centred card: `bg-gray-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl`
- Card structure:
  - **Header row**: `title` prop on the left, X close button on the right (`w-7 h-7`, rounded, `bg-gray-700`)
  - **Body**: `{children}`
- Backdrop click calls `onClose`; click on card stops propagation.
- Focus management: on mount focus the X button and save `document.activeElement`; on unmount restore it. Use `useEffect` with empty deps and `useRef` — no library needed.

**`components/TranscriptView.tsx`:**
- Delete the existing inline `AnnotationCard` conditional inside the segment `map()` loop (the block that reads `activeAnnotation?.segment_id === seg.id && <AnnotationCard ... onClose={...} />`). Remove the entire conditional including the `onClose` prop.
- Add a single `Modal` at the bottom of `TranscriptView`'s JSX (outside the segment list):

  ```tsx
  {activeAnnotation && (
    <Modal
      title={<span className="text-sm font-semibold">{TYPE_LABEL[activeAnnotation.type]}</span>}
      onClose={() => setActiveAnnotation(null)}
    >
      <AnnotationCard
        annotation={activeAnnotation}
        sessionId={sessionId}
        isAdded={addedAnnotationIds.has(activeAnnotation.id)}
        onAnnotationAdded={onAnnotationAdded}
      />
    </Modal>
  )}
  ```

  (`addedAnnotationIds` and `onAnnotationAdded` are existing props on `TranscriptView` — no new state needed. `TYPE_LABEL` is defined in `AnnotationCard.tsx`; export it so `TranscriptView` can import it.)

**`components/AnnotationCard.tsx`:**
- Remove the `onClose` prop and its ✕ button — owned by `Modal`.
- Remove the outer `<div>` wrapper with `border border-gray-700 rounded-lg bg-gray-900` — `Modal` provides the card shell.
- Remove the header row (type label + ✕ button) — `Modal` renders the type label via its `title` prop.
- Updated props:

  ```ts
  interface Props {
    annotation: Annotation
    sessionId: string
    isAdded: boolean
    onAnnotationAdded: (annotationId: string) => void
    // onClose removed
  }
  ```

- The component renders only its body content:
  - Original → correction row (existing markup, keep Tailwind classes)
  - Explanation paragraph
  - "Add to practice list" button — restyled to full-width `bg-indigo-600 text-base` for better mobile tap target
- The modal stays open after "Add to practice list" is tapped (button transitions to "✓ Added", matching existing behaviour).
- All font sizes use Tailwind utility classes. No hardcoded `px` values.

### No new API routes or DB changes needed.

---

## Features 3 & 4: Simplified Practice Items + Bulk Deletion

### Simplified item layout

Each practice item is a horizontal row:

```
[checkbox] [type dot] [original (strikethrough)] → [correction]
```

- Strengths: no strikethrough, no correction, no arrow.
- Removed from view: explanation, session name, created date, reviewed checkbox, per-item ✕ delete button.
- The `reviewed` field is preserved in the DB but not surfaced in the UI.

**`components/PracticeList.tsx` — interface changes:**
- Replace `ItemWithSession` with base `PracticeItem` (the local `ItemWithSession` type definition is deleted).
- Remove `onToggleReviewed` and `onDelete` props — deletion is handled internally.
- Updated props:

  ```ts
  interface Props {
    items: PracticeItem[]
  }
  ```

- `PracticeList` calls `DELETE /api/practice-items/:id` directly for single and bulk delete.

**`app/practice/page.tsx`:**
- Remove the `onToggleReviewed` and `onDelete` handlers.
- Update the `GET /api/practice-items` fetch to no longer pass `reviewed` query param.
- Pass `items={items}` to `PracticeList` (no handler props).
- Update the type of `items` state from `ItemWithSession[]` to `PracticeItem[]`.

**`app/api/practice-items/route.ts` (GET):**
- Remove the sessions join from the query.
- Remove the `reviewed` query param filter.

**Filter bar:** Remove the reviewed status filter row. Retain the type filter row (All / Grammar / Naturalness / Strength).

### Mobile interactions

**Swipe-to-delete (single item):**
- Use `react-swipeable` v7 (`npm install react-swipeable@^7`).
- Configure `useSwipeable` with `delta: 10` so all leftward swipes reach `onSwipedLeft`; the 80px threshold is enforced inside the handler.
- Swipe left reveals a red delete background with a "Delete" label.
- Use `onSwiping` to translate the card left by `absX` pixels (reveal effect); only when `dir === 'Left'`.
- Use `onSwipedLeft` to handle release:
  ```ts
  onSwipedLeft: (e) => {
    if (e.absX > 80) { deleteItem(item.id) }
    else { setTranslateX(0) } // snap back
  }
  ```

**Long-press bulk select:**
- 300ms `touchstart` timer enters bulk select mode.
- Apply `user-select: none` and `touch-action: pan-y` to item wrappers — suppresses native long-press text selection, preserves scroll.
- `onSwiping` callback cancels the long-press timer (prevents both from firing simultaneously).
- In bulk select mode:
  - Checkboxes appear on the left of all items.
  - A banner at top shows selected count + "Delete selected" button (red) + "Cancel" button.
  - "Cancel" exits bulk mode and deselects all.
  - Tapping an item toggles its selection.

### Desktop interactions

- Checkboxes are always visible on the left of each item (bulk-select only; no reviewed-toggle).
- On mobile, the checkbox column is absent outside of bulk select mode.
- Implement with a `isBulkMode` state variable + responsive visibility: desktop always shows checkboxes (`hidden sm:block`), mobile shows them only when `isBulkMode` is true.
- Checking any item reveals a toolbar above the list: selected count, "Select all" button, "Delete" button (red).
- Unchecking all items hides the toolbar.

### Deletion behaviour

- Single delete (swipe): calls `DELETE /api/practice-items/:id`, then removes item from local state.
- Bulk delete: fires all delete requests in parallel via `Promise.allSettled`. After the promise settles (ignoring individual errors), remove all selected items from local state. No confirmation dialog.

### Dependencies

- `npm install react-swipeable@^7`

---

## Summary of changes

| Area | Files touched | New files |
|------|--------------|-----------|
| Auto-title | `lib/types.ts`, `lib/claude.ts`, `lib/pipeline.ts`, `app/api/sessions/route.ts`, `app/page.tsx` | `supabase/migrations/..._add_original_filename.sql` |
| Annotation modal | `components/TranscriptView.tsx`, `components/AnnotationCard.tsx` | `components/Modal.tsx` |
| Practice items | `components/PracticeList.tsx`, `app/practice/page.tsx`, `app/api/practice-items/route.ts`, `package.json` | — |
