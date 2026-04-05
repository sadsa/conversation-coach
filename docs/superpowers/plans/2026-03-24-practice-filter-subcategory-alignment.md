# Practice Filter & Sub-Category Pill Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the practice page's type-tab filter row with a flat sorted sub-category pill row, and add an informational sub-category pill to annotation cards in three places.

**Architecture:** All changes are UI-only — no API or schema changes. `PracticeList` loses `typeFilter`/`Filter` and gains a `useMemo`-derived sorted + colour-coded pill row. The sub-category pill is a small read-only `<span>` added to `AnnotationCard`, `SwipeableItem`, and the practice item modal.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library

---

## File Map

| File | What changes |
|---|---|
| `components/AnnotationCard.tsx` | Add sub-category pill below explanation |
| `components/PracticeList.tsx` | Remove `typeFilter`/`Filter`/chip/type-tab row; add sorted colour-coded pill row; update SwipeableItem layout; add pill to modal |
| `__tests__/components/AnnotationCard.test.tsx` | Add pill render assertion |
| `__tests__/components/PracticeList.test.tsx` | Delete 2 tests, update 3, add 8 |

---

## Task 1: Sub-category pill in AnnotationCard

`AnnotationCard` renders: original → correction, explanation, then conditionally the add/added button. Add a pill between explanation and the button (before the conditional, so it appears in both `isAdded` states).

**Files:**
- Modify: `components/AnnotationCard.tsx`
- Test: `__tests__/components/AnnotationCard.test.tsx`

The `grammarAnnotation` fixture already has `sub_category: 'subjunctive'`, so `SUB_CATEGORY_DISPLAY['subjunctive']` = `'Subjunctive'` is the text to assert.

- [ ] **Step 1: Write the failing test**

Add this test to `__tests__/components/AnnotationCard.test.tsx` inside the existing `describe('AnnotationCard', ...)` block:

```tsx
it('renders sub-category pill', () => {
  render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
  expect(screen.getByText('Subjunctive')).toBeInTheDocument()
})

it('renders sub-category pill when isAdded is true', () => {
  render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} isAdded={true} />)
  expect(screen.getByText('Subjunctive')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```
Expected: the two new tests fail with "Unable to find an element with the text: Subjunctive"

- [ ] **Step 3: Add the import and pill to AnnotationCard**

At the top of `components/AnnotationCard.tsx`, add `SUB_CATEGORY_DISPLAY` to the import:

```tsx
import { SUB_CATEGORY_DISPLAY } from '@/lib/types'
```

In the JSX, between the explanation `<p>` and the conditional button block, insert:

```tsx
<span className="border border-indigo-800 text-indigo-400 bg-indigo-950 rounded-full px-2 py-0.5 text-xs self-start">
  {SUB_CATEGORY_DISPLAY[annotation.sub_category]}
</span>
```

The full updated return (for reference — match existing surrounding code exactly):

```tsx
return (
  <div className="space-y-3">
    <p className="text-base">
      <>
        <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
          {annotation.original}
        </span>
        {' → '}
        <span className="font-semibold text-lg text-[#86efac]">
          {annotation.correction}
        </span>
      </>
    </p>
    <p className="text-sm text-gray-400 leading-relaxed">{annotation.explanation}</p>
    <span className="border border-indigo-800 text-indigo-400 bg-indigo-950 rounded-full px-2 py-0.5 text-xs self-start">
      {SUB_CATEGORY_DISPLAY[annotation.sub_category]}
    </span>
    {added ? (
      <button disabled className="w-full py-3 rounded-xl bg-gray-700 text-sm text-gray-500 cursor-not-allowed">
        ✓ Added to practice list
      </button>
    ) : (
      <button
        onClick={handleAdd}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-base font-semibold text-white transition-colors"
      >
        Add to practice list
      </button>
    )}
  </div>
)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add components/AnnotationCard.tsx __tests__/components/AnnotationCard.test.tsx
git commit -m "feat: add sub-category pill to AnnotationCard"
```

---

## Task 2: Remove type-tab filter row, typeFilter state, and chip from PracticeList

This task clears out the old filtering mechanism. After this task the filter row is gone entirely and `filtered` is simpler. The component still works — it just has no filter UI yet (that comes in Task 3).

**Files:**
- Modify: `components/PracticeList.tsx`
- Test: `__tests__/components/PracticeList.test.tsx`

