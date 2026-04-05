# Flashcard "Explain this" Bottom Sheet

**Date:** 2026-03-25
**Status:** Approved

## Summary

Move the "Explain this" button out of the flashcard card and into a bottom sheet modal. The card itself remains unchanged in size.

## Changes

### "Explain this" button

- Removed from inside the `motion.div` card entirely.
- Rendered below the card in `FlashcardDeck`, outside the swipeable card element.
- Only visible when the card is showing the **back side** (`isFlipped === true`) and `item.flashcard_note !== null`.
- Same indigo styling as current (`text-indigo-400`, `bg-indigo-950/50`, `border-indigo-900`).
- Clicking calls `setIsExplainOpen(true)`.

### Bottom sheet (`ExplainSheet` component)

New component extracted to `components/ExplainSheet.tsx`.

**Props interface:**
```ts
interface ExplainSheetProps {
  isOpen: boolean
  onClose: () => void
  original: string
  correction: string | null
  note: string
}
```

**Trigger:** `isOpen` prop driven by `isExplainOpen` state in `FlashcardDeck`.
**Dismiss:** tap the backdrop (`onClose`), or drag the sheet downward past 80px (`onDragEnd`).

**Layout (top to bottom inside the sheet):**
1. Drag handle — 36px wide, 4px tall, indigo, centred.
2. Original → correction block — red-tinted background, `original` in red pill, arrow, `correction` in green (or `—` if null).
3. Horizontal divider.
4. `note` — small grey text, relaxed line height.

**Animation:**
- Wrap in `AnimatePresence` so enter and exit animations both run.
- Sheet `motion.div`: `initial={{ y: "100%" }}`, `animate={{ y: 0 }}`, `exit={{ y: "100%" }}`, `transition={{ type: "spring", stiffness: 300, damping: 30 }}`.
- `drag="y"`, `dragConstraints={{ top: 0 }}`, `dragElastic={{ top: 0, bottom: 0.4 }}` — the sheet tracks the finger during downward drag and snaps back if released below threshold.
- `onDragEnd`: if `info.offset.y > 80`, call `onClose()`; otherwise animate back to `y: 0`.
- `dragDirectionLock` set to prevent horizontal drag events from propagating to the card swipe handler.

**Backdrop:** fixed full-screen `div` (`z-40`, `bg-black/60`), `onClick` calls `onClose()`. Rendered via `AnimatePresence` with `initial={{ opacity: 0 }}`, `animate={{ opacity: 1 }}`, `exit={{ opacity: 0 }}`.

**Z-index:** backdrop at `z-40`, sheet at `z-50`.

### State cleanup

- Ensure `isExplainOpen` resets to `false` in `advance()`.
- Ensure `isExplainOpen` resets to `false` when the card is flipped (in `handleCardClick`).

## What does NOT change

- Card dimensions, styling, or swipe behaviour.
- Progress counter position.
- Flip-on-tap behaviour.
- `data-testid` attributes on existing elements.

## Files affected

- `components/FlashcardDeck.tsx` — move button outside card, add `ExplainSheet` and backdrop render.
- `components/ExplainSheet.tsx` — new component (sheet UI and animation).
- `__tests__/components/FlashcardDeck.test.tsx` — update tests: button no longer inside card, now triggers sheet instead of inline panel.
- `__tests__/components/ExplainSheet.test.tsx` — new test file covering open/close, content rendering, and drag-to-dismiss.
