# Flashcard UI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four UI issues in the flashcard feature: inline highlight alignment, replace the cramped note panel with an "Explain this" button, add a framer-motion swipe-off animation, and remove the redundant back button while centring the card.

**Architecture:** All changes are confined to `components/FlashcardDeck.tsx`, `app/flashcards/page.tsx`, and their tests. `react-swipeable` is replaced entirely by `framer-motion`, which handles both drag detection and animation.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, framer-motion (new), Vitest + React Testing Library

---

## File Map

| File | Change |
|---|---|
| `components/FlashcardDeck.tsx` | All four fixes — highlight containers, explain panel, framer-motion drag |
| `app/flashcards/page.tsx` | Remove back button; scope `justify-center` to loaded state |
| `__tests__/components/FlashcardDeck.test.tsx` | Swap mocks; update note panel tests to use new "Explain this" button |
| `package.json` | Add `framer-motion`, remove `react-swipeable` |

---

## Task 1: Install framer-motion, remove react-swipeable

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install framer-motion and uninstall react-swipeable**

Run from the project root:
```bash
npm install framer-motion
npm uninstall react-swipeable
```

Expected: both commands exit 0. `package.json` shows `framer-motion` in `dependencies`, no `react-swipeable`.

> Note: `FlashcardDeck.tsx` still imports `useSwipeable` from the now-removed package. The build and tests will fail until Task 6 replaces that import. This is expected — the tasks are ordered so fixes apply in a logical sequence, not all at once.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: replace react-swipeable with framer-motion"
```

---

## Task 2: Fix 4 — Remove back button, centre card vertically

**Files:**
- Modify: `app/flashcards/page.tsx`

- [ ] **Step 1: Open the file and make the two changes**

In `app/flashcards/page.tsx`:

1. Delete the entire back-link block (lines 32–36):
```tsx
// DELETE THIS:
<div className="flex items-center px-4 pt-4 pb-2">
  <Link href="/" className="text-gray-400 hover:text-gray-200 text-sm">
    ← Back
  </Link>
</div>
```

2. Also remove the `import Link from 'next/link'` at the top (no longer needed).

3. Wrap **only** the `<FlashcardDeck>` render in a centring div. Change the `items.length > 0` block from:

> Note: `FlashcardDeck`'s own root div already has `flex-1` — this outer wrapper gives it a full-height flex context to centre within. Loading/error/empty states are left as siblings at the top of the page root and are unaffected.
```tsx
{!loading && !error && items.length > 0 && (
  <FlashcardDeck items={items} />
)}
```
to:
```tsx
{!loading && !error && items.length > 0 && (
  <div className="flex flex-col flex-1 justify-center">
    <FlashcardDeck items={items} />
  </div>
)}
```

The final file should look like:
```tsx
'use client'
import { useState, useEffect } from 'react'
import { FlashcardDeck } from '@/components/FlashcardDeck'
import type { PracticeItem } from '@/lib/types'