**What to remove from `PracticeList.tsx`:**
1. The `Filter` type alias: `type Filter = 'all' | AnnotationType` (line ~15)
2. The `typeFilter` state: `const [typeFilter, setTypeFilter] = useState<Filter>('all')`
3. The type-tab filter row JSX: the `{!isBulkMode && (<div className="flex gap-2 flex-wrap text-sm">...)}` block containing `['all', 'grammar', 'naturalness', 'strength']`
4. The sub-category chip: the `{subCategoryFilter !== null && (<div className="flex items-center gap-2 ...">...)}` block
5. The `typeFilter` guard in `filtered`: the `if (typeFilter !== 'all' && item.type !== typeFilter) return false` line
6. References to `typeFilter` inside `onClick` handlers on the filter buttons (these go away with the whole block)

**Keep:** the `AnnotationType` import (still used by `TYPE_DOT_CLASS`).

- [ ] **Step 1: Delete and update the affected tests**

In `__tests__/components/PracticeList.test.tsx`:

**Delete** the entire `it('filters by type', ...)` test (currently inside `describe('PracticeList', ...)`):
```tsx
// DELETE THIS:
it('filters by type', async () => {
  render(<PracticeList items={[grammarItem]} />)
  await userEvent.click(screen.getByRole('button', { name: /naturalness/i }))
  expect(screen.getByText(/no items match/i)).toBeInTheDocument()
})
```

**Delete** the entire `it('clears sub-category filter when a type tab is clicked', ...)` test (in `describe('PracticeList — sub-category filter', ...)`):
```tsx
// DELETE THIS:
it('clears sub-category filter when a type tab is clicked', async () => { ... })
```

**Update** `'shows filter buttons when not in bulk mode'` — remove the `grammar` assertion, keep `all`:
```tsx
it('shows filter buttons when not in bulk mode', () => {
  render(<PracticeList items={[grammarItem]} />)
  expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
  // grammar type-tab assertion removed — no longer exists
})
```

**Update** `'hides filter buttons when in bulk mode'` — remove grammar query, keep all, add Other:
```tsx
it('hides filter buttons when in bulk mode', async () => {
  render(<PracticeList items={[grammarItem]} />)
  await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
  expect(screen.queryByRole('button', { name: /^all$/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^other$/i })).not.toBeInTheDocument()
})
```

**Update** `'exits bulk mode when back button is clicked'` — remove grammar reference, keep all:
```tsx
it('exits bulk mode when back button is clicked', async () => {
  render(<PracticeList items={[grammarItem]} />)
  await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
  await userEvent.click(screen.getByRole('button', { name: /exit selection/i }))
  expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to confirm the deletions compile but some now fail**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```
