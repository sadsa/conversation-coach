# Flashcard Error Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Explain this" button with a tappable green phrase on the flashcard back face that opens the ExplainSheet directly.

**Architecture:** Extend `renderHighlighted` with an optional `onClick` param; pass a handler on the back face only. Remove the Explain button. Add a hint line inside the card. Update `ExplainSheet` to hide the note section when no note is present.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Vitest + React Testing Library, Framer Motion

---

### Task 1: ExplainSheet — hide note section when empty

**Files:**
- Modify: `components/ExplainSheet.tsx`
- Test: `__tests__/components/ExplainSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('ExplainSheet', ...)` block in `__tests__/components/ExplainSheet.test.tsx`, after the existing `'displays the note text'` test:

```typescript
it('hides divider and note when note is empty', () => {
  render(<ExplainSheet {...defaultProps} note="" />)
  expect(screen.queryByText(/"Te elimina" sounds like a direct translation/)).not.toBeInTheDocument()
  expect(screen.queryByRole('separator')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/components/ExplainSheet.test.tsx
```

Expected: FAIL — `queryByText` and `queryByRole('separator')` assertions fail because the elements currently render unconditionally.

- [ ] **Step 3: Update ExplainSheet to conditionally render divider and note**

In `components/ExplainSheet.tsx`, replace:

```typescript
            {/* Divider */}
            <hr className="border-indigo-900/40 mb-4" />

            {/* Note */}
            <p className="text-sm text-gray-400 leading-relaxed">{note}</p>
```

with:

```typescript
            {/* Divider + Note — hidden when no note */}
            {note && (
              <>
                <hr className="border-indigo-900/40 mb-4" />
                <p className="text-sm text-gray-400 leading-relaxed">{note}</p>
              </>
            )}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/components/ExplainSheet.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ExplainSheet.tsx __tests__/components/ExplainSheet.test.tsx
git commit -m "feat: hide divider and note in ExplainSheet when note is empty"
```

---

### Task 2: Add `flashcard.tapToExplain` translation key

**Files:**
- Modify: `lib/i18n.ts`

- [ ] **Step 1: Add key to both locales**

In `lib/i18n.ts`, in the English locale (around line 119), replace:

```typescript
    'flashcard.explainThis': 'Explain this →',
```

with:

```typescript
    'flashcard.explainThis': 'Explain this →',
    'flashcard.tapToExplain': 'tap green to explain',
```

In the Spanish locale (around line 284), replace:

```typescript
    'flashcard.explainThis': 'Explicar esto →',
```

with:

```typescript
    'flashcard.explainThis': 'Explicar esto →',
    'flashcard.tapToExplain': 'toca el verde para explicar',
```

- [ ] **Step 2: Run tests to confirm no regressions**

```bash
npm test -- __tests__/lib/i18n.test.ts
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/i18n.ts
git commit -m "feat: add flashcard.tapToExplain translation key"
```

---

### Task 3: Update FlashcardDeck — tappable phrase, remove button, add hint

**Files:**
- Modify: `components/FlashcardDeck.tsx`
- Test: `__tests__/components/FlashcardDeck.test.tsx`

- [ ] **Step 1: Replace the "explain button" describe block with new tests**

In `__tests__/components/FlashcardDeck.test.tsx`, replace the entire `describe('FlashcardDeck — explain button', ...)` block (lines 75–147) with:

