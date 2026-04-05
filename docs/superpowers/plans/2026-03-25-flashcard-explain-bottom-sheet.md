# Flashcard "Explain this" Bottom Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "Explain this" button below the flashcard card and replace the inline explain panel with an animated bottom sheet.

**Architecture:** `ExplainSheet` is a new self-contained component that receives `isOpen`, `onClose`, and the content props it needs to render. `FlashcardDeck` owns the `isExplainOpen` state, renders the button below the card (outside the swipeable `motion.div`), and passes state down to `ExplainSheet`. The sheet and its backdrop are rendered at the `FlashcardDeck` root level, not nested inside the card.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, framer-motion (`motion.div`, `AnimatePresence`, `useAnimationControls`), Vitest, React Testing Library.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `components/ExplainSheet.tsx` | Create | Bottom sheet UI, animation, backdrop, dismiss logic |
| `__tests__/components/ExplainSheet.test.tsx` | Create | Tests for ExplainSheet in isolation |
| `components/FlashcardDeck.tsx` | Modify | Move button below card, remove inline panel, add ExplainSheet |
| `__tests__/components/FlashcardDeck.test.tsx` | Modify | Update framer-motion mock, rewrite explain-panel tests |

---

## Task 1: Add `AnimatePresence` to the framer-motion mock in FlashcardDeck tests

The existing mock in `FlashcardDeck.test.tsx` doesn't include `AnimatePresence`. Without it, rendering `ExplainSheet` (which uses `AnimatePresence`) will throw. Fix the mock before writing any new tests.

**Files:**
- Modify: `__tests__/components/FlashcardDeck.test.tsx:9-16`

- [ ] **Step 1: Open the mock and add `AnimatePresence`**

Replace the existing `vi.mock('framer-motion', ...)` block (lines 9–16) with:

```ts
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onDragStart, onDragEnd, onClick, style, animate, drag, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
      React.createElement('div', { onClick, ...rest }, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAnimationControls: () => ({ start: vi.fn().mockResolvedValue(undefined), set: vi.fn() }),
  useMotionValue: (_initial: number) => ({ get: vi.fn(), set: vi.fn() }),
}))
```

- [ ] **Step 2: Run the existing tests to confirm they still pass**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: all existing tests PASS (no regressions from the mock change).

- [ ] **Step 3: Commit**

```bash
git add __tests__/components/FlashcardDeck.test.tsx
git commit -m "test: add AnimatePresence to framer-motion mock"
```

---

## Task 2: Create `ExplainSheet` with tests (TDD)

Write the test file first, then create the component to make the tests pass.

**Files:**
- Create: `__tests__/components/ExplainSheet.test.tsx`
- Create: `components/ExplainSheet.tsx`

### Step group A — write the failing tests

- [ ] **Step 1: Create the test file**

```ts
// __tests__/components/ExplainSheet.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExplainSheet } from '@/components/ExplainSheet'
import React from 'react'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onDragEnd, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
      React.createElement('div', { ...rest }, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  original: 'te elimina',
  correction: 'se te lleva',
  note: '"Te elimina" sounds like a direct translation.',
}

describe('ExplainSheet', () => {
  it('renders nothing when isOpen is false', () => {
    render(<ExplainSheet {...defaultProps} isOpen={false} />)
    expect(screen.queryByTestId('explain-sheet')).not.toBeInTheDocument()
  })

  it('renders sheet content when isOpen is true', () => {
    render(<ExplainSheet {...defaultProps} />)
    expect(screen.getByTestId('explain-sheet')).toBeInTheDocument()
  })

  it('displays original text', () => {
    render(<ExplainSheet {...defaultProps} />)
    expect(screen.getByText('te elimina')).toBeInTheDocument()
  })

  it('displays correction text', () => {
    render(<ExplainSheet {...defaultProps} />)
    expect(screen.getByText('se te lleva')).toBeInTheDocument()
  })

  it('displays — when correction is null', () => {
    render(<ExplainSheet {...defaultProps} correction={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('displays the note text', () => {
    render(<ExplainSheet {...defaultProps} />)
    expect(screen.getByText(/"Te elimina" sounds like a direct translation/)).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<ExplainSheet {...defaultProps} onClose={onClose} />)
    await userEvent.click(screen.getByTestId('explain-sheet-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/ExplainSheet.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ExplainSheet'`.