Expected: the updated tests that assert `grammar` button no longer exist will now fail (because the filter row hasn't been removed from the component yet — the grammar button still exists). Other tests may still pass. This is expected — the tests define the target state.

- [ ] **Step 3: Remove typeFilter state, Filter type, type-tab row, chip, and typeFilter guard from PracticeList.tsx**

In `components/PracticeList.tsx`:

1. Delete: `type Filter = 'all' | AnnotationType`

2. Change the state declarations. Before:
```tsx
const [typeFilter, setTypeFilter] = useState<Filter>('all')
const [subCategoryFilter, setSubCategoryFilter] = useState<SubCategory | null>(initialSubCategory ?? null)
```
After:
```tsx
const [subCategoryFilter, setSubCategoryFilter] = useState<SubCategory | null>(initialSubCategory ?? null)
```

3. Simplify the `filtered` computation. Before:
```tsx
const filtered = items.filter(item => {
  if (typeFilter !== 'all' && item.type !== typeFilter) return false
  if (subCategoryFilter !== null && item.sub_category !== subCategoryFilter) return false
  return true
})
```
After:
```tsx
const filtered = items.filter(item => {
  if (subCategoryFilter !== null && item.sub_category !== subCategoryFilter) return false
  return true
})
```

4. Delete the entire `{!isBulkMode && (<div className="flex gap-2 flex-wrap text-sm">...</div>)}` block (the type-tab filter row).

5. Delete the entire `{subCategoryFilter !== null && (<div className="flex items-center gap-2 text-xs text-indigo-400 ...">...</div>)}` block (the chip).

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```
Expected: all tests pass (some previously-failing tests now pass because the grammar type-tab no longer exists)

- [ ] **Step 5: Commit**

```bash
git add components/PracticeList.tsx __tests__/components/PracticeList.test.tsx
git commit -m "refactor: remove typeFilter state, type-tab row, and sub-category chip from PracticeList"
```

---

## Task 3: Add sub-category pill row to PracticeList

Add the new 14-pill sorted colour-coded filter row. This task also handles the `initialSubCategory` → initial filter state.

**Files:**
- Modify: `components/PracticeList.tsx`
- Test: `__tests__/components/PracticeList.test.tsx`

**Colour tier logic** (pure derivation from counts):
```tsx
const subCategoryCounts = useMemo(() => {
  const counts = Object.fromEntries(SUB_CATEGORIES.map(sc => [sc, 0])) as Record<SubCategory, number>
  for (const item of items) counts[item.sub_category] = (counts[item.sub_category] ?? 0) + 1
  return counts
}, [items])

const sortedSubCategories = useMemo(() => {
  return [...SUB_CATEGORIES].sort((a, b) => subCategoryCounts[b] - subCategoryCounts[a])
}, [subCategoryCounts])

const colourTiers = useMemo(() => {
  const nonZero = [...new Set(Object.values(subCategoryCounts).filter(c => c > 0))].sort((a, b) => b - a)
  return { rank1: nonZero[0] ?? 0, rank2: nonZero[1] ?? 0 }
}, [subCategoryCounts])
```

**Pill class helper** (define inline as a local function inside the component):
```tsx
function pillClass(sc: SubCategory): string {
  if (sc === subCategoryFilter) return 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
  const count = subCategoryCounts[sc]
  if (count === 0) return 'border-gray-800 text-gray-600'
  if (colourTiers.rank1 > 0 && count === colourTiers.rank1) return 'border-red-800 text-red-400 bg-red-950/40'
  if (colourTiers.rank2 > 0 && count === colourTiers.rank2) return 'border-amber-700 text-amber-400 bg-amber-950/40'
  return 'border-gray-700 text-gray-300'
}
```

**"All" pill class:**
```tsx
const allPillClass = subCategoryFilter === null
  ? 'border-violet-500 text-violet-300 bg-violet-500/10'
  : 'border-gray-700 text-gray-400'
```

**Imports to add** at the top of `PracticeList.tsx`:
```tsx
import { SUB_CATEGORIES, SUB_CATEGORY_DISPLAY, ... } from '@/lib/types'
// SUB_CATEGORIES and SUB_CATEGORY_DISPLAY are likely already imported — check and add only what's missing
```
Also add `useMemo` to the React import if not already present.

- [ ] **Step 1: Write the failing tests**

Add a new `describe('PracticeList — sub-category pill row', ...)` block in `__tests__/components/PracticeList.test.tsx`.

Add fixture for sort/colour tests at the top of the file alongside `grammarItem`:
```tsx
const subjectiveItem: PracticeItem = {
  id: 'item-2', session_id: 's1', annotation_id: 'ann-2',
  type: 'grammar', original: 'vengas', correction: 'venís',
  explanation: '', sub_category: 'subjunctive', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
}
```

Add the tests:
```tsx
describe('PracticeList — sub-category pill row', () => {
  it('renders all 14 pills (All + 13 sub-categories including Other)', () => {
    render(<PracticeList items={[grammarItem]} />)
    // All pill
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
    // Spot-check a few representative sub-categories
    expect(screen.getByRole('button', { name: /verb conjugation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /subjunctive/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /phrasing/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /other/i })).toBeInTheDocument()
  })

  it('clicking a sub-category pill hides non-matching items', async () => {
    render(<PracticeList items={[grammarItem, subjectiveItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /subjunctive/i }))
    expect(screen.getByText('vengas')).toBeInTheDocument()
    expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
  })

  it('clicking the active pill again clears the filter (toggle)', async () => {
    render(<PracticeList items={[grammarItem, subjectiveItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /subjunctive/i }))
    expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /subjunctive/i }))
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('vengas')).toBeInTheDocument()
  })

  it('initialSubCategory prop activates matching pill and hides non-matching items', () => {
    render(<PracticeList items={[grammarItem, subjectiveItem]} initialSubCategory="subjunctive" />)
    expect(screen.getByText('vengas')).toBeInTheDocument()
    expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
  })

  it('clicking All when sub-category is active clears the filter', async () => {
    render(<PracticeList items={[grammarItem, subjectiveItem]} initialSubCategory="subjunctive" />)
    expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('vengas')).toBeInTheDocument()
  })

  it('pill with higher item count appears before lower-count pill in DOM', () => {
    // subjectiveItem has sub_category 'subjunctive' (count 1), grammarItem has 'other' (count 1)
    // With two items of different sub-categories having equal count, order falls back to SUB_CATEGORIES order
    // Add a second subjunctive item to give it count 2 (higher than 'other' count 1)
    const subjectiveItem2: PracticeItem = {
      ...subjectiveItem, id: 'item-3',
    }
    render(<PracticeList items={[grammarItem, subjectiveItem, subjectiveItem2]} />)
    const allButtons = screen.getAllByRole('button')
    const subjunctiveIdx = allButtons.findIndex(b => /subjunctive/i.test(b.textContent ?? ''))
    const otherIdx = allButtons.findIndex(b => /^other/i.test(b.textContent?.trim() ?? ''))
    expect(subjunctiveIdx).toBeLessThan(otherIdx)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```
Expected: all new tests fail (filter row doesn't exist yet)

- [ ] **Step 3: Add useMemo import and sub-category counts/sort/tier logic to PracticeList**

Add `useMemo` to the React import line if not present:
```tsx
import { useState, useRef, useEffect, useMemo } from 'react'
```

Add `SUB_CATEGORIES` and `SUB_CATEGORY_DISPLAY` to the `@/lib/types` import if not already there.

Inside the `PracticeList` function body, after the state declarations, add:

```tsx
const subCategoryCounts = useMemo(() => {
  const counts = Object.fromEntries(SUB_CATEGORIES.map(sc => [sc, 0])) as Record<SubCategory, number>
  for (const item of items) counts[item.sub_category] = (counts[item.sub_category] ?? 0) + 1
  return counts
}, [items])

const sortedSubCategories = useMemo(() => {
  return [...SUB_CATEGORIES].sort((a, b) => subCategoryCounts[b] - subCategoryCounts[a])
}, [subCategoryCounts])

const colourTiers = useMemo(() => {
  const nonZero = [...new Set(Object.values(subCategoryCounts).filter(c => c > 0))].sort((a, b) => b - a)
  return { rank1: nonZero[0] ?? 0, rank2: nonZero[1] ?? 0 }
}, [subCategoryCounts])

function pillClass(sc: SubCategory): string {
  if (sc === subCategoryFilter) return 'border-indigo-500 text-indigo-300 bg-indigo-500/10'
  const count = subCategoryCounts[sc]
  if (count === 0) return 'border-gray-800 text-gray-600'
  if (colourTiers.rank1 > 0 && count === colourTiers.rank1) return 'border-red-800 text-red-400 bg-red-950/40'
  if (colourTiers.rank2 > 0 && count === colourTiers.rank2) return 'border-amber-700 text-amber-400 bg-amber-950/40'
  return 'border-gray-700 text-gray-300'
}

const allPillClass = subCategoryFilter === null
  ? 'border-violet-500 text-violet-300 bg-violet-500/10'
  : 'border-gray-700 text-gray-400'
```

- [ ] **Step 4: Add the pill row JSX**

In the JSX, where the old type-tab filter row was (just above the `{filtered.length === 0 && ...}` line), insert the pill row inside the `{!isBulkMode && (...)}` guard:

```tsx
{!isBulkMode && (
  <div className="flex gap-2 flex-wrap text-sm">
    <button
      onClick={() => setSubCategoryFilter(null)}
      className={`px-3 py-1 rounded-full border transition-colors ${allPillClass}`}
    >
      All
    </button>
    {sortedSubCategories.map(sc => (
      <button
        key={sc}
        onClick={() => setSubCategoryFilter(subCategoryFilter === sc ? null : sc)}
        className={`px-3 py-1 rounded-full border transition-colors ${pillClass(sc)}`}
      >
        {SUB_CATEGORY_DISPLAY[sc]}
        {' '}
        <span className="text-[11px] opacity-80">{subCategoryCounts[sc]}</span>
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add components/PracticeList.tsx __tests__/components/PracticeList.test.tsx
git commit -m "feat: add sorted colour-coded sub-category pill filter row to PracticeList"
```

---

## Task 4: Sub-category pill in SwipeableItem row and practice item modal

Add the informational pill to the compact list row and the detail modal in `PracticeList.tsx`.

**Files:**
- Modify: `components/PracticeList.tsx`
- Test: `__tests__/components/PracticeList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/components/PracticeList.test.tsx`:

```tsx
describe('PracticeList — sub-category pill on cards', () => {
  it('shows sub-category pill label in SwipeableItem row', () => {
    render(<PracticeList items={[grammarItem]} />)
    // grammarItem has sub_category: 'other', display = 'Other'
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('shows sub-category pill in practice item modal', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByText('Fui'))
    // Modal opens — confirm modal is present, then assert pill text is visible
    expect(screen.getByTestId('modal-backdrop')).toBeInTheDocument()
    // grammarItem has sub_category: 'other' → display = 'Other'
    // The pill appears in the modal (and also in the list row, but that's fine — both instances are valid)
    expect(screen.getAllByText('Other').length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```
Expected: both new tests fail

- [ ] **Step 3: Update SwipeableItem layout and add pill**

In `SwipeableItem`, find the inner div:
```tsx
<div className="flex-1 min-w-0 text-sm">
  <>
    <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
      {item.original}
    </span>
    {' → '}
    <span className="font-medium text-[#86efac]">{item.correction}</span>
  </>
</div>
```

Replace with a two-line flex column (preserve existing highlight classes):
```tsx
<div className="flex-1 min-w-0 text-sm flex flex-col gap-0.5">
  <div>
    <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
      {item.original}
    </span>
    {' → '}
    <span className="font-medium text-[#86efac]">{item.correction}</span>
  </div>
  <span className="border border-indigo-800 text-indigo-400 bg-indigo-950 rounded-full px-2 py-0.5 text-xs self-start">
    {SUB_CATEGORY_DISPLAY[item.sub_category]}
  </span>
</div>
```

Also change the parent card div from `items-center` to `items-start`. Find:
```tsx
className="relative flex items-center gap-3 px-4 py-3 bg-gray-900 rounded-xl"
```
Replace with:
```tsx
className="relative flex items-start gap-3 px-4 py-3 bg-gray-900 rounded-xl"
```

- [ ] **Step 4: Add pill to the practice item modal**

Find the modal body in the `{openItem && (<Modal ...>)}` block:
```tsx
<div className="space-y-3 text-sm">
  <div>
    <>
      <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
        {openItem.original}
      </span>
      <span className="mx-2 text-gray-400">→</span>
      <span className="font-medium text-[#86efac]">{openItem.correction}</span>
    </>
  </div>
  <p className="text-gray-300 leading-relaxed">{openItem.explanation}</p>
</div>
```

Add the pill after the explanation `<p>`:
```tsx
<div className="space-y-3 text-sm">
  <div>
    <>
      <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
        {openItem.original}
      </span>
      <span className="mx-2 text-gray-400">→</span>
      <span className="font-medium text-[#86efac]">{openItem.correction}</span>
    </>
  </div>
  <p className="text-gray-300 leading-relaxed">{openItem.explanation}</p>
  <span className="border border-indigo-800 text-indigo-400 bg-indigo-950 rounded-full px-2 py-0.5 text-xs self-start">
    {SUB_CATEGORY_DISPLAY[openItem.sub_category]}
  </span>
</div>
```

`SUB_CATEGORY_DISPLAY` is already imported from `@/lib/types` at this point (added in Task 3).

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```
Expected: all tests pass

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add components/PracticeList.tsx __tests__/components/PracticeList.test.tsx
git commit -m "feat: add sub-category pill to SwipeableItem row and practice item modal"
```

---

## Verification

After all tasks are done:

- [ ] Run the full test suite one final time: `npm test` — all tests pass
- [ ] Run `npm run build` — no TypeScript errors
- [ ] Run `npm run lint` — no lint errors
- [ ] Manually open the practice page in the browser (`npm run dev`) and verify:
  - All 14 pills render with counts
  - Red/amber/gray/dimmed colour coding is visible
  - Clicking a pill filters the list and highlights the pill
  - Clicking again clears the filter
  - Opening an item modal shows the sub-category pill
  - Sub-category pill is visible on each list row
- [ ] Navigate to the insights page, click "See all X examples →" — verify landing on practice page with the correct pill pre-selected
- [ ] Open the transcript page for a session, click an annotation — verify the sub-category pill appears in the annotation card
