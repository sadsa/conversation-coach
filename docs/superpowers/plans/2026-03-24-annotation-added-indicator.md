# Annotation Added Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a green ✓ badge + fade on transcript annotations that have already been added to the practice list.

**Architecture:** Thread `addedAnnotationIds` one level deeper from `TranscriptView` into `AnnotatedText`. `AnnotatedText` renders a positioned wrapper `<span>` + badge only for annotations in the set; all other marks are unchanged.

**Tech Stack:** Next.js 14, React, TypeScript, Tailwind CSS, Vitest + React Testing Library

---

## File Map

| File | Change |
|------|--------|
| `components/AnnotatedText.tsx` | Add `addedAnnotationIds?: Set<string>` prop; wrap added marks in a positioned `<span>` with a `✓` badge and apply `opacity-[0.45]` to the `<mark>` |
| `components/TranscriptView.tsx` | Pass `addedAnnotationIds={addedAnnotationIds}` to `<AnnotatedText>` |
| `__tests__/components/AnnotatedText.test.tsx` | Add tests for badge presence, opacity, and continued clickability when annotation is added |
| `__tests__/components/TranscriptView.test.tsx` | Add test that badge appears when `addedAnnotationIds` contains the annotation id |

---

## Task 1: Update `AnnotatedText` to show the added indicator

**Files:**
- Modify: `components/AnnotatedText.tsx`
- Test: `__tests__/components/AnnotatedText.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these three test cases to `__tests__/components/AnnotatedText.test.tsx` (after the existing tests):

```tsx
it('shows the added badge when the annotation is in addedAnnotationIds', () => {
  render(
    <AnnotatedText
      text={text}
      annotations={annotations}
      onAnnotationClick={() => {}}
      addedAnnotationIds={new Set(['ann-1'])}
    />
  )
  expect(screen.getByTestId('annotation-added-badge')).toBeInTheDocument()
})

it('does not show the added badge when addedAnnotationIds is empty', () => {
  render(
    <AnnotatedText
      text={text}
      annotations={annotations}
      onAnnotationClick={() => {}}
      addedAnnotationIds={new Set()}
    />
  )
  expect(screen.queryByTestId('annotation-added-badge')).not.toBeInTheDocument()
})

