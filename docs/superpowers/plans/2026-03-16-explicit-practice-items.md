# Explicit Practice Item Adding Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove automatic practice item creation during analysis and let users explicitly add annotations to their practice list from the transcript screen.

**Architecture:** Remove the auto-insert loop from `lib/pipeline.ts` and the pre-re-analysis delete from `app/api/sessions/[id]/analyse/route.ts`. Extend `GET /api/sessions/:id` to return `addedAnnotationIds`. Page holds added state in `useState`; `AnnotationCard` owns the API call and notifies the parent on success.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (`@supabase/supabase-js` v2), Vitest + React Testing Library.

---

## Chunk 1: Backend + Pipeline

### Task 1: Update pipeline tests — remove practice_items assertions

**Files:**
- Modify: `__tests__/lib/pipeline.test.ts`

- [ ] **Step 1: Remove practice_items mock and assertion from test 1**

In the first test (`inserts annotations and practice items…`), remove:
- The `insertPracticeMock` variable
- The `if (table === 'practice_items') return { insert: insertPracticeMock }` branch
- Lines that assert on `insertPracticeMock` (`const practiceCall = …` and `expect(practiceCall[0])…`)
- Update the test name to: `'inserts annotations then sets status ready'`

The test should now look like:

```typescript
it('inserts annotations then sets status ready', async () => {
  const insertAnnotationsMock = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({
      data: [{ id: 'ann-1' }],
      error: null,
    }),
  })
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { user_speaker_labels: ['A'], audio_r2_key: 'audio/test.mp3' },
                error: null,
              }),
            }),
          }),
          update: updateMock,
        }
      }
      if (table === 'transcript_segments') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'seg-1', speaker: 'A', text: 'Yo fui al mercado.' }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'annotations') return { insert: insertAnnotationsMock }
      return {}
    }),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  vi.mocked(analyseUserTurns).mockResolvedValue([
    { segment_id: 'seg-1', type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.' },
  ])
  vi.mocked(deleteObject).mockResolvedValue(undefined)

  await runClaudeAnalysis('session-1')

  expect(insertAnnotationsMock).toHaveBeenCalled()
  expect(updateMock).toHaveBeenCalledWith({ status: 'ready' })
})
```

- [ ] **Step 2: Remove dead practice_items mock from tests 2 and 3**

In both `'passes only speaker B segments…'` and `'passes segments from both speakers…'`, remove:
```typescript
if (table === 'practice_items') return { insert: vi.fn().mockResolvedValue({ error: null }) }
```

- [ ] **Step 3: Run the tests — expect them to fail** (pipeline.ts not yet changed)

```bash
npm test -- __tests__/lib/pipeline.test.ts
```

Expected: tests **fail** because `pipeline.ts` still inserts practice_items and tries to call `mockDb.from('practice_items')`, which now returns `{}` (no `insert` method), so it throws.

- [ ] **Step 4: Commit the test changes**

```bash
git add __tests__/lib/pipeline.test.ts
git commit -m "test: update pipeline tests — remove practice_items assertions"
```

---

### Task 2: Remove auto-creation from pipeline.ts

**Files:**
- Modify: `lib/pipeline.ts`

- [ ] **Step 1: Delete the practice_items insert block**

Remove lines 58–68 (the comment and `await db.from('practice_items').insert(…)` block). Also change the annotations insert block — remove `.select('id')` and the `insertedAnnotations`/`annotationError` variable plumbing, since we no longer need the returned IDs. Note: `pipeline.ts` already uses `user_speaker_labels` (plural array) — no changes needed there. The updated annotations section should be:

```typescript
  if (annotations.length > 0) {
    const { error: annotationError } = await db.from('annotations').insert(
      annotations.map(a => ({
        session_id: sessionId,
        segment_id: a.segment_id,
        type: a.type,
        original: a.original,
        start_char: a.start_char,
        end_char: a.end_char,
        correction: a.correction,
        explanation: a.explanation,
      }))
    )

    if (annotationError) {
      throw new Error(`Failed to insert annotations: ${annotationError.message}`)
    }
  }
```

- [ ] **Step 2: Run tests — expect them to pass**

