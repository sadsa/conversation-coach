# UI Upgrades Design — 2026-03-17

## Overview

Two targeted UI improvements to the conversation coach app:

1. Show the original phrase alongside the correction in the annotation card popup.
2. Remove the misleading single-speaker warning on the transcript page.

---

## Change 1: Show Original Phrase in AnnotationCard

### Problem

When a user taps an annotated span in the transcript, the `AnnotationCard` popup shows the corrected phrase but not the original. The user has to refer back to the highlighted text in the transcript to remember what they actually said.

### Design

Mirror the pattern already used in `PracticeList`:

- **Grammar / Naturalness**: render `<strikethrough>original</strikethrough> → <bold>correction</bold>`
- **Strength**: unchanged — render `Keep this! "original"` in green

### Implementation

Replace the entire `<p>` block (lines 53–59 of `components/AnnotationCard.tsx`) — which currently shows the correction for grammar/naturalness but not the original — with the following:

```tsx
<p>
  {annotation.correction ? (
    <>
      <span className="line-through text-gray-500">{annotation.original}</span>
      {' → '}
      <span className="font-medium">{annotation.correction}</span>
    </>
  ) : (
    <span className="text-green-300">Keep this! &ldquo;{annotation.original}&rdquo;</span>
  )}
</p>
```

Note: the strength branch (`Keep this! "..."`) is intentionally retained from the current `AnnotationCard` implementation and is a deliberate deviation from `PracticeList`, which omits the "Keep this!" prefix.

### Files Changed

- `components/AnnotationCard.tsx` — replace the entire `<p>` block (lines 53–59) with the JSX above.
- `__tests__/components/AnnotationCard.test.tsx` — in the `'renders correction for grammar annotation'` test, add `expect(screen.getByText('Yo fui')).toBeInTheDocument()` after the existing `expect(screen.getByText('Fui')).toBeInTheDocument()` assertion (line 33). The `getByText('Fui')` assertion remains valid — the correction is now in its own `<span>` and `getByText` will still find it.

### No Data Changes

`annotation.original` is already present on every annotation. No API or DB changes required.

---

## Change 2: Remove Single-Speaker Warning

### Problem

When AssemblyAI detects only one speaker, a yellow warning banner is shown on the transcript page:

> "Couldn't distinguish two speakers — try a higher quality recording."

This is misleading. A single-speaker recording is a valid and common case (e.g. the user practising a monologue or a session where only their voice was captured). The warning implies something went wrong when it didn't.

### Design

Delete the warning div entirely (lines 70–74 in `app/sessions/[id]/page.tsx`). The pipeline already handles single-speaker sessions correctly — the session's `user_speaker_labels` is set so that `TranscriptView` renders all segments as the user's own speech, and the transcript displays as normal.

### Files Changed

- `app/sessions/[id]/page.tsx` — remove the `detected_speaker_count === 1` conditional block.

---

## Out of Scope

- Font size / mobile padding changes (removed from scope by user decision).
- Any changes to the `PracticeList` component (already has the correct original → correction pattern).
- Any pipeline, API, or database changes.