it('still calls onAnnotationClick when an added annotation mark is clicked', async () => {
  const onClick = vi.fn()
  render(
    <AnnotatedText
      text={text}
      annotations={annotations}
      onAnnotationClick={onClick}
      addedAnnotationIds={new Set(['ann-1'])}
    />
  )
  await userEvent.click(screen.getByText('Yo fui'))
  expect(onClick).toHaveBeenCalledWith(annotations[0])
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/components/AnnotatedText.test.tsx
```

Expected: the three new tests fail (badge not found / prop not accepted).

- [ ] **Step 3: Implement the changes in `AnnotatedText.tsx`**

Replace the entire file with:

```tsx
// components/AnnotatedText.tsx
import type { Annotation } from '@/lib/types'

const TYPE_CLASS: Record<string, string> = {
  grammar:     'bg-[#3b1a1a] text-[#fca5a5] decoration-[#f87171]',
  naturalness: 'bg-[#3b2e0a] text-[#fde68a] decoration-[#fbbf24]',
}

interface Props {
  text: string
  annotations: Annotation[]
  onAnnotationClick: (annotation: Annotation) => void
  addedAnnotationIds?: Set<string>
}

interface Span {
  start: number
  end: number
  annotation?: Annotation
}

function buildSpans(text: string, annotations: Annotation[]): Span[] {
  // Sort annotations by start_char
  const sorted = [...annotations].sort((a, b) => a.start_char - b.start_char)
  const spans: Span[] = []
  let cursor = 0

  for (const ann of sorted) {
    if (ann.start_char > cursor) {
      spans.push({ start: cursor, end: ann.start_char })
    }
    spans.push({ start: ann.start_char, end: ann.end_char, annotation: ann })
    cursor = ann.end_char
  }

  if (cursor < text.length) {
    spans.push({ start: cursor, end: text.length })
  }

  return spans
}

export function AnnotatedText({ text, annotations, onAnnotationClick, addedAnnotationIds = new Set() }: Props) {
  const spans = buildSpans(text, annotations)

  return (
    <span>
      {spans.map((span, i) => {
        const slice = text.slice(span.start, span.end)
        if (span.annotation) {
          const cls = TYPE_CLASS[span.annotation.type] ?? ''
          const isAdded = addedAnnotationIds.has(span.annotation.id)

          const mark = (
            <mark
              key={isAdded ? undefined : i}
              className={`underline decoration-2 cursor-pointer rounded-sm px-1 ${cls}${isAdded ? ' opacity-[0.45]' : ''}`}
              onClick={() => onAnnotationClick(span.annotation!)}
            >
              {slice}
            </mark>
          )

          if (isAdded) {
            return (
              <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
                {mark}
                <span
                  data-testid="annotation-added-badge"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    width: '14px',
                    height: '14px',
                    pointerEvents: 'none',
                    fontSize: '8px',
                    lineHeight: 1,
                  }}
                  className="bg-green-500 rounded-full border-2 border-[#111827] flex items-center justify-center text-white"
                >
                  ✓
                </span>
              </span>
            )
          }

          return (
            <mark
              key={i}
              className={`underline decoration-2 cursor-pointer rounded-sm px-1 ${cls}`}
              onClick={() => onAnnotationClick(span.annotation!)}
            >
              {slice}
            </mark>
          )
        }
        return <span key={i}>{slice}</span>
      })}
    </span>
  )
}
```

- [ ] **Step 4: Run all AnnotatedText tests to verify they pass**

```bash
npm test -- __tests__/components/AnnotatedText.test.tsx
```

Expected: all 8 tests pass (5 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add components/AnnotatedText.tsx __tests__/components/AnnotatedText.test.tsx
git commit -m "feat: show added-to-practice badge on annotated text highlights"
```

---

## Task 2: Thread `addedAnnotationIds` into `AnnotatedText` from `TranscriptView`

**Files:**
- Modify: `components/TranscriptView.tsx`
- Test: `__tests__/components/TranscriptView.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test case to `__tests__/components/TranscriptView.test.tsx` (after existing tests):

```tsx
it('shows the added badge on a highlight when the annotation id is in addedAnnotationIds', () => {
  render(
    <TranscriptView
      segments={segments}
      annotations={annotations}
      userSpeakerLabels={['A']}
      sessionId="s1"
      addedAnnotationIds={new Set(['ann-1'])}
      onAnnotationAdded={vi.fn()}
    />
  )
  expect(screen.getByTestId('annotation-added-badge')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/components/TranscriptView.test.tsx
```

Expected: the new test fails (badge not found — `addedAnnotationIds` not yet passed to `AnnotatedText`).

- [ ] **Step 3: Pass `addedAnnotationIds` to `AnnotatedText` in `TranscriptView`**

In `components/TranscriptView.tsx`, find the `<AnnotatedText>` call (around line 42–44) and add the `addedAnnotationIds` prop — it is already received by `TranscriptView`'s interface, just not yet forwarded:

```tsx
<AnnotatedText
  text={seg.text}
  annotations={annotationsBySegment[seg.id] ?? []}
  onAnnotationClick={a => {
    setActiveAnnotation(activeAnnotation?.id === a.id ? null : a)
  }}
  addedAnnotationIds={addedAnnotationIds}
/>
```

- [ ] **Step 4: Run all TranscriptView tests**

```bash
npm test -- __tests__/components/TranscriptView.test.tsx
```

Expected: all 5 tests pass (4 existing + 1 new).

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/TranscriptView.tsx __tests__/components/TranscriptView.test.tsx
git commit -m "feat: wire addedAnnotationIds into AnnotatedText from TranscriptView"
```