```bash
npm test -- __tests__/lib/pipeline.test.ts
```

Expected: all 3 tests **PASS**.

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline.ts
git commit -m "feat: remove automatic practice item creation from analysis pipeline"
```

---

### Task 3: Remove practice_items deletion from re-analysis route

**Files:**
- Modify: `app/api/sessions/[id]/analyse/route.ts`

- [ ] **Step 1: Delete the deletion block and its comment**

Remove lines 28–35 (the comment block explaining deletion order, and the `await db.from('practice_items').delete()…` call). The `await db.from('annotations').delete().eq('session_id', params.id)` line on line 35 stays.

The route after the validation block should go directly from validation to:

```typescript
  await db.from('annotations').delete().eq('session_id', params.id)

  await db.from('sessions').update({
    status: 'analysing',
    error_stage: null,
  }).eq('id', params.id)
```

- [ ] **Step 2: Run the analyse route tests**

```bash
npm test -- __tests__/api/analyse.test.ts
```

Expected: **PASS** (if the test file exists) or no failures. If there's no test file for this route, skip.

- [ ] **Step 3: Commit**

```bash
git add app/api/sessions/[id]/analyse/route.ts
git commit -m "feat: preserve practice items across re-analysis"
```

---

### Task 4: Extend GET /api/sessions/:id to include addedAnnotationIds

**Files:**
- Modify: `lib/types.ts`
- Modify: `app/api/sessions/[id]/route.ts`

- [ ] **Step 1: Update the SessionDetail type in lib/types.ts**

Add `addedAnnotationIds: string[]` to the `SessionDetail` interface:

```typescript
export interface SessionDetail {
  session: Pick<Session,
    'id' | 'title' | 'status' | 'error_stage' | 'duration_seconds' |
    'detected_speaker_count' | 'user_speaker_labels' | 'created_at'
  >
  segments: TranscriptSegment[]
  annotations: Annotation[]
  addedAnnotationIds: string[]
}
```

- [ ] **Step 2: Update the GET handler in app/api/sessions/[id]/route.ts**

Add a query for practice_items after the annotations query:

```typescript
  const { data: practiceItems } = await db
    .from('practice_items')
    .select('annotation_id')
    .eq('session_id', params.id)

  const addedAnnotationIds = (practiceItems ?? [])
    .map((p: { annotation_id: string | null }) => p.annotation_id)
    .filter((id): id is string => id !== null)

  return NextResponse.json({
    session,
    segments: segments ?? [],
    annotations: annotations ?? [],
    addedAnnotationIds,
  })
```

- [ ] **Step 3: Run tests — expect sessions.test.ts to fail**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: the `'returns session detail…'` test **FAILS** because the mock's catch-all branch (used for both `transcript_segments` and `annotations`) uses `.order()` as its terminal method, but the new `practice_items` query uses `.eq()` as terminal. The mock will return `undefined` for the new query.

- [ ] **Step 4: Commit the implementation before fixing tests**

```bash
git add lib/types.ts app/api/sessions/[id]/route.ts
git commit -m "feat: include addedAnnotationIds in GET /api/sessions/:id response"
```

---

### Task 5: Fix sessions.test.ts for the new response shape

**Files:**
- Modify: `__tests__/api/sessions.test.ts`

- [ ] **Step 1: Add a practice_items branch to the GET detail mock and fix user_speaker_labels**

Replace the `'returns session detail…'` test's `mockDb` with a version that:
1. Fixes the mock session data: `user_speaker_label: 'A'` → `user_speaker_labels: ['A']`
2. Adds a dedicated `practice_items` branch that handles `.select().eq()` (no `.order()`)
3. Updates the assertions to include `addedAnnotationIds`

```typescript
it('returns session detail with segments, annotations, and addedAnnotationIds', async () => {
  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 's1', title: 'Test', status: 'ready', error_stage: null,
                  duration_seconds: 60, detected_speaker_count: 2, user_speaker_labels: ['A'],
                  created_at: '2026-03-15' },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'practice_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [{ annotation_id: 'ann-1' }], error: null }),
          }),
        }
      }
      // transcript_segments and annotations
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }
    }),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  const req = new NextRequest('http://localhost')
  const res = await getDetail(req, { params: { id: 's1' } })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.session.id).toBe('s1')
  expect(body.segments).toEqual([])
  expect(body.annotations).toEqual([])
  expect(body.addedAnnotationIds).toEqual(['ann-1'])
})
```

- [ ] **Step 2: Run tests — expect them to pass**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: all tests **PASS**.

- [ ] **Step 3: Commit**

```bash
git add __tests__/api/sessions.test.ts
git commit -m "test: update sessions API test for addedAnnotationIds and fix user_speaker_labels mock"
```

---

## Chunk 2: Frontend

### Task 6: Rewrite AnnotationCard tests

**Files:**
- Modify: `__tests__/components/AnnotationCard.test.tsx`

- [ ] **Step 1: Replace the test file contents**

The new tests use `isAdded`, `onAnnotationAdded`, `sessionId`, and `onClose` props; the card owns its own `fetch`. Mock `fetch` globally.

```typescript
// __tests__/components/AnnotationCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { Annotation } from '@/lib/types'

const grammarAnnotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6,
  correction: 'Fui', explanation: 'Drop the subject pronoun.',
}
const strengthAnnotation: Annotation = {
  id: 'ann-2', session_id: 's1', segment_id: 'seg-1',
  type: 'strength', original: 'buenísimo', start_char: 0, end_char: 9,
  correction: null, explanation: 'Great superlative usage.',
}

const defaultProps = {
  sessionId: 's1',
  isAdded: false,
  onAnnotationAdded: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AnnotationCard', () => {
  it('renders correction for grammar annotation', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })

  it('renders keep-this message for strength annotation', () => {
    render(<AnnotationCard annotation={strengthAnnotation} {...defaultProps} />)
    expect(screen.getByText(/keep this/i)).toBeInTheDocument()
  })

  it('renders disabled "Added" button when isAdded is true', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} isAdded={true} />)
    const btn = screen.getByRole('button', { name: /added to practice/i })
    expect(btn).toBeDisabled()
  })

  it('does not call fetch when isAdded is true and button is clicked', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} isAdded={true} />)
    // button is disabled, click should be a no-op
    await userEvent.click(screen.getByRole('button', { name: /added to practice/i }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls fetch and onAnnotationAdded on successful add', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationAdded = vi.fn()
    render(
      <AnnotationCard
        annotation={grammarAnnotation}
        {...defaultProps}
        onAnnotationAdded={onAnnotationAdded}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    expect(fetchSpy).toHaveBeenCalledWith('/api/practice-items', expect.objectContaining({
      method: 'POST',
    }))
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1')
    // button should now show "Added"
    expect(screen.getByRole('button', { name: /added to practice/i })).toBeDisabled()
  })

  it('leaves button enabled on fetch failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    // button should still be enabled (not switched to Added state)
    expect(screen.getByRole('button', { name: /add to practice/i })).not.toBeDisabled()
  })

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the new tests — expect them to fail**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```

Expected: tests **FAIL** — `AnnotationCard` still uses the old `onAddToPractice` prop interface.

- [ ] **Step 3: Commit the failing tests**

```bash
git add __tests__/components/AnnotationCard.test.tsx
git commit -m "test: rewrite AnnotationCard tests for new props and internal fetch"
```

---

### Task 7: Rewrite AnnotationCard component

**Files:**
- Modify: `components/AnnotationCard.tsx`

- [ ] **Step 1: Replace the component**

```typescript
// components/AnnotationCard.tsx
'use client'
import { useState } from 'react'
import type { Annotation } from '@/lib/types'

const TYPE_LABEL = { grammar: '🔴 Grammar', naturalness: '🟡 Naturalness', strength: '🟢 Strength' }

interface Props {
  annotation: Annotation
  sessionId: string
  isAdded: boolean
  onAnnotationAdded: (annotationId: string) => void
  onClose: () => void
}

