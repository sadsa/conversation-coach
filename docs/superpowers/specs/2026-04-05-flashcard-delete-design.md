# Flashcard Delete — Design Spec

**Date:** 2026-04-05
**Branch:** feat/web-push-notifications (or new feature branch)
**Status:** Approved — implemented in `FlashcardDeck` / `FlashcardsPage` (see plan `docs/superpowers/plans/2026-04-05-flashcard-delete.md`)

---

## Overview

Add the ability to delete a practice item directly from the flashcard screen. The interaction uses a three-dot (⋮) menu at the top-right of the card that opens a small dropdown, with a confirmation sheet before the destructive action fires.

Deletion behaviour matches the Practice screen: calls `DELETE /api/practice-items/:id`, which removes the row from `practice_items` entirely.

---

## Visual Design

Three states (already prototyped and approved in `docs/flashcard-delete-prototype.html`):

1. **Default** — ⋮ button sits quietly at top-right of card in `text-gray-600`; does not compete with card content.
2. **Menu open** — dropdown appears anchored to the button with two items: "Skip card" (neutral, for future use) separated from red "Delete card". Card content dims to `opacity-40`.
3. **Confirm sheet** — a bottom sheet (matching `ExplainSheet`'s blur-overlay + slide-up pattern) with "Delete this flashcard?" title, explanatory copy, and Cancel / Delete buttons.

---

## Architecture

### No new API routes

Reuses the existing `DELETE /api/practice-items/:id` endpoint (already used by `PracticeList`).

### State changes — `FlashcardDeck`

| State var | Type | Purpose |
|---|---|---|
| `menuOpen` | `boolean` | controls the ⋮ dropdown |
| `confirmOpen` | `boolean` | controls the confirmation sheet |
| `isDeleting` | `boolean` | disables Delete button during fetch, prevents double-submit |
| `deleteError` | `string \| null` | inline error inside the confirm sheet on failure |

### New prop — `FlashcardDeck`

```ts
onDeleted?: (id: string) => void
```

Called after a successful API delete. The parent (`FlashcardsPage`) uses this to filter the item out of its `items` state.

### Changes to `FlashcardsPage`

`items` state already lives in `FlashcardsPage`. Add:

```ts
function handleDeleted(id: string) {
  setItems(prev => prev.filter(i => i.id !== id))
}
```

Pass `onDeleted={handleDeleted}` to `FlashcardDeck`.

---

## Interaction Details

### Opening / closing the menu

- Tap ⋮ → `menuOpen = true`
- A full-screen transparent backdrop `div` (below the dropdown, `z-index` between card and dropdown) closes the menu on tap
- `onDragStart` on the motion card closes the menu (prevents it staying open during swipe)
- Pressing Escape closes the menu (keyboard accessibility)

### Delete flow

1. Tap "Delete card" → `menuOpen = false`, `confirmOpen = true`
2. Confirm sheet renders over blurred backdrop
3. Tap "Delete" → `isDeleting = true`, call `DELETE /api/practice-items/:id`
4. **Success** → `confirmOpen = false`, call `onDeleted(item.id)`
5. **Failure** → `isDeleting = false`, show `deleteError` inline in the sheet ("Couldn't delete — please try again")

### Post-deletion index management (in `FlashcardsPage`)

After `items` is filtered:
- If items remain → `FlashcardDeck` clamps `currentIndex` via a `useEffect` watching `items.length`: `setCurrentIndex(i => Math.min(i, items.length - 1))`
- If items array becomes empty → `FlashcardsPage` renders the existing empty-state message

The cleanest approach: `FlashcardDeck` receives the filtered `items` prop and resets `currentIndex` via a `useEffect` that clamps when `items.length` changes.

---

## Component Structure

```
FlashcardsPage
└── FlashcardDeck (items, onDeleted)
    ├── ⋮ MenuButton
    ├── MenuDropdown (menuOpen)
    │   ├── "Skip card" item  (no-op for now)
    │   └── "Delete card" item (danger)
    └── ConfirmSheet (confirmOpen, isDeleting, deleteError)
        ├── Cancel button
        └── Delete button
```

All new UI is inlined in `FlashcardDeck.tsx` — no new component files.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| API returns non-ok response | `deleteError` shown inline in confirm sheet; card stays in deck |
| Network failure | Same as above |
| Double-tap Delete | `isDeleting` flag prevents second call |

No optimistic removal. The card stays visible until the API confirms deletion.

---

## Accessibility

- ⋮ button has `aria-label="Card options"` and `aria-expanded={menuOpen}`
- Dropdown items are `<button>` elements
- Confirm sheet traps focus (Cancel focused on open)
- Escape key closes menu and confirm sheet
- Delete button has `aria-busy={isDeleting}` while loading

---

## Testing

- Unit test: clicking ⋮ opens dropdown
- Unit test: clicking "Delete card" opens confirm sheet
- Unit test: Cancel closes confirm sheet without calling API
- Unit test: Delete calls `DELETE /api/practice-items/:id` and invokes `onDeleted`
- Unit test: API failure shows error, card stays in deck
- Unit test: deleting last card renders empty state
- Existing `FlashcardDeck` tests must continue to pass
