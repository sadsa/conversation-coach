# Practice Page UX Enhancements — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Overview

Four targeted UX improvements to the Practice Items page (`/practice`) targeting a smoother, more native-feeling mobile experience.

---

## 1. Swipe-to-Delete Animation

### Current Behaviour
When a swipe passes the delete threshold, the item immediately disappears but a red delete bar briefly flashes, creating a clunky transition.

### New Behaviour
Two-phase optimistic animation:
1. **Slide out** — item translates fully off-screen to the left over 200ms (ease)
2. **Collapse** — row collapses to height 0 over 200ms (ease), closing the gap

The DELETE API call fires in parallel when the threshold is crossed — no waiting for response.

### Height Collapse Implementation
Do **not** use `max-height` transitions (produces non-linear easing). Instead:
1. Measure the element's `offsetHeight` via a React ref before starting the animation
2. Set it as an inline `height` style on the wrapper
3. On the next frame, transition `height` to `0` and `overflow: hidden`

### Error Recovery
If the DELETE API call fails, the item reappears in its original position (slide back in). Show a brief toast notification: "Couldn't delete item — try again."

**Toast implementation:** The project has no existing toast component. Implement a minimal inline toast: a fixed bottom-centre `div` (above the bottom tab bar, `z-50`) that auto-dismisses after 3 seconds. Alternatively, use `react-hot-toast` if the team prefers a library. Either approach is acceptable — choose one and be consistent for bulk delete errors too.

### Red Delete Background
During the collapse phase, the red delete background `div` is a sibling inside the same row wrapper. It collapses with the wrapper naturally — no special handling needed.

### Event Priority
Swipe delete is triggered only in `onSwipedLeft`. The `onClick` handler (for opening the modal, see Feature 4) fires only when `translateX === 0` — i.e., the item is in its resting position. An `onClick` on a partially-swiped item is ignored.

---

## 2. Bulk Action Toolbar — Gmail-style

### Architecture
The bulk selection bar is **not** a mutation of the `app/layout.tsx` header (which is shared across all pages). Instead, it lives inside `PracticeList` (or the `/practice` page component) as a `position: sticky; top: 0` element that appears above the filter row when bulk mode is active.

### Behaviour
When long-press activates bulk mode:
- The filter row (all / grammar / naturalness / strength) is hidden
- A sticky selection bar slides in at the top of the list area
- Selection bar layout: `←` (exit) | `N selected` | `☑` (select-all) | `🗑` (delete)
- The bar stays visible as the user scrolls down the list
- Tapping `←` cancels selection and restores the filter row

### Select-All Scope
Select-all selects only the currently **filtered** items (same as current behaviour). If the filter is "all", all items are selected.

### Icon Specifications
All icons are SVGs — no emoji. No text labels.
- Back/exit: left-chevron (`<`)
- Select all: checkbox-checked outline
- Delete: trash outline
- Delete icon colour: red (`text-red-400`) to signal destructive action

### z-index
The sticky selection bar: `z-30`. It must sit above list items but below the modal.

---

## 3. Navigation — Icon-only Bottom Tab Bar

### New Component: `BottomNav`
A new `components/BottomNav.tsx` client component added to `app/layout.tsx`. All three tab destinations already exist as routes: `/` (home/upload), `/practice`, `/settings`.

### Layout
Fixed bottom tab bar replacing the existing header nav links:
- `position: fixed; bottom: 0; left: 0; right: 0`
- Height: `h-16` (64px) + `padding-bottom: env(safe-area-inset-bottom)` for iOS safe area
- `z-index: z-40` — above page content, below modals (`z-50`)
- Three tabs: Home (`/`), Practice (`/practice`), Settings (`/settings`)
- Icon-only — no text labels
- Active tab: accent colour (indigo-500); inactive: gray-500

### Active Tab Rules
- `/` — exact match only
- `/practice` — prefix match (active on `/practice` and any sub-path)
- `/settings` — prefix match

### Content Padding
All pages get `pb-20` (80px) bottom padding applied in `app/layout.tsx` `<main>` to prevent content being obscured by the tab bar.

### Icons (SVG outlines)
- Home: house
- Practice: list/notes
- Settings: gear/cog

### Header
The app title "Conversation Coach" remains in the existing top header. The header nav links (`Practice Items`, `Settings`) are removed.

---

## 4. Practice Item Modal

### Behaviour
Tapping any practice item (when not in bulk mode and when `translateX === 0`) opens the existing `Modal` component.

### Event Disambiguation
- `onClick` fires → open modal, **unless** bulk mode is active (in which case, toggle selection)
- Long-press → enter bulk mode (existing behaviour, unchanged)
- Swipe → swipe-to-delete (existing behaviour, unchanged)
- These three are mutually exclusive by construction: long-press sets a flag before `onClick` fires, and swipe resets translate to 0 only after the animation completes

### Modal Content
Renders inline from the `PracticeItem` object — do **not** reuse `AnnotationCard` (type mismatch). Fields:
- Modal title: type emoji + label (🔴 Grammar / 🟡 Naturalness / 🟢 Strength). Emoji is permitted here as a semantic/decorative label — this is not a navigation icon. The SVG-only rule in Feature 2 applies to interactive control icons only.
- **Original text** — displayed with strikethrough if a correction exists
- **Correction** — displayed in green if present; omitted for strengths
- **Explanation** — full text

No action buttons. The `✕` close button and backdrop tap both dismiss.

### z-index
The modal uses `z-50` (existing). This sits above the bottom tab bar (`z-40`) and bulk selection bar (`z-30`).

---

## Out of Scope

- Voice playback or audio for practice items
- "Mark as reviewed" functionality
- Reordering items
- Any changes to the transcript page

---

## Affected Files (expected)

- `components/PracticeList.tsx` — swipe animation, bulk toolbar transform, item tap handler, modal state
- `app/layout.tsx` — remove header nav links, add `<BottomNav />`, add `pb-20` to `<main>`
- `components/BottomNav.tsx` — new component
- `components/AnnotationCard.tsx` — no changes
- `components/Modal.tsx` — no changes
