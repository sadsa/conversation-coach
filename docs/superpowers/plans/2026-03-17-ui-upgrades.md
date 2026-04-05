# UI Upgrades Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the original phrase alongside the correction in the annotation card popup, and remove the misleading single-speaker warning from the transcript page.

**Architecture:** Two independent, surgical changes — one JSX block replacement in `AnnotationCard`, one conditional block deletion in the transcript page. No new files, no data model changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-03-17-ui-upgrades-design.md`

---

## Chunk 1: Show original phrase in AnnotationCard

### Task 1: Update AnnotationCard to show original → correction

**Files:**
- Modify: `components/AnnotationCard.tsx:53-59`
- Modify: `__tests__/components/AnnotationCard.test.tsx:31-35`

- [ ] **Step 1: Update the failing test**

Open `__tests__/components/AnnotationCard.test.tsx`. In the `'renders correction for grammar annotation'` test, add an assertion for the original phrase immediately after the existing `getByText('Fui')` assertion:

```ts
it('renders correction for grammar annotation', () => {
  render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
  expect(screen.getByText('Fui')).toBeInTheDocument()
  expect(screen.getByText('Yo fui')).toBeInTheDocument()   // ← add this line
  expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```

Expected: FAIL — `Unable to find an element with the text: 'Yo fui'`

- [ ] **Step 3: Replace the `<p>` block in AnnotationCard**

Open `components/AnnotationCard.tsx`. Replace lines 53–59 (the entire `<p>...</p>` block that currently renders only the correction) with:

```tsx
<p>
  {annotation.correction ? (
    <>
      <span className="line-through text-gray-500">{annotation.original}</span>
      {' → '}
      <span className="font-medium">{annotation.correction}</span>
    </>
  ) : (
    <span className="text-green-300">Keep this! &ldquo;{annotation.original}&rdquo;</span>
  )}
</p>
```

The block being replaced currently looks like:

```tsx
<p>
  {annotation.correction ? (
    <span className="font-medium">{annotation.correction}</span>
  ) : (
    <span className="text-green-300">Keep this! &ldquo;{annotation.original}&rdquo;</span>
  )}
</p>
```

- [ ] **Step 4: Run all AnnotationCard tests to confirm they pass**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/AnnotationCard.tsx __tests__/components/AnnotationCard.test.tsx
git commit -m "feat: show original phrase alongside correction in AnnotationCard"
```

---

## Chunk 2: Remove single-speaker warning

### Task 2: Delete the single-speaker warning from the transcript page

**Files:**
- Modify: `app/sessions/[id]/page.tsx:70-74`

No new tests needed — there is no test file for `TranscriptPage` and this is a straight deletion of dead UI.

- [ ] **Step 1: Delete the warning block**

Open `app/sessions/[id]/page.tsx`. Remove lines 70–74 entirely:

```tsx
{session.detected_speaker_count === 1 && (
  <div className="border border-yellow-700 bg-yellow-900/20 rounded-lg px-4 py-3 text-sm text-yellow-300">
    Couldn&apos;t distinguish two speakers — try a higher quality recording.
  </div>
)}
```

After deletion, the `<TranscriptView ...` call (previously line 76) should follow directly after the closing `</div>` of the title/meta block.

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add app/sessions/[id]/page.tsx
git commit -m "fix: remove misleading single-speaker warning from transcript page"
```