export default function FlashcardsPage() {
  const [items, setItems] = useState<PracticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setItems(
            data.filter((i: PracticeItem) =>
              i.flashcard_front !== null && i.flashcard_back !== null
            )
          )
        } else {
          setError(data?.error ?? 'Failed to load flashcards')
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {loading && (
        <p className="text-gray-500 text-sm px-4">Loading…</p>
      )}

      {error && (
        <p className="text-red-400 text-sm px-4">Error: {error}</p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="text-gray-500 text-sm px-4">
          No flashcards yet — complete a session to generate cards.
        </p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="flex flex-col flex-1 justify-center">
          <FlashcardDeck items={items} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run tests to make sure nothing is broken**

```bash
npm test
```

Expected: all tests pass (page tests are unaffected by this change).

- [ ] **Step 3: Commit**

```bash
git add app/flashcards/page.tsx
git commit -m "feat: remove back button and centre flashcard vertically"
```

---

## Task 3: Fix 1 — Inline highlight alignment

**Files:**
- Modify: `components/FlashcardDeck.tsx:69-79`

**Problem:** The `<p>` tags on both the front and back face have `flex items-center justify-center` applied directly. This makes text nodes and the highlighted `<span>` flex items, breaking inline text flow. The fix: move the flex centering to a wrapping `<div>`, leaving the `<p>` as a plain text-center block.

- [ ] **Step 1: Update the front face text container**

In `FlashcardDeck.tsx`, find the front face section — it is inside `data-testid="flashcard-front"`. Change this block:
```tsx
<div data-testid="flashcard-front" className="flex flex-col flex-1 justify-between">
  <p className="text-base text-gray-100 leading-relaxed text-center flex-1 flex items-center justify-center">
    {renderHighlighted(item.flashcard_front!, 'purple')}
  </p>
  <p className="text-xs text-gray-600 text-center mt-4">Tap to reveal Spanish</p>
</div>
```
to:
```tsx
<div data-testid="flashcard-front" className="flex flex-col flex-1 justify-between">
  <div className="flex-1 flex items-center justify-center">
    <p className="text-base text-gray-100 leading-relaxed text-center">
      {renderHighlighted(item.flashcard_front!, 'purple')}
    </p>
  </div>
  <p className="text-xs text-gray-600 text-center mt-4">Tap to reveal Spanish</p>
</div>
```

- [ ] **Step 2: Update the back face text container**

Find the back face section — it is inside `data-testid="flashcard-back"`. Change only the `<p>` that wraps `renderHighlighted(item.flashcard_back!, 'green')` (the first child of the back face div):
```tsx
<p className="text-base text-gray-100 leading-relaxed text-center flex-1 flex items-center justify-center">
  {renderHighlighted(item.flashcard_back!, 'green')}
</p>
```
to:
```tsx
<div className="flex-1 flex items-center justify-center">
  <p className="text-base text-gray-100 leading-relaxed text-center">
    {renderHighlighted(item.flashcard_back!, 'green')}
  </p>
</div>
```

- [ ] **Step 3: Run the tests**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: all tests pass. The `renderHighlighted` tests query by text content (`getByText('flush out')`, `getByText('se te lleva')`) which are unaffected by the wrapper change.

- [ ] **Step 4: Commit**

```bash
git add components/FlashcardDeck.tsx
git commit -m "fix: render highlighted phrase inline by removing flex from text paragraph"
```

---

## Task 4: Update tests for the new "Explain this" panel

**Files:**
- Modify: `__tests__/components/FlashcardDeck.test.tsx`

This task updates the test file to reflect Fix 2 (new panel) and Fix 3 (framer-motion). Write the tests in their final state first — they will fail until Task 5 implements the component changes.

- [ ] **Step 1: Swap the mock at the top of the test file**

Two separate changes:

**1a.** Add `import React from 'react'` to the existing import block at the top of the file (after the other imports, before the `vi.mock` line):
```ts
import React from 'react'
```

**1b.** Replace the `vi.mock('react-swipeable', ...)` block with:
```ts
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onDragStart, onDragEnd, onClick, style, animate, drag, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
      React.createElement('div', { onClick, ...rest }, children),
  },
  useAnimationControls: () => ({ start: vi.fn().mockResolvedValue(undefined), set: vi.fn() }),
  useMotionValue: (_initial: number) => ({ get: vi.fn(), set: vi.fn() }),
}))
```

> The mock renders `motion.div` as a plain `div`, passing through `onClick` (needed for flip tests). `onDragStart`/`onDragEnd` are dropped — drag cannot be simulated in jsdom. Because `onDragStart` never fires, `isDragging.current` will always be `false` in tests, meaning `handleCardClick` will never be blocked. This is correct — flip tests work as expected. Card advancement is tested via the `data-testid="advance-card"` seam.

- [ ] **Step 2: Update the "note panel" describe block**

Replace the entire `describe('FlashcardDeck — note panel', ...)` block (lines 68–102 of the current test file) with the block below. Note: the old tests `'shows original and correction in note header'` and `'shows — when correction is null'` are intentionally replaced — they previously asserted on DOM elements that were always visible, but in the new design those elements only appear after the "Explain this" button is clicked.

```ts
describe('FlashcardDeck — explain panel', () => {
  it('does not show note text by default on back face', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByText(/"Te elimina" sounds/)).not.toBeInTheDocument()
  })

  it('shows note text after clicking "Explain this"', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /explain this/i }))
    expect(screen.getByText(/"Te elimina" sounds like a direct translation/)).toBeInTheDocument()
  })

  it('shows original and correction inside explain panel', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /explain this/i }))
    expect(screen.getByText('te elimina')).toBeInTheDocument()
    expect(screen.getAllByText('se te lleva').length).toBeGreaterThan(0)
  })

  it('shows — when correction is null', async () => {
    const item = { ...baseItem, correction: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /explain this/i }))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('hides explain button entirely when flashcard_note is null', async () => {
    const item = { ...baseItem, flashcard_note: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByRole('button', { name: /explain this/i })).not.toBeInTheDocument()
  })

  it('toggles panel closed on second "Explain this" click', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /explain this/i }))
    expect(screen.getByText(/"Te elimina" sounds/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /explain this/i }))
    expect(screen.queryByText(/"Te elimina" sounds/)).not.toBeInTheDocument()
  })

  it('resets explain panel when advancing to next card', async () => {
    const item2: PracticeItem = {
      ...baseItem, id: 'item-2',
      flashcard_front: 'second card [[phrase]] here',
      flashcard_back: 'segunda [[tarjeta]] aquí',
    }
    render(<FlashcardDeck items={[baseItem, item2]} />)
    await userEvent.click(screen.getByTestId('flashcard-card')) // flip
    await userEvent.click(screen.getByRole('button', { name: /explain this/i })) // open panel
    expect(screen.getByText(/"Te elimina" sounds/)).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('advance-card')) // advance
    // Now on card 2 front — panel should be gone
    expect(screen.queryByText(/"Te elimina" sounds/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run the updated tests to verify they fail**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: **most or all tests will fail at this point.** The component still imports `useSwipeable` from the uninstalled `react-swipeable`, which causes a module resolution error. This is expected — the component import is replaced in Task 6. The important thing is that the test file itself has no syntax errors (the `import React` placement, mock factory, and test bodies are all valid TypeScript).

- [ ] **Step 4: Commit the test changes**

```bash
git add __tests__/components/FlashcardDeck.test.tsx
git commit -m "test: update FlashcardDeck tests for explain panel and framer-motion mock"
```

---

## Task 5: Fix 2 — Implement the "Explain this" panel

**Files:**
- Modify: `components/FlashcardDeck.tsx`

- [ ] **Step 1: Replace `isNoteExpanded` state with `isExplainOpen`**

At the top of `FlashcardDeck`, change:
```tsx
const [isNoteExpanded, setIsNoteExpanded] = useState(false)
```
to:
```tsx
const [isExplainOpen, setIsExplainOpen] = useState(false)
```

In the `advance()` function, change:
```tsx
setIsNoteExpanded(false)
```
to:
```tsx
setIsExplainOpen(false)
```

In `handleCardClick`, change:
```tsx
if (isFlipped) setIsNoteExpanded(false)
```
to:
```tsx
if (isFlipped) setIsExplainOpen(false)
```

> Note: `handleCardClick` still references `isSwiping.current` at this point (the guard on line 52). Do not change it yet — that ref is renamed to `isDragging` in Task 6 Step 3. The component will be in a transitional state between Tasks 5 and 6 but the tests will still pass because the mock always has `isDragging.current = false`.

- [ ] **Step 2: Replace the back face note panel**

Find the back face section (inside `isFlipped` branch). Replace the entire note panel div:
```tsx
{item.flashcard_note !== null && (
  <div className="bg-indigo-950 border border-indigo-900 rounded-xl px-3 py-2">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
        <span className="text-red-400 line-through truncate">{item.original}</span>
        {item.correction !== null ? (
          <span className="text-green-400 truncate">→ {item.correction}</span>
        ) : (
          <span className="text-gray-500">—</span>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); setIsNoteExpanded(prev => !prev) }}
        aria-label={isNoteExpanded ? 'Hide explanation' : 'Why?'}
        className="text-xs text-indigo-400 hover:text-indigo-200 flex-shrink-0 px-1"
      >
        Why? {isNoteExpanded ? '▴' : '▾'}
      </button>
    </div>
    {isNoteExpanded && (
      <p className="text-xs text-indigo-300 mt-2 leading-relaxed">{item.flashcard_note}</p>
    )}
  </div>
)}
```

with:
```tsx
{item.flashcard_note !== null && (
  <>
    <button
      onClick={e => { e.stopPropagation(); setIsExplainOpen(prev => !prev) }}
      className="w-full py-2 text-sm text-indigo-400 bg-indigo-950/50 border border-indigo-900 rounded-lg"
    >
      Explain this →
    </button>
    {isExplainOpen && (
      <div className="bg-indigo-950 border border-indigo-900 rounded-xl px-3 py-3">
        <p className="text-base">
          <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
            {item.original}
          </span>
          {' → '}
          {item.correction !== null
            ? <span className="font-semibold text-lg text-[#86efac]">{item.correction}</span>
            : <span className="text-gray-500">—</span>
          }
        </p>
        <hr className="border-indigo-900/40 my-2" />
        <p className="text-sm text-gray-400 leading-relaxed">{item.flashcard_note}</p>
      </div>
    )}
  </>
)}
```

- [ ] **Step 3: Run the tests**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: all tests pass including the new `explain panel` block.

- [ ] **Step 4: Commit**

```bash
git add components/FlashcardDeck.tsx
git commit -m "feat: replace note panel with Explain this button and inline annotation-style panel"
```

---

## Task 6: Fix 3 — Implement framer-motion swipe-off animation

**Files:**
- Modify: `components/FlashcardDeck.tsx`

- [ ] **Step 1: Update the import at the top of FlashcardDeck.tsx**

Replace:
```tsx
import { useSwipeable } from 'react-swipeable'
```
with:
```tsx
import { motion, useAnimationControls, useMotionValue } from 'framer-motion'
```

- [ ] **Step 2: Replace swipe state with framer-motion hooks**

Remove these lines:
```tsx
const isSwiping = useRef(false)
```
and the entire `handlers` block:
```tsx
const handlers = useSwipeable({
  delta: 30,
  trackMouse: false,
  onSwiping: () => { isSwiping.current = true },
  onSwipedLeft: (e) => {
    if (e.absX > 80) advance()
    setTimeout(() => { isSwiping.current = false }, 0)
  },
  onSwiped: () => { setTimeout(() => { isSwiping.current = false }, 0) },
})
```

Add in their place (after the `item` constant):
```tsx
const controls = useAnimationControls()
const x = useMotionValue(0)
const isDragging = useRef(false)
```

- [ ] **Step 3: Update handleCardClick to use isDragging**

Change:
```tsx
function handleCardClick() {
  if (isSwiping.current) return
  if (isFlipped) setIsExplainOpen(false)
  setIsFlipped(prev => !prev)
}
```
to:
```tsx
function handleCardClick() {
  if (isDragging.current) return
  if (isFlipped) setIsExplainOpen(false)
  setIsFlipped(prev => !prev)
}
```

- [ ] **Step 4: Replace the card div with a motion.div**

Change the card element from:
```tsx
<div
  {...handlers}
  data-testid="flashcard-card"
  onClick={handleCardClick}
  style={{ touchAction: 'pan-y' }}
  className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 min-h-[260px] flex flex-col justify-between cursor-pointer"
>
```
to:
```tsx
<motion.div
  data-testid="flashcard-card"
  drag="x"
  style={{ x }}
  animate={controls}
  onDragStart={() => { isDragging.current = true }}
  onDragEnd={(_, info) => {
    if (info.offset.x < -80) {
      controls.start({ x: -400, opacity: 0, transition: { duration: 0.2 } }).then(() => {
        advance()
        controls.set({ x: 0, opacity: 1 })
      })
    } else {
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } })
    }
    setTimeout(() => { isDragging.current = false }, 0)
  }}
  onClick={handleCardClick}
  className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 min-h-[260px] flex flex-col justify-between cursor-pointer"
>
```

And close it with `</motion.div>` instead of `</div>`.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass. The framer-motion mock renders `motion.div` as a plain `div` so flip and advance tests work as before.

- [ ] **Step 6: Commit**

```bash
git add components/FlashcardDeck.tsx
git commit -m "feat: add framer-motion swipe-off animation to flashcard deck"
```

---

## Task 7: Final check

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all tests pass with no warnings.

- [ ] **Step 2: Run the dev server and manually verify on mobile viewport**

```bash
npm run dev
```

Open `http://localhost:3000/flashcards` in Chrome DevTools with a mobile viewport (e.g. iPhone 14 Pro, 393×852).

Verify:
- [ ] Highlighted phrase sits flush inline with surrounding text (no offset box)
- [ ] Back of card shows "Explain this →" button
- [ ] Tapping "Explain this →" reveals the annotation-style correction row + explanation inside the card
- [ ] Tapping again hides it
- [ ] Swiping left animates the card off-screen, then the next card appears
- [ ] Sub-threshold drag springs back
- [ ] No `← Back` button visible
- [ ] Card is vertically centred on screen
