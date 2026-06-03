# Row actions use a vertical three-dot context menu, not swipe gestures

List rows on the Study and Review pages expose their actions via a vertical three-dot (⋮) context menu rather than swipe gestures.

## Context

Row swipe gestures (swipe-left to delete, swipe-right to mark Studied or toggle read state) were the only affordance for several row-level actions. Three problems motivated a change:

1. **Discoverability** — swipes are invisible; new users had no signal these actions existed without a hint chip.
2. **Desktop parity** — swipe gestures don't exist on desktop, so the interaction model was inherently split across platforms.
3. **Accidental triggers** — swipe-to-delete fired during normal scroll on touch devices with no reliable recovery path short of the undo toast.

## Decision

All row-level actions are exposed via a ⋮ icon at the trailing end of each row:

- **Study rows:** Mark Studied, Delete
- **Review rows:** Mark read/unread, Delete

The icon is always-visible on mobile and hover-reveal on desktop.

Swipe gestures on list rows are removed. The `WriteSwipeHint` component and the trailing-tap "mark Studied" shortcut are removed with them.

DockedSheet swipes (swipe-down to close, swipe-left/right to navigate Annotations) are **not** changed — they are a different interaction surface with their own teaching moment (NavHint).

## Consequences

- The most common Study action (marking an item Studied) now takes two taps instead of one. This is acceptable because the intended completion path is Drill → comfort check → auto-Studied; manual Mark Studied is a fallback for users who rehearsed offline.
- Desktop and mobile now share a single interaction model for row actions.
- The `WriteSwipeHint` component and its localStorage key (`cc:write-swipe-hint:v1`) can be removed.
- The WriteSheet primary CTA is labelled "Drill" (not "Practise") to reinforce the intended completion path.
