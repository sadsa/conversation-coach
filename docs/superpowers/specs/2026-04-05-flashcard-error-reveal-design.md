# Flashcard Error Reveal Design

**Date:** 2026-04-05

## Problem

When reviewing a flashcard and flipping to the Spanish back, there is no immediate way to see what the original wrong phrase was. The "Explain this" button exists but requires an extra tap and opens a full bottom sheet — too heavy for a quick glance at the error.

## Goal

Show the original wrong phrase instantly on flip, and make the correction explanation accessible without a dedicated button taking up space below the card.

## Design

### Interaction model

- The card back shows only the Spanish sentence (`flashcard_back`), unchanged in content.
- The green-highlighted correct phrase becomes tappable (dashed underline signals interactivity).
- Tapping the green phrase opens the `ExplainSheet` bottom sheet — always, regardless of whether `flashcard_note` is present.
- The "Explain this" button is removed entirely.
- A small hint line inside the card — `tap green to explain` — replaces the discoverability role of the button.
- No "You said" chip is added to the card face.

### What the bottom sheet shows

The `ExplainSheet` already renders:
- **You said** — `original` (red pill)
- **Correction** — `correction` (green text)
- Divider + note — `flashcard_note` (explanation paragraph)

When `flashcard_note` is null/empty, the divider and note paragraph are hidden. The sheet still opens and shows original → correction.

## Files Changed

### `components/FlashcardDeck.tsx`

1. Add `onClick?: () => void` param to `renderHighlighted`.
   - When provided: add `onClick={e => { e.stopPropagation(); onClick() }}` to the highlighted span, and add a dashed underline class (`border-b border-dashed border-green-400`).
   - When absent: behaviour unchanged (used on the front face).
2. Back face: pass `() => setIsExplainOpen(true)` as the `onClick` arg to `renderHighlighted`.
3. Remove the "Explain this" button block (`isFlipped && item.flashcard_note !== null` guard + button element).
4. Add hint text inside the card back using translation key `flashcard.tapToExplain` (small, muted, centred — same style as the existing `tapToReveal` hint on the front). Add this key to all locale files in `components/LanguageProvider.tsx`.
5. The `isExplainOpen` state and `ExplainSheet` props are otherwise unchanged. The `isFlipped && item.flashcard_note !== null` guard on `isExplainOpen` is no longer needed — `isExplainOpen` is only set to `true` via the span click handler, so it can only be true when flipped.

### `components/ExplainSheet.tsx`

1. Conditionally render the `<hr>` divider and note `<p>` only when `note` is truthy.
   - No prop type change required (`note` continues to receive `item.flashcard_note ?? ''` from the parent).

## Out of Scope

- No changes to how `flashcard_back` content is generated or stored.
- No changes to `ExplainSheet` layout or styling beyond the conditional note section.
- No changes to the front face of the card.
- No changes to swipe navigation or card flip behaviour.
