# Flashcard Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-dot menu to the flashcard card that lets the user delete the current practice item, with a confirmation sheet before the destructive action fires.

**Architecture:** All UI changes are self-contained in `FlashcardDeck.tsx`. `FlashcardsPage` receives a new `onDeleted` callback from `FlashcardDeck` and filters the item from its local state. The existing `DELETE /api/practice-items/:id` endpoint is reused — no new routes.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS, Vitest + React Testing Library, framer-motion (mocked in tests).

---

## File Map

| File | Change |
|---|---|
| `lib/i18n.ts` | Add 5 new translation keys for the menu/confirm UI |
| `components/FlashcardDeck.tsx` | Add `onDeleted` prop, menu state, ⋮ button, dropdown, confirm sheet, delete logic, index-clamp effect |
| `app/flashcards/page.tsx` | Pass `onDeleted` handler to `FlashcardDeck` |
| `__tests__/components/FlashcardDeck.test.tsx` | Add test suites for menu, confirm sheet, delete flow |

---

## Task 1: Add i18n translation keys

**Files:**
- Modify: `lib/i18n.ts`

- [ ] **Step 1: Add English and Spanish keys**

Open `lib/i18n.ts`. In the English block (around line 117), add after `'flashcard.tapToExplain'`:

```ts
'flashcard.cardOptions': 'Card options',
'flashcard.skipCard': 'Skip card',
'flashcard.deleteCard': 'Delete card',
'flashcard.deleteConfirmTitle': 'Delete this flashcard?',
'flashcard.deleteConfirmBody': "This will permanently remove the practice item. This can't be undone.",
'flashcard.deleteConfirmDelete': 'Delete',
'flashcard.deleteConfirmCancel': 'Cancel',
'flashcard.deleteError': "Couldn't delete — please try again",
```

In the Spanish block (around line 283), add after `'flashcard.tapToExplain'`:

```ts
'flashcard.cardOptions': 'Opciones de tarjeta',
'flashcard.skipCard': 'Saltar tarjeta',
'flashcard.deleteCard': 'Eliminar tarjeta',
'flashcard.deleteConfirmTitle': '¿Eliminar esta tarjeta?',
'flashcard.deleteConfirmBody': 'Esto eliminará el ítem de práctica permanentemente.',
'flashcard.deleteConfirmDelete': 'Eliminar',
'flashcard.deleteConfirmCancel': 'Cancelar',
'flashcard.deleteError': 'No se pudo eliminar — intentá de nuevo',
```

- [ ] **Step 2: Commit**

```bash
git add lib/i18n.ts
git commit -m "feat: add i18n keys for flashcard delete menu"
```

---

## Task 2: Wire up `onDeleted` prop and `FlashcardsPage` handler