export function AnnotationCard({ annotation, sessionId, isAdded, onAnnotationAdded, onClose }: Props) {
  const [added, setAdded] = useState(isAdded)

  async function handleAdd() {
    const res = await fetch('/api/practice-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        annotation_id: annotation.id,
        type: annotation.type,
        original: annotation.original,
        correction: annotation.correction,
        explanation: annotation.explanation,
      }),
    })
    if (res.ok) {
      setAdded(true)
      onAnnotationAdded(annotation.id)
    } else {
      console.error('Failed to add practice item')
    }
  }

  return (
    <div className="mt-2 ml-6 border border-gray-700 rounded-lg p-4 text-sm space-y-2 bg-gray-900">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-xs uppercase tracking-wide text-gray-400">
          {TYPE_LABEL[annotation.type]}
        </p>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <p>
        {annotation.correction ? (
          <span className="font-medium">{annotation.correction}</span>
        ) : (
          <span className="text-green-300">Keep this! &ldquo;{annotation.original}&rdquo;</span>
        )}
      </p>
      <p className="text-gray-400">{annotation.explanation}</p>
      {added ? (
        <button
          disabled
          className="text-xs text-gray-500 cursor-not-allowed"
        >
          ✓ Added to practice list
        </button>
      ) : (
        <button
          onClick={handleAdd}
          className="text-xs text-violet-400 hover:text-violet-300 underline"
        >
          Add to practice list
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run tests — expect them to pass**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```

Expected: all 7 tests **PASS**.

- [ ] **Step 3: Commit**

```bash
git add components/AnnotationCard.tsx
git commit -m "feat: AnnotationCard owns practice item API call, tracks added state"
```

---

### Task 8: Update TranscriptView tests

**Files:**
- Modify: `__tests__/components/TranscriptView.test.tsx`

- [ ] **Step 1: Replace onAddToPractice with new props in all test cases**

Replace every instance of `onAddToPractice={() => {}}` with the three new props. Also mock `fetch` as a no-op since `AnnotationCard` will call it internally during these tests.

```typescript
// __tests__/components/TranscriptView.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranscriptView } from '@/components/TranscriptView'
import type { TranscriptSegment, Annotation } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// Prevent actual fetch calls from AnnotationCard during TranscriptView tests
vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)

const segments: TranscriptSegment[] = [
  { id: 'seg-1', session_id: 's1', speaker: 'A', text: 'Yo fui al mercado.', start_ms: 0, end_ms: 2000, position: 0 },
  { id: 'seg-2', session_id: 's1', speaker: 'B', text: '¿Qué compraste?', start_ms: 2500, end_ms: 4000, position: 1 },
]
const annotations: Annotation[] = [
  { id: 'ann-1', session_id: 's1', segment_id: 'seg-1', type: 'grammar',
    original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.' },
]

const defaultProps = {
  sessionId: 's1',
  addedAnnotationIds: new Set<string>(),
  onAnnotationAdded: vi.fn(),
}

describe('TranscriptView', () => {
  it('dims native speaker turns (speaker B when user is A)', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabel="A" {...defaultProps} />
    )
    const dimmed = container.querySelector('.opacity-40')
    expect(dimmed).toBeTruthy()
    expect(dimmed?.textContent).toContain('¿Qué compraste?')
  })

  it('shows annotation card when highlight is clicked', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabel="A" {...defaultProps} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })

  it('hides annotation card when same highlight is clicked again', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabel="A" {...defaultProps} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('filters annotations by type', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabel="A" {...defaultProps} />
    )
    await userEvent.click(screen.getByRole('button', { name: /natural/i }))
    expect(screen.queryByText('Yo fui')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npm test -- __tests__/components/TranscriptView.test.tsx
```

Expected: **FAIL** — `TranscriptView` still expects `onAddToPractice`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add __tests__/components/TranscriptView.test.tsx
git commit -m "test: update TranscriptView tests for new props"
```

---

### Task 9: Update TranscriptView component

**Files:**
- Modify: `components/TranscriptView.tsx`

- [ ] **Step 1: Replace the Props interface and component signature**

```typescript
interface Props {
  segments: TranscriptSegment[]
  annotations: Annotation[]
  userSpeakerLabel: 'A' | 'B' | null
  sessionId: string
  addedAnnotationIds: Set<string>
  onAnnotationAdded: (annotationId: string) => void
}

export function TranscriptView({ segments, annotations, userSpeakerLabel, sessionId, addedAnnotationIds, onAnnotationAdded }: Props) {
```

- [ ] **Step 2: Update the AnnotationCard render call**

Replace:
```typescript
<AnnotationCard annotation={activeAnnotation} onAddToPractice={onAddToPractice} onClose={() => setActiveAnnotation(null)} />
```

With:
```typescript
<AnnotationCard
  annotation={activeAnnotation}
  sessionId={sessionId}
  isAdded={addedAnnotationIds.has(activeAnnotation.id)}
  onAnnotationAdded={onAnnotationAdded}
  onClose={() => setActiveAnnotation(null)}
/>
```

- [ ] **Step 3: Run tests — expect them to pass**

```bash
npm test -- __tests__/components/TranscriptView.test.tsx
```

Expected: all 4 tests **PASS**.

- [ ] **Step 4: Commit**

```bash
git add components/TranscriptView.tsx
git commit -m "feat: update TranscriptView to pass isAdded and onAnnotationAdded to AnnotationCard"
```

---

### Task 10: Update the transcript page

**Files:**
- Modify: `app/sessions/[id]/page.tsx`

- [ ] **Step 1: Make the following changes**

1. Remove the `handleAddToPractice` function (the entire `async function handleAddToPractice` block).
2. Add `addedAnnotationIds` state below the `title` state:
   ```typescript
   const [addedAnnotationIds, setAddedAnnotationIds] = useState<Set<string>>(new Set())
   ```
3. In the `useEffect`, read `addedAnnotationIds` from the API response and initialise state:
   ```typescript
   .then((d: SessionDetail) => {
     setDetail(d)
     setTitle(d.session.title)
     setAddedAnnotationIds(new Set(d.addedAnnotationIds))
   })
   ```
4. Add the `handleAnnotationAdded` function:
   ```typescript
   function handleAnnotationAdded(annotationId: string) {
     setAddedAnnotationIds(prev => new Set([...prev, annotationId]))
   }
   ```
5. Fix the pre-existing bug on the `<TranscriptView>` call — change `userSpeakerLabel={session.user_speaker_label}` to `userSpeakerLabel={session.user_speaker_labels?.[0] ?? null}`.
6. Replace `onAddToPractice={handleAddToPractice}` with `addedAnnotationIds={addedAnnotationIds}`, `onAnnotationAdded={handleAnnotationAdded}`, and `sessionId={params.id}` on `<TranscriptView>`.

The updated `<TranscriptView>` JSX should be:
```tsx
<TranscriptView
  segments={segments}
  annotations={annotations}
  userSpeakerLabel={session.user_speaker_labels?.[0] ?? null}
  sessionId={params.id}
  addedAnnotationIds={addedAnnotationIds}
  onAnnotationAdded={handleAnnotationAdded}
/>
```

Also update the import — `Annotation` is no longer needed by the page directly:
```typescript
import type { SessionDetail } from '@/lib/types'
```

When destructuring `detail`, add `addedAnnotationIds` — use a rename to avoid shadowing the state variable:
```typescript
const { session, segments, annotations, addedAnnotationIds: fetchedAnnotationIds } = detail
// then: setAddedAnnotationIds(new Set(fetchedAnnotationIds))
```
Or simply reference `d.addedAnnotationIds` directly inside the `useEffect` `.then()` callback (whichever matches the existing code style).

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests **PASS**.

- [ ] **Step 3: Run the linter**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/sessions/[id]/page.tsx
git commit -m "feat: wire up explicit practice item adding on transcript page"
```

---

## Final verification

- [ ] **Run the dev server and manually verify**

```bash
npm run dev
```

1. Open a session that is in `ready` state.
2. Click an annotation highlight — the card should show "Add to practice list".
3. Click "Add to practice list" — the button should change to "✓ Added to practice list" (disabled).
4. Close the card and reopen the same annotation — button should still show "✓ Added to practice list".
5. Go to the Practice Items page — verify the item appears.
6. Go back and click Re-analyse — after analysis completes, reload the transcript page and verify all buttons show "Add to practice list" (reset for new annotation IDs).
