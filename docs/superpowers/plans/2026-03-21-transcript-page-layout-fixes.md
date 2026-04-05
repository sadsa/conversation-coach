# Transcript Page Layout Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix horizontal overflow and broken bottom-nav fixed positioning on the transcript page, and remove the non-functional annotation filter bar.

**Architecture:** Three targeted edits across two component files and one page file. No new files. The root cause is content escaping its flex container — fixing that restores `overflow-x: hidden` on `<body>`, which in turn fixes iOS Safari's `position: fixed` behaviour on `BottomNav`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library

---

## File Map

| File | Change |
|---|---|
| `components/InlineEdit.tsx` | Remove hardcoded `truncate` from the span — let callers control truncation via `className` |
| `components/TranscriptView.tsx` | Add `break-words` to segment span; remove `Filter` type, `filter` state, `counts`, filter bar JSX, and filter guard in click handler |
| `app/sessions/[id]/page.tsx` | Add `min-w-0` to title flex child; add `break-words` to `InlineEdit` className |
| `__tests__/components/TranscriptView.test.tsx` | Remove the filter-button test; update annotation-click test to confirm it always opens the modal |

---

## Task 1: Make `InlineEdit` truncation opt-in

**Context:** `InlineEdit` currently hardcodes `truncate` (= `overflow-hidden whitespace-nowrap text-ellipsis`) on its display span. This prevents the transcript page title from wrapping. `SessionList` already passes `truncate` explicitly in its `className` prop, so removing it from the built-in classes loses nothing.

**Files:**
- Modify: `components/InlineEdit.tsx:34`

- [ ] **Step 1: Remove `truncate` from the display span's built-in class string**

In `components/InlineEdit.tsx`, change line 34 from:
```tsx
className={`cursor-pointer hover:underline decoration-dotted min-w-0 truncate ${className}`}
```
to:
```tsx
className={`cursor-pointer hover:underline decoration-dotted min-w-0 ${className}`}
```

- [ ] **Step 2: Run tests to confirm nothing broke**

```bash
npm test -- __tests__/components
```

Expected: all passing (SessionList still truncates via its own `className` prop).

- [ ] **Step 3: Commit**

```bash
git add components/InlineEdit.tsx
git commit -m "fix: remove hardcoded truncate from InlineEdit, let callers control it"
```

---

## Task 2: Fix transcript page header overflow

**Context:** The page header is a flex row: title div on the left, Re-analyse button on the right. Without `min-w-0` on the left div, flex won't shrink it below its natural content width, so long titles overflow. Adding `break-words` to the `InlineEdit` makes the title wrap rather than spill out.

**Files:**
- Modify: `app/sessions/[id]/page.tsx:55-57`

- [ ] **Step 1: Add `min-w-0` to the title wrapper div and `break-words` to `InlineEdit`**

In `app/sessions/[id]/page.tsx`, change lines 55–57 from:
```tsx
<div className="flex items-start justify-between gap-4">
  <div>
    <InlineEdit value={title} onSave={handleRename} className="text-xl font-bold" />
```
to:
```tsx
<div className="flex items-start justify-between gap-4">
  <div className="min-w-0">
    <InlineEdit value={title} onSave={handleRename} className="text-xl font-bold break-words" />
```

- [ ] **Step 2: Run tests**

```bash
npm test -- __tests__/pages
```

Expected: all passing (no test covers this exact markup, but the page should still render without errors).

- [ ] **Step 3: Commit**

```bash
git add app/sessions/[id]/page.tsx
git commit -m "fix: prevent long session titles from overflowing flex container on transcript page"
```

---

## Task 3: Fix transcript segment text overflow

**Context:** Transcript segments can contain long Spanish words with no spaces (e.g., compound verbs). Without `break-words` (`overflow-wrap: break-word`), these push past the container edge. The class is inherited by child `<span>` and `<mark>` elements rendered inside `AnnotatedText`.

**Files:**
- Modify: `components/TranscriptView.tsx:63`

- [ ] **Step 1: Add `break-words` to the segment text span**