### Step group B — implement `ExplainSheet`

- [ ] **Step 3: Create the component**

```tsx
// components/ExplainSheet.tsx
'use client'
import { motion, AnimatePresence } from 'framer-motion'

interface ExplainSheetProps {
  isOpen: boolean
  onClose: () => void
  original: string
  correction: string | null
  note: string
}

export function ExplainSheet({ isOpen, onClose, original, correction, note }: ExplainSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            data-testid="explain-sheet-backdrop"
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            data-testid="explain-sheet"
            className="fixed bottom-0 left-0 right-0 z-50 bg-indigo-950 border border-indigo-800 rounded-t-2xl px-5 pb-10 pt-4"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            dragDirectionLock
            style={{ touchAction: 'none' }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80) onClose()
            }}
          >
            {/* Drag handle */}
            <div className="w-9 h-1 bg-indigo-700 rounded-full mx-auto mb-5" />

            {/* Original → correction */}
            <div className="bg-[#2d1515] rounded-xl px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
              <span className="bg-[#3b1a1a] text-[#fca5a5] px-2 py-0.5 rounded text-sm">
                {original}
              </span>
              <span className="text-gray-500 text-sm">→</span>
              {correction !== null
                ? <span className="font-semibold text-[#86efac]">{correction}</span>
                : <span className="text-gray-500">—</span>
              }
            </div>

            {/* Divider */}
            <hr className="border-indigo-900/40 mb-4" />

            {/* Note */}
            <p className="text-sm text-gray-400 leading-relaxed">{note}</p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/ExplainSheet.test.tsx
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ExplainSheet.tsx __tests__/components/ExplainSheet.test.tsx
git commit -m "feat: add ExplainSheet bottom sheet component"
```

---

## Task 3: Update `FlashcardDeck` — move button and integrate sheet

**Files:**
- Modify: `components/FlashcardDeck.tsx`
- Modify: `__tests__/components/FlashcardDeck.test.tsx`

### Step group A — update the FlashcardDeck tests first

The existing "explain panel" tests test inline panel behaviour that will be removed. Update them before touching the component so you have failing tests to drive the implementation.

- [ ] **Step 1: Rewrite the `FlashcardDeck — explain panel` describe block**

Replace the entire `describe('FlashcardDeck — explain panel', ...)` block (lines 74–134) with:

