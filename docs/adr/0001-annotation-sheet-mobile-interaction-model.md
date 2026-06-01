# ADR 0001 — Mobile annotation sheet closes on save; header bar removed

**Status:** Accepted  
**Date:** 2026-05-31

## Context

The `AnnotationSheet` bottom sheet on mobile had a UX collision: after saving a correction to the Study list, a floating `StudyPrompt` pill (linking to `/write`) overlapped the "Save to my Study list" button. Five interaction models were explored:

- **A** — Checkbox toggle above the CTA (saved/unsaved state explicit)
- **B** — Bookmark icon in secondary row
- **C** — Text link "Remove from Study" alongside "Not useful"
- **D** — Save closes the sheet; pill appears in the transcript below
- **E** — Actions move to top-right icons; bottom button becomes a permanent Study nav CTA

On mobile the sheet stays open throughout the entire review session — the user navigates between annotations via the header arrows, never returning to the transcript. This means any solution that hides or repositions the pill while the sheet is open doesn't work: the sheet is open the whole time.

## Decision

**Option D** for the save interaction, combined with a mobile header simplification:

### Save closes the sheet
Tapping "Save to my Study list" dismisses the sheet entirely rather than auto-advancing to the next annotation. The `StudyPrompt` pill then surfaces in the transcript view — no overlap is possible because the sheet and pill never share the screen simultaneously.

The button label, copy, and visual treatment are unchanged. The difference is purely in what happens after a successful save.

### Mobile header bar removed
The header row (position counter "2 of 2", prev/next `‹ ›` arrows) is removed on mobile. A single close `×` button moves into the eyebrow row alongside a `···` overflow menu:

```
YOU SAID                    [···] [×]
~~original~~
correction
explanation...

[ Save to my Study list ]
```

The `···` menu contains a single item: "Not useful — hide it" (the existing unhelpful-flag action, demoted from a permanent ghost button).

### Desktop unchanged
The right-side panel retains the full header bar (position counter, prev/next, close). Prev/next navigation is genuinely useful on desktop because the transcript remains visible on the left while the panel is open — the user can cross-reference without losing context. On mobile the sheet covers the transcript entirely, so returning to it between saves is the better model.

### Drag animation
The sheet now tracks the user's finger in real time during a downward swipe. The element is translated imperatively (no React re-renders) via `applyDragTransform` in `DockedSheet`. On release above the threshold the sheet animates to offscreen, then calls `onClose()` after the CSS transition completes. Applies to both `AnnotationSheet` and `WriteSheet`.

## Consequences

- **Navigation becomes deliberate on mobile.** The user picks the next annotation by tapping a highlight in the transcript rather than stepping through a sequence they can't see. This is slower for power users who want to blitz all corrections but more spatially honest — the user always knows where the other annotations are.
- **StudyPrompt pill collision is eliminated** without changes to `StudyPrompt` or its positioning logic.
- **"Not useful" discoverability decreases.** It's now one tap deeper (behind `···`). Acceptable given the action is used by a small fraction of users.
- **Desktop review flow is unchanged.** Users who primarily review on desktop are unaffected.
- **`DockedSheet` gains a mobile/desktop split in header rendering.** The `isMobileViewport` state (already present for `aria-modal` and focus-trap semantics) drives this.

## Alternatives Considered

**Option E (top-right icons, permanent Study CTA at bottom):** Cleaner in principle, but the bottom button sitting dimmed when nothing is saved reads as broken rather than empty. The save toggle icon beside "YOU SAID" is also harder to discover than the current full-width primary button.

**Hiding the pill while the sheet is open:** Rejected. The sheet remains open for the entire review session on mobile; the user would never see the pill.

**Keeping auto-advance:** Rejected. Auto-advance to the next correction after save means the "Study N saved →" CTA can only appear after all corrections are reviewed and the sheet is eventually closed — which never happens organically if the user is still reviewing.
