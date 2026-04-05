# Write It Down — Design Spec

**Date:** 2026-04-04
**Status:** Approved

## Overview

Add a "write it down" ritual gate between an annotation and its flashcard creation. When the user taps "Add to Practice" on an `AnnotationCard`, a bottom sheet slides up prompting them to physically write the correction on paper before the flashcard is created. The practice item is only saved once the user confirms they've written it down.

---

## User Flow

### Before (current)
Tap "Add to Practice" → practice item saved immediately → button turns grey "Added to practice"

### After
Tap "Add to Practice" → `WriteItDownSheet` slides up → user writes on paper → ticks checkbox → taps "Create flashcard" → brief success state → sheet auto-closes → button turns grey "Added to practice"

---

## Component: `WriteItDownSheet`

A new bottom sheet component modelled after the existing `ExplainSheet` pattern.

**Props:**
```ts
interface Props {
  isOpen: boolean
  annotation: Annotation
  onConfirm: () => Promise<void>   // caller handles the API call
  onClose: () => void
}
```

**Sheet contents (top to bottom):**

1. **Handle bar** — drag indicator (decorative, matching `ExplainSheet`)
2. **Header row** — pencil icon + title "Write it down first" + subtitle "Reinforce before it becomes a flashcard"
3. **Correction block** — `original → correction` in the same red/green colour treatment as `AnnotationCard`, plus the annotation's explanation text below
4. **Writing prompts section** — label "Write it 3 ways on paper" + 3 fixed prompts (always the same regardless of annotation type):
   - "A sentence you'd actually say to someone"
   - "As a question using voseo"
   - "Using a past or future tense"
5. **Checkbox row** — "I've written it down on paper" — tapping toggles checked state
6. **Confirm button** — "Create flashcard", disabled until checkbox is ticked

**States:**

| State | Checkbox | Button |
|-------|----------|--------|
| Initial | unchecked | disabled (muted bg, grey text) |
| Ready | checked | enabled (indigo bg, white text) |
| Success | checked | "Flashcard created ✓" (green bg/text), sheet auto-closes after 1.5s |

**Success flow:** On confirm, `onConfirm()` is awaited (saves practice item via existing API). Button transitions to success state. After 1500ms, `onClose()` is called, which causes `AnnotationCard` to show the existing "Added to practice" grey button state.

---

## Changes to `AnnotationCard`

- Remove the direct `fetch('/api/practice-items', ...)` call from `handleAdd`
- Instead, tapping "Add to Practice" sets local state `isSheetOpen = true`
- `WriteItDownSheet` is rendered inside `AnnotationCard` (following the same pattern as `ExplainSheet` inside `FlashcardDeck`) with `isOpen={isSheetOpen}`
- `onConfirm` prop contains the existing practice item save logic (moved from `handleAdd`)
- `onClose` sets `isSheetOpen = false`
- On successful confirm, `onAnnotationAdded` is called (same as today)

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `components/WriteItDownSheet.tsx` | New component |
| `components/AnnotationCard.tsx` | Add sheet trigger state; move save logic into `onConfirm` |

No API changes required — the existing `POST /api/practice-items` endpoint is used unchanged.

---

## Out of Scope

- Storing what the user wrote — this is a paper-only ritual; no text input, no persistence of examples
- Tailoring writing prompts per sub-category — prompts are always the same 3
- Any changes to the flashcard deck or practice list views
