# Flashcard UI Fixes — Design Spec

**Date:** 2026-03-25
**Branch:** fix/practice-items-sub-category-api

## Overview

Four UI improvements to the flashcard feature before merging the PR. All changes are confined to `components/FlashcardDeck.tsx` and `app/flashcards/page.tsx`.

---

## Fix 1 — Inline highlight alignment

**Problem:** The `<p>` element in `renderHighlighted` has `flex items-center justify-content` applied, which makes text nodes and `<span>` elements into flex items. This causes the highlighted span to be treated as a separate block, breaking inline text flow.

**Solution:** Change the text container so the `<p>` uses `text-center` only (no flex). Wrap the text area in a `<div>` with `flex-1 flex items-center justify-center` for vertical centering. The `<p>` inside renders inline content normally, keeping the highlight chip flush with surrounding words.

**Files:** `components/FlashcardDeck.tsx` — front and back face text containers.

---

## Fix 2 — Replace note panel with "Explain this" button

**Problem:** The back face shows a cramped single row containing original (strikethrough), correction, and a "Why?" toggle button — too compact on mobile.

**Solution:** Remove the existing note panel entirely. Replace with:

1. An **"Explain this →" button** below the card text — styled with `bg-indigo-950/50 border border-indigo-900 text-indigo-400 rounded-lg` (subtle, not dominant).
2. Tapping the button reveals an **explanation panel inside the card** containing:
   - **Correction row:** `<span class="bg-[#3b1a1a] text-[#fca5a5]">{original}</span> → <span class="font-semibold text-lg text-[#86efac]">{correction}</span>` — exact AnnotationCard styling, no strikethrough. If `correction` is null, render `<span class="text-gray-500">—</span>` in place of the correction word (same fallback as current code).
   - A subtle `<hr>` divider (`border-indigo-900/40`).
   - `flashcard_note` text in `text-sm text-gray-400 leading-relaxed`.
3. Tapping "Explain this →" again hides the panel (toggle).
4. Panel resets to closed when advancing to the next card.
5. If `flashcard_note` is null, the "Explain this" button is not rendered and the correction row is not shown (there is nothing to explain).

**Files:** `components/FlashcardDeck.tsx` — back face section, `isNoteExpanded` state renamed to `isExplainOpen`.

---

## Fix 3 — Swipe-off animation with framer-motion

**Problem:** Swiping left advances the card instantly with no animation — it doesn't feel like a physical card being dismissed.

**Solution:** Add `framer-motion`. Replace `react-swipeable` entirely.

- Use `const controls = useAnimationControls()` and `const x = useMotionValue(0)`.
- Wrap the card in `<motion.div drag="x" style={{ x }} animate={controls}>`. Do **not** set `dragConstraints` — let the card drag freely so it can be animated past any constraint.
- `onDragEnd(_, info)`:
  - If `info.offset.x < -80`: call `controls.start({ x: -400, opacity: 0, transition: { duration: 0.2 } })`, then in the `.then()` callback: call `advance()`, then immediately call `controls.set({ x: 0, opacity: 1 })` (instant snap, no animation) so the next card starts at centre.
  - Otherwise (sub-threshold): call `controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } })` to spring back to centre.
- Tap-to-flip (`onClick`) still works; guard with `isDragging` ref (`onDragStart` sets it true, `onDragEnd` sets it false via `setTimeout(..., 0)`) to prevent flip firing on drag release — same pattern as current `isSwiping` ref.
- Remove `react-swipeable` from `package.json` and its import.

**Files:** `components/FlashcardDeck.tsx`, `package.json`.

---

## Fix 4 — Remove back button, centre card vertically

**Problem:** The flashcard page shows a `← Back` link (redundant given bottom nav) and the card is not vertically centred on screen.

**Solution:**
- Delete the `← Back` link block from `app/flashcards/page.tsx`.
- Apply `flex flex-col justify-center` only to the wrapper that contains `<FlashcardDeck>` (i.e. the `items.length > 0` branch), not the page root. The loading, error, and empty-state messages remain top-aligned so they don't appear in the middle of the screen.

**Files:** `app/flashcards/page.tsx`.

---

## Out of scope

- No changes to the flashcard data model or API.
- No changes to the front face flip behaviour.
- No changes to the progress counter.
- `react-swipeable` removal is safe — it is only used in `FlashcardDeck.tsx`.

---

## Test impact

- `__tests__/components/FlashcardDeck.test.tsx` uses `data-testid="advance-card"` hidden button to advance cards — this seam remains unchanged.
- Remove the `vi.mock('react-swipeable', () => ({ useSwipeable: () => ({}) }))` block. Add a `vi.mock('framer-motion', ...)` stub that renders `motion.div` as a plain `div` and stubs `useAnimationControls` / `useMotionValue` with no-ops.
- Tests for `isNoteExpanded` / "Why?" toggle need updating: rename to `isExplainOpen`, change button query from `Why?` to `Explain this`, and open the panel before asserting on `original`/`correction` text (those are now only in the DOM after the button is clicked).
- The existing test `shows — when correction is null` should be updated to click "Explain this" first, then assert the `—` is present.
- framer-motion drag interactions are not easily unit-tested; skip drag animation tests, keep existing advance/flip/note tests passing.
- Loading, error, and empty-state rendering tests are unaffected (those elements stay top-aligned in the page).