**Files:**
- Modify: `components/FlashcardDeck.tsx`
- Modify: `app/flashcards/page.tsx`
- Modify: `__tests__/components/FlashcardDeck.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the bottom of `__tests__/components/FlashcardDeck.test.tsx`:

```tsx
describe('FlashcardDeck — onDeleted prop', () => {
  it('renders without onDeleted prop (optional)', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
  })

  it('clamps currentIndex when items shrink below current position', async () => {
    const item2: PracticeItem = {
      ...baseItem, id: 'item-2',
      flashcard_front: 'second [[card]]',
      flashcard_back: 'segunda [[tarjeta]]',
    }
    const { rerender } = render(<FlashcardDeck items={[baseItem, item2]} onDeleted={vi.fn()} />)
    // Advance to card 2 (index 1)
    await userEvent.click(screen.getByTestId('advance-card'))
    expect(screen.getByText('card')).toBeInTheDocument()

    // Simulate parent removing item-2 (current card) from list
    rerender(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)

    // Should have clamped to index 0
    expect(screen.getByText('flush out')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: The "clamps currentIndex" test FAILs because `onDeleted` prop and clamping effect don't exist yet. The "renders without onDeleted prop" test PASSes (prop is not required).

- [ ] **Step 3: Add `onDeleted` prop and index-clamp `useEffect` to `FlashcardDeck`**

In `components/FlashcardDeck.tsx`, update the `Props` interface:

```ts
interface Props {
  items: PracticeItem[]
  onDeleted?: (id: string) => void
}
```

Update the function signature:

```ts
export function FlashcardDeck({ items, onDeleted }: Props) {
```

Add this `useEffect` immediately after the existing `controls`, `x`, and `isDragging` declarations (before the `advance` function):

```ts
// Clamp currentIndex if items shrink (e.g. after deletion)
useEffect(() => {
  if (items.length > 0 && currentIndex >= items.length) {
    setCurrentIndex(items.length - 1)
  }
}, [items.length])
```

- [ ] **Step 4: Add `handleDeleted` to `FlashcardsPage`**

Open `app/flashcards/page.tsx`. Add this handler inside the component, after the `setItems` state declaration:

```ts
function handleDeleted(id: string) {
  setItems(prev => prev.filter(i => i.id !== id))
}
```

Pass it to `FlashcardDeck`:

```tsx
<FlashcardDeck items={items} onDeleted={handleDeleted} />
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add components/FlashcardDeck.tsx app/flashcards/page.tsx __tests__/components/FlashcardDeck.test.tsx
git commit -m "feat: add onDeleted prop and index-clamping to FlashcardDeck"
```

---

## Task 3: Add three-dot menu button and dropdown

**Files:**
- Modify: `components/FlashcardDeck.tsx`
- Modify: `__tests__/components/FlashcardDeck.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block in `__tests__/components/FlashcardDeck.test.tsx`:

```tsx
describe('FlashcardDeck — three-dot menu', () => {
  it('renders the ⋮ menu button', () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    expect(screen.getByRole('button', { name: /card options/i })).toBeInTheDocument()
  })

  it('dropdown is not visible initially', () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    expect(screen.queryByTestId('card-menu-dropdown')).not.toBeInTheDocument()
  })

  it('opens dropdown when ⋮ button is clicked', async () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    expect(screen.getByTestId('card-menu-dropdown')).toBeInTheDocument()
  })

  it('shows "Skip card" and "Delete card" in dropdown', async () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    expect(screen.getByRole('button', { name: /skip card/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete card/i })).toBeInTheDocument()
  })

  it('closes dropdown when backdrop is clicked', async () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByTestId('card-menu-backdrop'))
    expect(screen.queryByTestId('card-menu-dropdown')).not.toBeInTheDocument()
  })

  it('closes dropdown when Escape is pressed', async () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('card-menu-dropdown')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: All 6 new tests FAIL ("cannot find role button with name /card options/i").

- [ ] **Step 3: Add `menuOpen` state and keyboard handler**

In `components/FlashcardDeck.tsx`, add to the existing state declarations:

```ts
const [menuOpen, setMenuOpen] = useState(false)
```

Add a `useEffect` for Escape key, after the existing clamping effect:

```ts
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') setMenuOpen(false)
  }
  document.addEventListener('keydown', onKeyDown)
  return () => document.removeEventListener('keydown', onKeyDown)
}, [])
```

- [ ] **Step 4: Close menu on drag start**

In the `motion.div` that wraps the card, update `onDragStart`:

```tsx
onDragStart={() => {
  isDragging.current = true
  setMenuOpen(false)
}}
```

- [ ] **Step 5: Add the ⋮ button, backdrop, and dropdown inside the card**

The card `motion.div` currently renders `{!isFlipped ? (...) : (...)}`. Add the menu elements just before that conditional, inside the `motion.div`:

```tsx
{/* Three-dot menu button */}
<button
  data-testid="card-menu-btn"
  aria-label={t('flashcard.cardOptions')}
  aria-expanded={menuOpen}
  onClick={e => { e.stopPropagation(); setMenuOpen(prev => !prev) }}
  className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors z-10"
>
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
</button>

{/* Backdrop — closes menu on outside click */}
{menuOpen && (
  <div
    data-testid="card-menu-backdrop"
    className="fixed inset-0 z-20"
    onClick={() => setMenuOpen(false)}
  />
)}

{/* Dropdown */}
{menuOpen && (
  <div
    data-testid="card-menu-dropdown"
    className="absolute top-12 right-3 z-30 min-w-[148px] bg-[#1c2028] border border-gray-700 rounded-xl overflow-hidden shadow-xl"
    onClick={e => e.stopPropagation()}
  >
    <button
      className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-gray-200 hover:bg-gray-700 transition-colors"
      onClick={() => setMenuOpen(false)}
    >
      {t('flashcard.skipCard')}
    </button>
    <div className="h-px bg-gray-800 mx-2.5" />
    <button
      className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-950/40 transition-colors"
      onClick={() => {
        setMenuOpen(false)
        // confirmOpen logic added in Task 4
      }}
    >
      {t('flashcard.deleteCard')}
    </button>
  </div>
)}
```

Also dim the card content when the menu is open. Wrap the existing `{!isFlipped ? ... : ...}` block:

```tsx
<div className={menuOpen ? 'opacity-40 pointer-events-none' : ''}>
  {!isFlipped ? (
    // ... existing front face JSX
  ) : (
    // ... existing back face JSX
  )}
</div>
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: All tests PASS, including the pre-existing suite.

- [ ] **Step 7: Commit**

```bash
git add components/FlashcardDeck.tsx __tests__/components/FlashcardDeck.test.tsx
git commit -m "feat: add three-dot menu and dropdown to FlashcardDeck"
```

---

## Task 4: Add confirm sheet and delete logic

**Files:**
- Modify: `components/FlashcardDeck.tsx`
- Modify: `__tests__/components/FlashcardDeck.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block in `__tests__/components/FlashcardDeck.test.tsx`:

```tsx
describe('FlashcardDeck — delete confirm sheet', () => {
  function openConfirmSheet() {
    return [
      userEvent.click(screen.getByRole('button', { name: /card options/i })),
    ].concat([
      userEvent.click(screen.getByRole('button', { name: /delete card/i })),
    ])
  }

  it('opens confirm sheet when "Delete card" is clicked', async () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    expect(screen.getByTestId('delete-confirm-sheet')).toBeInTheDocument()
    expect(screen.getByText(/delete this flashcard/i)).toBeInTheDocument()
  })

  it('closes confirm sheet and does not call fetch on Cancel', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByTestId('delete-confirm-sheet')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls DELETE /api/practice-items/:id and invokes onDeleted on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const onDeleted = vi.fn()
    render(<FlashcardDeck items={[baseItem]} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(fetch).toHaveBeenCalledWith('/api/practice-items/item-1', { method: 'DELETE' })
    expect(onDeleted).toHaveBeenCalledWith('item-1')
    expect(screen.queryByTestId('delete-confirm-sheet')).not.toBeInTheDocument()
  })

  it('shows inline error and keeps card when API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const onDeleted = vi.fn()
    render(<FlashcardDeck items={[baseItem]} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText(/couldn't delete/i)).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByTestId('delete-confirm-sheet')).toBeInTheDocument()
  })

  it('shows inline error and keeps card when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const onDeleted = vi.fn()
    render(<FlashcardDeck items={[baseItem]} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText(/couldn't delete/i)).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: All 5 new tests FAIL ("cannot find testid delete-confirm-sheet").

- [ ] **Step 3: Add confirm sheet state variables**

In `components/FlashcardDeck.tsx`, add to the existing state declarations:

```ts
const [confirmOpen, setConfirmOpen] = useState(false)
const [isDeleting, setIsDeleting] = useState(false)
const [deleteError, setDeleteError] = useState<string | null>(null)
```

- [ ] **Step 4: Wire "Delete card" dropdown button to open the confirm sheet**

Update the onClick of the "Delete card" dropdown button (currently has a placeholder comment):

```tsx
onClick={() => {
  setMenuOpen(false)
  setDeleteError(null)
  setConfirmOpen(true)
}}
```

- [ ] **Step 5: Add the `handleDeleteConfirm` function**

Add this function after the `goBack` function:

```ts
async function handleDeleteConfirm() {
  if (isDeleting) return
  setIsDeleting(true)
  setDeleteError(null)
  try {
    const res = await fetch(`/api/practice-items/${item.id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('not ok')
    setConfirmOpen(false)
    onDeleted?.(item.id)
  } catch {
    setDeleteError(t('flashcard.deleteError'))
  } finally {
    setIsDeleting(false)
  }
}
```

- [ ] **Step 6: Add the confirm sheet JSX**

Add this block just before the closing `</div>` of the outer container (`className="flex flex-col items-center justify-center flex-1 px-4 py-6 select-none"`), after the `<ExplainSheet>` component:

```tsx
{/* Delete confirm sheet */}
{confirmOpen && (
  <>
    {/* Backdrop */}
    <div
      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
      onClick={() => { if (!isDeleting) setConfirmOpen(false) }}
    />
    {/* Sheet */}
    <div
      data-testid="delete-confirm-sheet"
      className="fixed bottom-0 left-0 right-0 z-50 p-4"
    >
      <div className="w-full max-w-sm mx-auto bg-[#1c2028] border border-gray-700 rounded-2xl p-6 shadow-2xl">
        <p className="text-base font-medium text-gray-100 mb-2">
          {t('flashcard.deleteConfirmTitle')}
        </p>
        <p className="text-sm text-gray-400 leading-relaxed mb-5">
          {t('flashcard.deleteConfirmBody')}
        </p>
        {deleteError && (
          <p className="text-sm text-red-400 mb-3">{deleteError}</p>
        )}
        <div className="flex gap-3">
          <button
            className="flex-1 py-3 rounded-xl text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors disabled:opacity-40"
            onClick={() => setConfirmOpen(false)}
            disabled={isDeleting}
          >
            {t('flashcard.deleteConfirmCancel')}
          </button>
          <button
            className="flex-1 py-3 rounded-xl text-sm font-medium bg-red-900 text-red-300 hover:bg-red-800 transition-colors disabled:opacity-40"
            onClick={handleDeleteConfirm}
            disabled={isDeleting}
            aria-busy={isDeleting}
          >
            {isDeleting ? '…' : t('flashcard.deleteConfirmDelete')}
          </button>
        </div>
      </div>
    </div>
  </>
)}
```

- [ ] **Step 7: Run tests to confirm all pass**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: All tests PASS (new + existing suites).

- [ ] **Step 8: Run the full test suite**

```bash
npm test
```

Expected: All tests PASS. No regressions.

- [ ] **Step 9: Commit**

```bash
git add components/FlashcardDeck.tsx __tests__/components/FlashcardDeck.test.tsx
git commit -m "feat: add delete confirm sheet and delete logic to FlashcardDeck"
```

---

## Final Check

- [ ] **Manual smoke test:** Run `npm run dev`, open the flashcard screen, tap ⋮, tap "Delete card", confirm — verify card disappears and deck advances. Tap ⋮ on a single-card deck, delete it — verify empty state renders.
- [ ] **Build:** Run `npm run build` to confirm no TypeScript errors.
