# Design: Practice List Indicator on Transcript Page

**Date:** 2026-03-24

## Problem

On the session transcript page, annotations are highlighted inline (red for grammar, yellow for naturalness). When a user taps an annotation and adds it to their practice list, the highlight gives no feedback — it looks identical to annotations not yet added. This makes it hard to scan the transcript and know which errors have already been captured.

## Solution

Annotations that have been added to the practice list are visually distinguished with a green checkmark badge and reduced opacity. Unadded annotations remain vivid.

### Visual treatment (Option A)

- Each annotated `<mark>` is wrapped in a `<span style="position: relative; display: inline-block">` to anchor the badge. This is a new wrapper element, not a style change on `<mark>` itself. `inline-block` may introduce minor visual gaps at line-wrap points, which is acceptable given the short length of annotated phrases.
- The `<mark>` inside fades to **45% opacity** (`opacity: 0.45`) when the annotation has been added
- A small **green ✓ badge** (14×14 px circle, `bg-green-500`, white tick) is absolutely positioned `top: -5px; right: -5px` inside the wrapper, with `pointer-events: none` so taps pass through to the `<mark>` click handler beneath
- The `onClick` handler remains on the `<mark>` element, not the wrapper
- The wrapper `<span>` is **only rendered when the annotation is in `addedAnnotationIds`** — unadded marks render as a bare `<mark>` as today, with no structural change

### Clickability

Added annotations remain fully clickable. Tapping one still opens the modal, which already shows the "✓ Added to practice list" disabled button state (implemented in `AnnotationCard`). The badge has `pointer-events: none` so it does not intercept taps meant for the `<mark>`.

### Reactivity

`addedAnnotationIds` is React state in `TranscriptPage` and flows down as a prop. When `onAnnotationAdded` is called, the state update triggers a re-render of `TranscriptView` and `AnnotatedText` — the badge appears immediately on add, with no additional logic required.

## Data Flow

`addedAnnotationIds: Set<string>` is already:
- Fetched from the API on page load (`GET /api/sessions/:id` returns `addedAnnotationIds`)
- Stored in `TranscriptPage` state
- Passed down to `TranscriptView` as a prop
- Updated optimistically via `onAnnotationAdded` when the user adds an item

The only change needed is to thread `addedAnnotationIds` one level further into `AnnotatedText`.

## Affected Files

| File | Change |
|------|--------|
| `components/AnnotatedText.tsx` | Accept `addedAnnotationIds?: Set<string>` prop (optional, defaults to `new Set()`); apply wrapper span + badge + fade to added marks |
| `components/TranscriptView.tsx` | Pass `addedAnnotationIds` through to `AnnotatedText` |

No API changes, no DB changes, no new state.

## Out of Scope

- Session delete / bulk actions on home page (deferred, not in this spec)