```typescript
describe('FlashcardDeck — tappable phrase', () => {
  it('does not show the explain button on any face', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.queryByRole('button', { name: /explain this/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByRole('button', { name: /explain this/i })).not.toBeInTheDocument()
  })

  it('shows "tap green to explain" hint on back face', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByText(/tap green to explain/i)).toBeInTheDocument()
  })

  it('does not show hint on front face', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.queryByText(/tap green to explain/i)).not.toBeInTheDocument()
  })

  it('opens explain sheet when green phrase is tapped', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    expect(screen.getByTestId('explain-sheet')).toBeInTheDocument()
  })

  it('opens explain sheet when flashcard_note is null', async () => {
    const item = { ...baseItem, flashcard_note: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    expect(screen.getByTestId('explain-sheet')).toBeInTheDocument()
  })

  it('shows original and correction inside sheet', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    expect(screen.getByText('te elimina')).toBeInTheDocument()
    expect(screen.getAllByText('se te lleva').length).toBeGreaterThan(0)
    expect(screen.getByText(/"Te elimina" sounds like a direct translation/)).toBeInTheDocument()
  })

  it('shows — in sheet when correction is null', async () => {
    const item = { ...baseItem, correction: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('closes sheet when backdrop is clicked', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
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
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    expect(screen.getByTestId('explain-sheet')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('advance-card'))
    expect(screen.queryByTestId('explain-sheet')).not.toBeInTheDocument()
  })

  it('resets sheet when flipping card back to front', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByTestId('explain-sheet')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: Multiple FAIL — `flashcard-back-phrase` not found, hint text not found, explain button tests now gone.

- [ ] **Step 3: Update `renderHighlighted` to accept an optional `onClick`**

In `components/FlashcardDeck.tsx`, replace the `renderHighlighted` function (lines 9–22):

```typescript
function renderHighlighted(text: string, colour: 'purple' | 'green', onClick?: () => void): React.ReactNode {
  const parts = text.split(/\[\[|\]\]/)
  if (parts.length < 3) return <>{text}</>
  const cls = colour === 'purple'
    ? 'text-violet-300 bg-violet-500/20 rounded px-1'
    : 'text-green-300 bg-green-500/20 rounded px-1'
  const interactiveCls = onClick ? ' border-b border-dashed border-green-400 cursor-pointer' : ''
  return (
    <>
      {parts[0]}
      <span
        className={cls + interactiveCls}
        {...(onClick ? {
          'data-testid': 'flashcard-back-phrase',
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); onClick() },
        } : {})}
      >
        {parts[1]}
      </span>
      {parts.slice(2).join('')}
    </>
  )
}
```

- [ ] **Step 4: Update the back face — pass onClick, remove button, add hint, fix isExplainOpen**

In `components/FlashcardDeck.tsx`, replace the back face block and everything below it up to the `ExplainSheet` closing tag. That is, replace from the back-face `div` through to the closing of the "Explain button" block and the `ExplainSheet` usage:

Replace:

```typescript
        ) : (
          <div data-testid="flashcard-back" className="flex flex-col flex-1 justify-center">
            <div className="flex-1 flex items-center justify-center">
              <p className="text-base text-gray-100 leading-relaxed text-center">
                {renderHighlighted(item.flashcard_back!, 'green')}
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Explain button — below card, only on back face when note exists */}
      {isFlipped && item.flashcard_note !== null && (
        <button
          onClick={e => { e.stopPropagation(); setIsExplainOpen(true) }}
          className="w-full max-w-sm py-2.5 text-sm text-indigo-400 bg-indigo-950/50 border border-indigo-900 rounded-xl mt-3"
        >
          {t('flashcard.explainThis')}
        </button>
      )}

      {/* Bottom sheet */}
      <ExplainSheet
        isOpen={isExplainOpen && item.flashcard_note !== null}
        onClose={() => setIsExplainOpen(false)}
        original={item.original}
        correction={item.correction ?? null}
        note={item.flashcard_note ?? ''}
      />
```

with:

```typescript
        ) : (
          <div data-testid="flashcard-back" className="flex flex-col flex-1 justify-between">
            <div className="flex-1 flex items-center justify-center">
              <p className="text-base text-gray-100 leading-relaxed text-center">
                {renderHighlighted(item.flashcard_back!, 'green', () => setIsExplainOpen(true))}
              </p>
            </div>
            <p className="text-xs text-gray-600 text-center mt-4">{t('flashcard.tapToExplain')}</p>
          </div>
        )}
      </motion.div>

      {/* Bottom sheet */}
      <ExplainSheet
        isOpen={isExplainOpen}
        onClose={() => setIsExplainOpen(false)}
        original={item.original}
        correction={item.correction ?? null}
        note={item.flashcard_note ?? ''}
      />
```

- [ ] **Step 5: Run all tests to verify they pass**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 6: Run the full test suite to catch regressions**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add components/FlashcardDeck.tsx __tests__/components/FlashcardDeck.test.tsx
git commit -m "feat: replace Explain button with tappable green phrase on flashcard back"
```
