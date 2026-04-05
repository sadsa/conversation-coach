# Transcript Page Layout Fixes

**Date:** 2026-03-21

## Problem

The transcript page (`/sessions/[id]`) has two layout bugs:

1. **Horizontal overflow** — Long session titles and long Spanish words in transcript segments push content past the viewport edge, making the page horizontally scrollable.
2. **Bottom nav not fixed** — `overflow: hidden` on `<body>` is known to break `position: fixed` on iOS Safari regardless of document width. Fixing the content overflow is the correct remedy; patching `BottomNav` is not needed.

Additionally, the filter bar in `TranscriptView` (All / Grammar / Naturalness / Strengths) is non-functional from the user's perspective — it only gates whether clicking an annotation opens a modal, but does not visually filter or highlight anything. It should be removed.

## Changes

### 1. `app/sessions/[id]/page.tsx` — Title flex container

Add `min-w-0` to the left `<div>` that wraps the `InlineEdit` and subtitle line. This allows the flex child to shrink below its natural content width.

Add `break-words` to the `InlineEdit` component so the title wraps onto multiple lines rather than overflowing.

### 2. `components/TranscriptView.tsx` — Segment text

Add `break-words` to the `<span className="text-sm leading-relaxed">` wrapping each segment's text. This prevents long unbreakable Spanish words from pushing the container width past the viewport. `word-break` and `overflow-wrap` are inherited CSS properties, so the class on the parent `<span>` will propagate to all child `<span>` and `<mark>` elements rendered by `AnnotatedText` — no changes needed inside that component.

### 3. `components/TranscriptView.tsx` — Remove filter bar

Remove:
- The `Filter` type
- The `filter` state (`useState<Filter>('all')`)
- The filter bar JSX block (the `<div className="flex gap-2...">` with the four pill buttons)
- The `filter` check inside the `onAnnotationClick` handler (clicking any annotation should always open the modal)
- The `counts` object inside `TranscriptView` — it is only used by the filter bar buttons, so it becomes dead code once the bar is removed

Keep: `annotationsBySegment` (used for highlights).

## Out of Scope

- No changes to `BottomNav` — fixing content overflow is sufficient to restore fixed positioning.
- No changes to other pages — home page and practice page are already working.
- No visual redesign of the transcript page.