```ts
describe('FlashcardDeck — explain button', () => {
  it('does not show explain button on front face', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.queryByRole('button', { name: /explain this/i })).not.toBeInTheDocument()
  })

  it('shows explain button below card on back face', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByRole('button', { name: /explain this/i })).toBeInTheDocument()
  })

  it('hides explain button when flashcard_note is null', async () => {
    const item = { ...baseItem, flashcard_note: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByRole('button', { name: /explain this/i })).not.toBeInTheDocument()
  })

  it('opens explain sheet when button is clicked', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /explain this/i }))
    expect(screen.getByTestId('explain-sheet')).toBeInTheDocument()
  })

  it('shows original, correction, and note inside sheet', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /explain this/i }))
    expect(screen.getByText('te elimina')).toBeInTheDocument()
    expect(screen.getAllByText('se te lleva').length).toBeGreaterThan(0)
    expect(screen.getByText(/"Te elimina" sounds like a direct translation/)).toBeInTheDocument()
  })

  it('shows — in sheet when correction is null', async () => {
    const item = { ...baseItem, correction: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /explain this/i }))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('closes sheet when backdrop is clicked', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /explain this/i }))
    await userEvent.click(screen.getByTestId('explain-sheet-backdrop'))
    expect(screen.queryByTestId('explain-sheet')).not.toBeInTheDocument()
  })

  it('resets sheet when advancing to next card', async () => {
    const item2: PracticeItem = {
      ...baseItem, id: 'item-2',
      flashcard_front: 'second card [[phrase]] here',
      flashcard_back: 'segunda [[tarjeta]] aquí',
    }
    render(<FlashcardDeck items={[baseItem, item2]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /explain this/i }))
    expect(screen.getByTestId('explain-sheet')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('advance-card'))
    expect(screen.queryByTestId('explain-sheet')).not.toBeInTheDocument()
  })

  it('resets sheet when flipping card back to front', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card')) // flip to back
    await userEvent.click(screen.getByRole('button', { name: /explain this/i })) // open sheet
    await userEvent.click(screen.getByTestId('flashcard-card')) // flip back to front
    expect(screen.queryByTestId('explain-sheet')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run updated tests to confirm they fail**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: the new explain-button tests FAIL (component still has old inline panel behaviour). Existing front/flip/advance tests should still PASS.

### Step group B — update `FlashcardDeck`

- [ ] **Step 3: Update `FlashcardDeck.tsx`**

Make these changes to `components/FlashcardDeck.tsx`:

1. Add import at top:
```ts
import { ExplainSheet } from '@/components/ExplainSheet'
```

2. The framer-motion import stays as-is (`motion`, `useAnimationControls`, `useMotionValue`). Do NOT add `AnimatePresence` here — `ExplainSheet` handles it internally.

3. In `handleCardClick`, the existing `if (isFlipped) setIsExplainOpen(false)` line is already correct — keep it.

4. Inside the back face (`isFlipped` branch, `data-testid="flashcard-back"`), remove the entire `{item.flashcard_note !== null && (<>...</>)}` block (the button and inline panel). Replace the back face with just the text:

```tsx
<div data-testid="flashcard-back" className="flex flex-col flex-1 justify-center">
  <div className="flex-1 flex items-center justify-center">
    <p className="text-base text-gray-100 leading-relaxed text-center">
      {renderHighlighted(item.flashcard_back!, 'green')}
    </p>
  </div>
</div>
```

5. After the closing `</motion.div>` of the card (and before the spacer `<div className="h-8">`), add the explain button and sheet:

```tsx
{/* Explain button — below card, only on back face when note exists */}
{isFlipped && item.flashcard_note !== null && (
  <button
    onClick={e => { e.stopPropagation(); setIsExplainOpen(true) }}
    className="w-full max-w-sm py-2.5 text-sm text-indigo-400 bg-indigo-950/50 border border-indigo-900 rounded-xl mt-3"
  >
    Explain this →
  </button>
)}

{/* Bottom sheet */}
<ExplainSheet
  isOpen={isExplainOpen}
  onClose={() => setIsExplainOpen(false)}
  original={item.original}
  correction={item.correction ?? null}
  note={item.flashcard_note ?? ''}
/>
```

- [ ] **Step 4: Run all tests**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add components/FlashcardDeck.tsx __tests__/components/FlashcardDeck.test.tsx
git commit -m "feat: move explain button below card and open as bottom sheet"
```

---

## Task 4: Smoke test in the browser

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to `/flashcards` and verify**

Check:
- [ ] Card front shows, no explain button visible
- [ ] Tap card → flips to back, "Explain this →" button appears below the card
- [ ] Card with `flashcard_note: null` → back face shows no button
- [ ] Tap "Explain this →" → bottom sheet slides up with backdrop
- [ ] Sheet shows original → correction and note text
- [ ] Tap backdrop → sheet dismisses
- [ ] Drag sheet down → sheet dismisses
- [ ] Swipe card left → advances to next card, sheet is gone
- [ ] Tap card to flip back to front → sheet is gone, button is gone

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors.