In `components/TranscriptView.tsx`, change line 63 from:
```tsx
<span className="text-sm leading-relaxed">
```
to:
```tsx
<span className="text-sm leading-relaxed break-words">
```

- [ ] **Step 2: Run tests**

```bash
npm test -- __tests__/components/TranscriptView.test.tsx
```

Expected: all existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add components/TranscriptView.tsx
git commit -m "fix: add break-words to transcript segments to prevent long-word horizontal overflow"
```

---

## Task 4: Remove non-functional filter bar from `TranscriptView`

**Context:** The filter bar (All / Grammar / Naturalness / Strengths) sets `filter` state, but all it does is gate whether clicking a highlight opens the modal — it does not visually filter or highlight anything. It is misleading to users and should be removed entirely. The `counts` object is only used by the filter bar, so it becomes dead code once the bar is gone.

One existing test exercises the filter buttons ("filters annotations by type") — that test must be removed. The annotation-click test must also be updated to confirm the modal opens unconditionally (no filter guard).

**Files:**
- Modify: `components/TranscriptView.tsx`
- Modify: `__tests__/components/TranscriptView.test.tsx`

- [ ] **Step 1: Update the test file first — remove filter test, confirm modal opens unconditionally**

In `__tests__/components/TranscriptView.test.tsx`, remove the entire test at lines 58–64:
```tsx
it('filters annotations by type', async () => {
  render(
    <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
  )
  await userEvent.click(screen.getByRole('button', { name: /natural/i }))
  expect(screen.queryByText('Yo fui')).toBeTruthy()
})
```

The existing "shows modal with annotation content when highlight is clicked" test at lines 37–46 already covers the unconditional click behaviour — no changes needed there.

- [ ] **Step 2: Run tests to confirm the filter test is gone and other tests still pass**

```bash
npm test -- __tests__/components/TranscriptView.test.tsx
```

Expected: 3 tests pass (the filter test is gone, the other 3 remain).

- [ ] **Step 3: Remove filter code from `TranscriptView`**

In `components/TranscriptView.tsx`, make the following changes:

**Remove the `Filter` type (line 9):**
```tsx
// DELETE this line:
type Filter = 'all' | 'grammar' | 'naturalness' | 'strength'
```

**Remove the `filter` state (line 22):**
```tsx
// DELETE this line:
const [filter, setFilter] = useState<Filter>('all')
```

**Remove the `counts` object (lines 30–31):**
```tsx
// DELETE these two lines:
const counts = { grammar: 0, naturalness: 0, strength: 0 }
annotations.forEach(a => counts[a.type]++)
```

**Remove the filter bar JSX (lines 35–50 in the original, the `<div className="flex gap-2...">` block):**
```tsx
// DELETE this entire block:
{/* Filter bar */}
<div className="flex gap-2 text-sm flex-wrap">
  {(['all', 'grammar', 'naturalness', 'strength'] as Filter[]).map(f => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      className={`px-3 py-1 rounded-full border transition-colors ${
        filter === f
          ? 'border-violet-500 text-violet-300 bg-violet-500/10'
          : 'border-gray-700 text-gray-400 hover:border-gray-500'
      }`}
    >
      {f === 'all' ? 'All' : f === 'grammar' ? `🔴 Grammar (${counts.grammar})` : f === 'naturalness' ? `🟡 Natural (${counts.naturalness})` : `🟢 Strengths (${counts.strength})`}
    </button>
  ))}
</div>
```

**Remove the `filter` guard in `onAnnotationClick` — the click should always open the modal:**
```tsx
// BEFORE:
onAnnotationClick={a => {
  if (filter === 'all' || a.type === filter) {
    setActiveAnnotation(activeAnnotation?.id === a.id ? null : a)
  }
}}

// AFTER:
onAnnotationClick={a => {
  setActiveAnnotation(activeAnnotation?.id === a.id ? null : a)
}}
```

Also remove the now-unused `useState` import for `filter` — `useState` is still needed for `activeAnnotation`, so keep the import but verify it still references only `activeAnnotation`.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests pass with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add components/TranscriptView.tsx __tests__/components/TranscriptView.test.tsx
git commit -m "fix: remove non-functional annotation filter bar from TranscriptView"
```
