# UI Improvements & Flashcard Review System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sub-category filter collapse, mobile-friendly session list rows, and a swipeable flashcard review system generated from practice items.

**Architecture:** Three independent UI features on a shared data foundation. Features 1 and 2 are pure component changes. Feature 3 requires a DB migration + Claude prompt update first, then new UI components. Tasks are ordered so the data layer lands before the UI that depends on it.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library, `react-swipeable`, Supabase PostgreSQL.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260325000000_add_flashcard_fields.sql` | Create | Add `flashcard_*` columns to `annotations` and `practice_items` |
| `lib/types.ts` | Modify | Add 3 nullable fields to `Annotation` and `PracticeItem` interfaces |
| `lib/claude.ts` | Modify | Extend `ClaudeAnnotation`, update system prompt, bump `max_tokens` |
| `lib/pipeline.ts` | Modify | Pass `flashcard_*` fields through to annotations insert |
| `components/AnnotationCard.tsx` | Modify | Include `flashcard_*` in POST body when adding to practice |
| `app/api/practice-items/route.ts` | Modify | Extend `.select()` column list |
| `components/PracticeList.tsx` | Modify | Collapse filter row to All + 3 + More by default |
| `components/SessionList.tsx` | Modify | Two-line row layout, full-row link, no rename |
| `app/page.tsx` | Modify | Remove `handleRename` and `onRename` prop |
| `components/FlashcardDeck.tsx` | Create | Card flip, swipe, note expand/collapse logic |
| `app/flashcards/page.tsx` | Create | Flashcard review page |
| `components/BottomNav.tsx` | Modify | Add Flashcards tab |
| `__tests__/lib/claude.test.ts` | Modify | Update fixtures, add flashcard field test |
| `__tests__/lib/pipeline.test.ts` | Modify | Assert flashcard fields in annotations insert |
| `__tests__/components/AnnotationCard.test.tsx` | Modify | Update fixture, add flashcard POST body test |
| `__tests__/components/PracticeList.test.tsx` | Modify | Update pill count test, add collapse tests |
| `__tests__/components/BottomNav.test.tsx` | Modify | Update nav link count, add Flashcards tab test |
| `__tests__/components/SessionList.test.tsx` | Create | Two-line row, links, duration format |
| `__tests__/components/FlashcardDeck.test.tsx` | Create | Render, flip, note toggle, advance, loop |

---

## Task 1: DB Migration + Type Foundation

**Files:**
- Create: `supabase/migrations/20260325000000_add_flashcard_fields.sql`
- Modify: `lib/types.ts`
- Modify: `__tests__/components/AnnotationCard.test.tsx` (fixture update only)
- Modify: `__tests__/components/PracticeList.test.tsx` (fixture update only)

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260325000000_add_flashcard_fields.sql
ALTER TABLE annotations
  ADD COLUMN IF NOT EXISTS flashcard_front text,
  ADD COLUMN IF NOT EXISTS flashcard_back  text,
  ADD COLUMN IF NOT EXISTS flashcard_note  text;

ALTER TABLE practice_items
  ADD COLUMN IF NOT EXISTS flashcard_front text,
  ADD COLUMN IF NOT EXISTS flashcard_back  text,
  ADD COLUMN IF NOT EXISTS flashcard_note  text;
```

- [ ] **Step 2: Add fields to `Annotation` in `lib/types.ts`**

In the `Annotation` interface (after `sub_category`), add:
```ts
flashcard_front: string | null
flashcard_back: string | null
flashcard_note: string | null
```

- [ ] **Step 3: Add fields to `PracticeItem` in `lib/types.ts`**

In the `PracticeItem` interface (after `explanation`), add:
```ts
flashcard_front: string | null
flashcard_back: string | null
flashcard_note: string | null
```

- [ ] **Step 4: Update `Annotation` fixture in `__tests__/components/AnnotationCard.test.tsx`**

Add the three null fields to `grammarAnnotation`:
```ts
const grammarAnnotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6,
  correction: 'Fui', explanation: 'Drop the subject pronoun.', sub_category: 'subjunctive',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
}
```

- [ ] **Step 5: Update `PracticeItem` fixtures in `__tests__/components/PracticeList.test.tsx`**

Add the three null fields to `grammarItem`, `subjectiveItem`, and all inline `PracticeItem` objects in the test file:
```ts
const grammarItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'Yo fui', correction: 'Fui',
  explanation: 'Drop pronoun.', sub_category: 'other', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
}
const subjectiveItem: PracticeItem = {
  id: 'item-2', session_id: 's1', annotation_id: 'ann-2',
  type: 'grammar', original: 'vengas', correction: 'venís',
  explanation: '', sub_category: 'subjunctive', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
}
```

Also add `flashcard_front: null, flashcard_back: null, flashcard_note: null` to all inline object literals typed as `PracticeItem` in the same test file (there are several in the sub-category filter and pill order tests).

- [ ] **Step 6: Run tests to confirm type errors are fixed**

```bash
npm test
```
Expected: all existing tests pass (no behaviour changes yet).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260325000000_add_flashcard_fields.sql lib/types.ts \
  __tests__/components/AnnotationCard.test.tsx \
  __tests__/components/PracticeList.test.tsx
git commit -m "feat: add flashcard_front/back/note columns to annotations and practice_items"
```

---

## Task 2: Claude Prompt Update

**Files:**
- Modify: `lib/claude.ts`
- Modify: `__tests__/lib/claude.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `__tests__/lib/claude.test.ts`:
```ts
it('returns flashcard fields when Claude includes them in response', async () => {
  const turns: UserTurn[] = [{ id: 'seg-1', text: 'Yo fui al mercado.' }]
  mockCreate.mockResolvedValueOnce({
    content: [{
      type: 'text',
      text: JSON.stringify({
        title: 'Test',
        annotations: [{
          segment_id: 'seg-1',
          type: 'grammar',
          original: 'Yo fui',
          start_char: 0,
          end_char: 6,
          correction: 'Fui',
          explanation: 'Drop the subject pronoun.',
          sub_category: 'verb-conjugation',
          flashcard_front: 'I [[went]] to the market yesterday.',
          flashcard_back: '[[Fui]] al mercado ayer.',
          flashcard_note: 'Subject pronouns are typically omitted in Rioplatense speech.',
        }],
      }),
    }],
  })
  const result = await analyseUserTurns(turns, null)
  expect(result.annotations[0].flashcard_front).toBe('I [[went]] to the market yesterday.')
  expect(result.annotations[0].flashcard_back).toBe('[[Fui]] al mercado ayer.')
  expect(result.annotations[0].flashcard_note).toBe('Subject pronouns are typically omitted in Rioplatense speech.')
})

it('returns null flashcard fields when Claude omits them', async () => {
  mockCreate.mockResolvedValueOnce({
    content: [{
      type: 'text',
      text: JSON.stringify({
        title: 'Test',
        annotations: [{
          segment_id: 'seg-1', type: 'grammar', original: 'x',
          start_char: 0, end_char: 1, correction: 'y',
          explanation: 'z.', sub_category: 'other',
          // flashcard fields intentionally absent
        }],
      }),
    }],
  })
  const result = await analyseUserTurns([{ id: 'seg-1', text: 'x' }], null)
  expect(result.annotations[0].flashcard_front).toBeNull()
  expect(result.annotations[0].flashcard_back).toBeNull()
  expect(result.annotations[0].flashcard_note).toBeNull()
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- __tests__/lib/claude.test.ts
```
Expected: FAIL — `flashcard_front` is undefined, not the expected string.

- [ ] **Step 3: Update `ClaudeAnnotation` interface in `lib/claude.ts`**

```ts
export interface ClaudeAnnotation {
  segment_id: string
  type: 'grammar' | 'naturalness'
  sub_category: string
  original: string
  start_char: number
  end_char: number
  correction: string
  explanation: string
  flashcard_front: string | null
  flashcard_back: string | null
  flashcard_note: string | null
}
```

- [ ] **Step 4: Update `SYSTEM_PROMPT` in `lib/claude.ts`**

Add the following to the per-annotation instructions (after the `"sub_category"` bullet):
```
- "flashcard_front": An invented English sentence that correctly expresses the same meaning as the practice phrase. The correct English equivalent phrase is wrapped in [[double brackets]]. Example: "I [[went]] to the market yesterday."
- "flashcard_back": The equivalent Spanish sentence using the correct phrase, wrapped in [[double brackets]]. Example: "[[Fui]] al mercado ayer."
- "flashcard_note": 1–2 sentences (in English) explaining why the original was wrong or unnatural from a Rioplatense register perspective. Be concise.
```

Update the JSON shape at the end of the prompt string from:
```
{ "title": string, "annotations": [{ "segment_id", "type", "sub_category", "original", "start_char", "end_char", "correction", "explanation" }] }
```
to:
```
{ "title": string, "annotations": [{ "segment_id", "type", "sub_category", "original", "start_char", "end_char", "correction", "explanation", "flashcard_front", "flashcard_back", "flashcard_note" }] }
```

- [ ] **Step 5: Update `max_tokens` in `lib/claude.ts`**

Change `max_tokens: 4096` to `max_tokens: 8192`.

- [ ] **Step 6: Normalise null fields in `analyseUserTurns`**

After `const parsed = JSON.parse(text) as ...`, ensure null-safety when the parsed annotation omits the new fields. The cleanest approach is to normalise in `analyseUserTurns` before returning:

```ts
return {
  title: parsed.title?.trim() || 'Untitled',
  annotations: (parsed.annotations ?? []).map(a => ({
    ...a,
    flashcard_front: a.flashcard_front ?? null,
    flashcard_back: a.flashcard_back ?? null,
    flashcard_note: a.flashcard_note ?? null,
  })),
}
```

- [ ] **Step 7: Run tests**

```bash
npm test -- __tests__/lib/claude.test.ts
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add lib/claude.ts __tests__/lib/claude.test.ts
git commit -m "feat: add flashcard sentence generation to Claude annotation prompt"
```

---

## Task 3: Pipeline — Write Flashcard Fields to Annotations

**Files:**
- Modify: `lib/pipeline.ts`
- Modify: `__tests__/lib/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

Add a new `it` block to `__tests__/lib/pipeline.test.ts` (reuse the mock DB setup pattern from existing tests):
```ts
it('writes flashcard fields from ClaudeAnnotation to annotations insert', async () => {
  const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'sessions') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({
          data: { user_speaker_labels: ['A'], audio_r2_key: null, original_filename: null },
          error: null,
        }) }) }),
        update: updateMock,
      }
      if (table === 'transcript_segments') return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({
          data: [{ id: 'seg-1', speaker: 'A', text: 'Yo fui.' }], error: null,
        }) }) }),
      }
      if (table === 'annotations') return { insert: insertAnnotationsMock }
      return {}
    }),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  vi.mocked(analyseUserTurns).mockResolvedValue({
    title: 'Test',
    annotations: [{
      segment_id: 'seg-1', type: 'grammar', original: 'Yo fui',
      start_char: 0, end_char: 6, correction: 'Fui',
      explanation: 'Drop pronoun.', sub_category: 'verb-conjugation',
      flashcard_front: 'I [[went]] to the market.',
      flashcard_back: '[[Fui]] al mercado.',
      flashcard_note: 'Subject pronouns are dropped in Rioplatense.',
    }],
  })
  vi.mocked(deleteObject).mockResolvedValue(undefined)

  await runClaudeAnalysis('sess-1')

  const insertedRows = insertAnnotationsMock.mock.calls[0][0]
  expect(insertedRows[0].flashcard_front).toBe('I [[went]] to the market.')
  expect(insertedRows[0].flashcard_back).toBe('[[Fui]] al mercado.')
  expect(insertedRows[0].flashcard_note).toBe('Subject pronouns are dropped in Rioplatense.')
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- __tests__/lib/pipeline.test.ts
```
Expected: FAIL — `flashcard_front` is undefined in the inserted row.

- [ ] **Step 3: Update the annotations insert in `lib/pipeline.ts`**

In the `correctedAnnotations.map(a => ({...}))` block (lines 79–89), add:
```ts
flashcard_front: a.flashcard_front ?? null,
flashcard_back: a.flashcard_back ?? null,
flashcard_note: a.flashcard_note ?? null,
```

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/lib/pipeline.test.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline.ts __tests__/lib/pipeline.test.ts
git commit -m "feat: persist flashcard fields in annotations insert"
```

---

## Task 4: AnnotationCard — Pass Flashcard Fields to POST

**Files:**
- Modify: `components/AnnotationCard.tsx`
- Modify: `__tests__/components/AnnotationCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/components/AnnotationCard.test.tsx`:
```ts
it('includes flashcard fields in POST body when annotation has them', async () => {
  const annotationWithFlashcard: Annotation = {
    ...grammarAnnotation,
    flashcard_front: 'I [[went]] to the market.',
    flashcard_back: '[[Fui]] al mercado.',
    flashcard_note: 'Subject pronouns are dropped in Rioplatense.',
  }
  let capturedBody: Record<string, unknown> = {}
  vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
    capturedBody = JSON.parse((init as RequestInit).body as string)
    return { ok: true } as Response
  })
  render(<AnnotationCard annotation={annotationWithFlashcard} {...defaultProps} />)
  await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
  expect(capturedBody.flashcard_front).toBe('I [[went]] to the market.')
  expect(capturedBody.flashcard_back).toBe('[[Fui]] al mercado.')
  expect(capturedBody.flashcard_note).toBe('Subject pronouns are dropped in Rioplatense.')
})

it('sends null flashcard fields when annotation has none', async () => {
  let capturedBody: Record<string, unknown> = {}
  vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
    capturedBody = JSON.parse((init as RequestInit).body as string)
    return { ok: true } as Response
  })
  render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
  await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
  expect(capturedBody.flashcard_front).toBeNull()
  expect(capturedBody.flashcard_back).toBeNull()
  expect(capturedBody.flashcard_note).toBeNull()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```
Expected: FAIL — `flashcard_front` undefined in POST body.

- [ ] **Step 3: Update `handleAdd` in `components/AnnotationCard.tsx`**

In the `body: JSON.stringify({...})` call, add:
```ts
flashcard_front: annotation.flashcard_front ?? null,
flashcard_back: annotation.flashcard_back ?? null,
flashcard_note: annotation.flashcard_note ?? null,
```

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/AnnotationCard.tsx __tests__/components/AnnotationCard.test.tsx
git commit -m "feat: pass flashcard fields through to practice items POST"
```

---

## Task 5: Practice Items API — Extend Column List

**Files:**
- Modify: `app/api/practice-items/route.ts`

No new tests needed — the existing test mocks the Supabase client and doesn't verify the column string. The column list change is verified end-to-end by the full data flow.

- [ ] **Step 1: Update `.select()` call in `app/api/practice-items/route.ts`**

On line 9, change:
```ts
.select('id, session_id, annotation_id, type, sub_category, original, correction, explanation, reviewed, created_at, updated_at')
```
to:
```ts
.select('id, session_id, annotation_id, type, sub_category, original, correction, explanation, reviewed, created_at, updated_at, flashcard_front, flashcard_back, flashcard_note')
```

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/practice-items/route.ts
git commit -m "feat: return flashcard columns from practice items API"
```

---

## Task 6: Feature 1 — Sub-category Filter Collapse

**Files:**
- Modify: `components/PracticeList.tsx`
- Modify: `__tests__/components/PracticeList.test.tsx`

- [ ] **Step 1: Update the existing pill count test and write new collapse tests**

In `__tests__/components/PracticeList.test.tsx`, find the describe block `'PracticeList — sub-category pill row'`.

**Replace** the test `'renders all 14 pills (All + 13 sub-categories including Other)'` with these two tests:

```ts
it('shows All pill + 3 sub-category pills + More button by default', () => {
  render(<PracticeList items={[grammarItem]} />)
  expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /more \+/i })).toBeInTheDocument()
  // Pills beyond the first 3 sub-categories should NOT be visible
  // (which ones are hidden depends on sort order; just verify More exists)
})

it('shows all sub-category pills after clicking More', async () => {
  render(<PracticeList items={[grammarItem]} />)
  await userEvent.click(screen.getByRole('button', { name: /more \+/i }))
  expect(screen.queryByRole('button', { name: /more \+/i })).not.toBeInTheDocument()
  // Spot-check a few sub-categories that would otherwise be hidden
  expect(screen.getByRole('button', { name: /verb conjugation/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /subjunctive/i })).toBeInTheDocument()
})

it('starts expanded (no More pill) when initialSubCategory is provided', () => {
  render(<PracticeList items={[grammarItem]} initialSubCategory="verb-conjugation" />)
  expect(screen.queryByRole('button', { name: /more \+/i })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /verb conjugation/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to confirm the new tests fail**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```
Expected: the new "shows More button" test passes (trivially, since all pills currently render), but "shows All + 3 + More" fails because all 14 pills are rendered today.

- [ ] **Step 3: Update `PracticeList.tsx` — add collapse state**

After the existing `useState` declarations, add:
```ts
const [isExpanded, setIsExpanded] = useState(initialSubCategory !== undefined)
```

- [ ] **Step 4: Update pill rendering in `PracticeList.tsx`**

In the pill row JSX (the `{!isBulkMode && (...)}` block), replace:
```tsx
{sortedSubCategories.map(sc => (
  <button ...>{SUB_CATEGORY_DISPLAY[sc]} <span>{subCategoryCounts[sc]}</span></button>
))}
```
with:
```tsx
{(isExpanded ? sortedSubCategories : sortedSubCategories.slice(0, 3)).map(sc => (
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
{!isExpanded && sortedSubCategories.length > 3 && (
  <button
    onClick={() => setIsExpanded(true)}
    className="px-3 py-1 rounded-full border border-gray-700 text-gray-400 transition-colors"
  >
    More +{sortedSubCategories.length - 3}
  </button>
)}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```
Expected: all tests pass.

- [ ] **Step 6: Run all tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/PracticeList.tsx __tests__/components/PracticeList.test.tsx
git commit -m "feat: collapse sub-category filter row to 3 pills + More by default"
```

---

## Task 7: Feature 2 — Session List Redesign

**Files:**
- Create: `__tests__/components/SessionList.test.tsx`
- Modify: `components/SessionList.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/SessionList.test.tsx`:
```tsx
// __tests__/components/SessionList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionList } from '@/components/SessionList'
import type { SessionListItem } from '@/lib/types'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

const readySession: SessionListItem = {
  id: 'sess-1', title: 'Chat with María', status: 'ready',
  duration_seconds: 512, created_at: '2026-03-15T10:00:00Z',
}
const transcribingSession: SessionListItem = {
  id: 'sess-2', title: 'Untitled', status: 'transcribing',
  duration_seconds: null, created_at: '2026-03-14T10:00:00Z',
}

describe('SessionList', () => {
  it('shows empty state when no sessions', () => {
    render(<SessionList sessions={[]} />)
    expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument()
  })

  it('renders session title', () => {
    render(<SessionList sessions={[readySession]} />)
    expect(screen.getByText('Chat with María')).toBeInTheDocument()
  })

  it('ready session links to /sessions/:id', () => {
    render(<SessionList sessions={[readySession]} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sessions/sess-1')
  })

  it('non-ready session links to /sessions/:id/status', () => {
    render(<SessionList sessions={[transcribingSession]} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/sessions/sess-2/status')
  })

  it('shows formatted duration as Xm Ys', () => {
    render(<SessionList sessions={[readySession]} />)
    // 512 seconds = 8m 32s
    expect(screen.getByText(/8m 32s/)).toBeInTheDocument()
  })

  it('omits duration when duration_seconds is null', () => {
    render(<SessionList sessions={[transcribingSession]} />)
    expect(screen.queryByText(/\dm \d+s/)).not.toBeInTheDocument()
  })

  it('shows status label', () => {
    render(<SessionList sessions={[transcribingSession]} />)
    expect(screen.getByText(/transcribing/i)).toBeInTheDocument()
  })

  it('does not render any text inputs (no inline rename)', () => {
    render(<SessionList sessions={[readySession]} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/SessionList.test.tsx
```
Expected: FAIL — `SessionList` currently requires an `onRename` prop and uses `InlineEdit` (renders a `<span>` that becomes a textbox).

- [ ] **Step 3: Rewrite `components/SessionList.tsx`**

```tsx
// components/SessionList.tsx
import Link from 'next/link'
import type { SessionListItem } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  uploading: 'Uploading…',
  transcribing: 'Transcribing…',
  identifying: 'Awaiting speaker ID',
  analysing: 'Analysing…',
  ready: 'Ready',
  error: 'Error',
}

const STATUS_COLOUR: Record<string, string> = {
  ready: 'text-green-400',
  error: 'text-red-400',
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

interface Props {
  sessions: SessionListItem[]
}

export function SessionList({ sessions }: Props) {
  if (sessions.length === 0) {
    return <p className="text-gray-500 text-sm">No sessions yet — upload your first conversation above.</p>
  }

  return (
    <ul className="divide-y divide-gray-800">
      {sessions.map(s => (
        <li key={s.id}>
          <Link
            href={s.status === 'ready' ? `/sessions/${s.id}` : `/sessions/${s.id}/status`}
            className="flex items-center gap-3 py-3 min-w-0"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate text-gray-100">{s.title}</p>
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5 flex-wrap">
                <span className={STATUS_COLOUR[s.status] ?? 'text-gray-400'}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                <span>·</span>
                <span>{new Date(s.created_at).toLocaleDateString()}</span>
                {s.duration_seconds != null && (
                  <>
                    <span>·</span>
                    <span>{formatDuration(s.duration_seconds)}</span>
                  </>
                )}
              </div>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="w-4 h-4 text-gray-600 flex-shrink-0" aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Update `app/page.tsx` — remove rename**

Delete the `handleRename` function (lines 22–29):
```ts
// DELETE these lines:
async function handleRename(id: string, newTitle: string) {
  await fetch(`/api/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: newTitle }),
  })
  setSessions(prev => prev.map(s => s.id === id ? { ...s, title: newTitle } : s))
}
```

Remove the `onRename={handleRename}` prop from the `<SessionList>` call (line 93):
```tsx
// BEFORE:
<SessionList sessions={sessions} onRename={handleRename} />
// AFTER:
<SessionList sessions={sessions} />
```

- [ ] **Step 5: Run tests**

```bash
npm test -- __tests__/components/SessionList.test.tsx
```
Expected: all tests pass.

- [ ] **Step 6: Run all tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/SessionList.tsx app/page.tsx \
  __tests__/components/SessionList.test.tsx
git commit -m "feat: redesign session list rows for mobile readability, remove home-page rename"
```

---

## Task 8: FlashcardDeck Component

**Files:**
- Create: `components/FlashcardDeck.tsx`
- Create: `__tests__/components/FlashcardDeck.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/FlashcardDeck.test.tsx`:
```tsx
// __tests__/components/FlashcardDeck.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlashcardDeck } from '@/components/FlashcardDeck'
import type { PracticeItem } from '@/lib/types'

vi.mock('react-swipeable', () => ({
  useSwipeable: () => ({}),
}))

const baseItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'te elimina', correction: 'se te lleva',
  explanation: 'Wrong verb phrase.', sub_category: 'phrasing', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: 'it can [[flush out]] your electrolytes',
  flashcard_back: 'puede [[se te lleva]] los electrolitos',
  flashcard_note: '"Te elimina" sounds like a direct translation and is not natural in Rioplatense.',
}

describe('FlashcardDeck — front face', () => {
  it('renders front face by default', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
    expect(screen.queryByTestId('flashcard-back')).not.toBeInTheDocument()
  })

  it('renders highlighted phrase on front', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.getByText('flush out')).toBeInTheDocument()
  })

  it('renders plain text when no brackets in flashcard_front', () => {
    const item = { ...baseItem, flashcard_front: 'no brackets here' }
    render(<FlashcardDeck items={[item]} />)
    expect(screen.getByText('no brackets here')).toBeInTheDocument()
  })

  it('shows "Tap to reveal Spanish" hint on front', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.getByText(/tap to reveal spanish/i)).toBeInTheDocument()
  })
})

describe('FlashcardDeck — flip', () => {
  it('flips to back face on card click', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByTestId('flashcard-back')).toBeInTheDocument()
    expect(screen.queryByTestId('flashcard-front')).not.toBeInTheDocument()
  })

  it('flips back to front on second click', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
  })

  it('renders highlighted phrase on back', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByText('se te lleva')).toBeInTheDocument()
  })
})

describe('FlashcardDeck — note panel', () => {
  it('note body is hidden by default on back face', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByText(/"Te elimina" sounds/)).not.toBeInTheDocument()
  })

  it('shows note body after clicking Why?', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /why\?/i }))
    expect(screen.getByText(/"Te elimina" sounds like a direct translation/)).toBeInTheDocument()
  })

  it('shows original and correction in note header', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByText('te elimina')).toBeInTheDocument()
    expect(screen.getAllByText('se te lleva').length).toBeGreaterThan(0)
  })

  it('shows — when correction is null', async () => {
    const item = { ...baseItem, correction: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('hides note panel entirely when flashcard_note is null', async () => {
    const item = { ...baseItem, flashcard_note: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByRole('button', { name: /why\?/i })).not.toBeInTheDocument()
  })
})

describe('FlashcardDeck — advance', () => {
  const item2: PracticeItem = {
    ...baseItem, id: 'item-2',
    flashcard_front: 'second card [[phrase]] here',
    flashcard_back: 'segunda [[tarjeta]] aquí',
  }

  it('advances to next card via test seam button', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    expect(screen.getByText('flush out')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('advance-card'))
    expect(screen.getByText('phrase')).toBeInTheDocument()
    expect(screen.queryByText('flush out')).not.toBeInTheDocument()
  })

  it('resets to front face when advancing', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    // Flip first card
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByTestId('flashcard-back')).toBeInTheDocument()
    // Advance
    await userEvent.click(screen.getByTestId('advance-card'))
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
  })

  it('loops back to first card after last', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    await userEvent.click(screen.getByTestId('advance-card')) // → card 2
    await userEvent.click(screen.getByTestId('advance-card')) // → loop to card 1
    expect(screen.getByText('flush out')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```
Expected: FAIL — `FlashcardDeck` doesn't exist yet.

- [ ] **Step 3: Create `components/FlashcardDeck.tsx`**

```tsx
// components/FlashcardDeck.tsx
'use client'
import { useState, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import type { PracticeItem } from '@/lib/types'

function renderHighlighted(text: string, colour: 'purple' | 'green'): React.ReactNode {
  const parts = text.split(/\[\[|\]\]/)
  if (parts.length < 3) return <>{text}</>
  const cls = colour === 'purple'
    ? 'text-violet-300 bg-violet-500/20 rounded px-1'
    : 'text-green-300 bg-green-500/20 rounded px-1'
  return (
    <>
      {parts[0]}
      <span className={cls}>{parts[1]}</span>
      {parts.slice(2).join('')}
    </>
  )
}

interface Props {
  items: PracticeItem[]
}

export function FlashcardDeck({ items }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
  const isSwiping = useRef(false)

  const item = items[currentIndex]

  function advance() {
    setCurrentIndex(prev => (prev + 1) % items.length)
    setIsFlipped(false)
    setIsNoteExpanded(false)
  }

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

  function handleCardClick() {
    if (isSwiping.current) return
    if (isFlipped) setIsNoteExpanded(false)
    setIsFlipped(prev => !prev)
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-6 select-none">
      {/* Progress counter */}
      <p className="text-xs text-gray-500 mb-4">Card {currentIndex + 1} of {items.length}</p>

      <div
        {...handlers}
        data-testid="flashcard-card"
        onClick={handleCardClick}
        style={{ touchAction: 'pan-y' }}
        className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 min-h-[260px] flex flex-col justify-between cursor-pointer"
      >
        {!isFlipped ? (
          <div data-testid="flashcard-front" className="flex flex-col flex-1 justify-between">
            <p className="text-base text-gray-100 leading-relaxed text-center flex-1 flex items-center justify-center">
              {renderHighlighted(item.flashcard_front!, 'purple')}
            </p>
            <p className="text-xs text-gray-600 text-center mt-4">Tap to reveal Spanish</p>
          </div>
        ) : (
          <div data-testid="flashcard-back" className="flex flex-col flex-1 justify-between gap-4">
            <p className="text-base text-gray-100 leading-relaxed text-center flex-1 flex items-center justify-center">
              {renderHighlighted(item.flashcard_back!, 'green')}
            </p>
            {item.flashcard_note !== null && (
              <div className="bg-indigo-950 border border-indigo-900 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
                    <span className="text-red-400 line-through truncate">{item.original}</span>
                    <span className="text-gray-500">→</span>
                    <span className="text-green-400 truncate">{item.correction ?? '—'}</span>
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
          </div>
        )}
      </div>

      {/* Hidden test seam for triggering advance in tests */}
      <button
        data-testid="advance-card"
        className="sr-only"
        onClick={e => { e.stopPropagation(); advance() }}
        tabIndex={-1}
        aria-hidden="true"
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — inert is a valid HTML attribute
        inert=""
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/components/FlashcardDeck.test.tsx
```
Expected: all tests pass.

- [ ] **Step 5: Run all tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/FlashcardDeck.tsx __tests__/components/FlashcardDeck.test.tsx
git commit -m "feat: add FlashcardDeck component with flip, swipe-advance, and collapsible note"
```

---

## Task 9: Flashcards Page

**Files:**
- Create: `app/flashcards/page.tsx`

No unit test for the page — it's a thin fetch + filter wrapper around `FlashcardDeck`. The component is tested separately and the fetch pattern is identical to `app/practice/page.tsx`.

> **Implementation note:** The spec places the progress counter (`Card X of N`) in the page, above `FlashcardDeck`. To achieve this without lifting state out of `FlashcardDeck`, the progress counter is rendered inside `FlashcardDeck` itself (above the swipeable card, outside the `{...handlers}` area). This is functionally identical — "above the card" in the page would require the page to track `currentIndex`, which adds unnecessary complexity.

- [ ] **Step 1: Create `app/flashcards/page.tsx`**

```tsx
// app/flashcards/page.tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
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
      <div className="flex items-center px-4 pt-4 pb-2">
        <Link href="/" className="text-gray-400 hover:text-gray-200 text-sm">
          ← Back
        </Link>
      </div>

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

      {!loading && items.length > 0 && (
        <FlashcardDeck items={items} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/flashcards/page.tsx components/FlashcardDeck.tsx
git commit -m "feat: add flashcards review page"
```

---

## Task 10: BottomNav — Add Flashcards Tab

**Files:**
- Modify: `components/BottomNav.tsx`
- Modify: `__tests__/components/BottomNav.test.tsx`

- [ ] **Step 1: Write the failing tests**

Update `__tests__/components/BottomNav.test.tsx`:

Replace `'renders four nav links including Insights'` with:
```ts
it('renders five nav links including Flashcards', () => {
  mockPathname.mockReturnValue('/')
  render(<BottomNav />)
  expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /practice/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /flashcards/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /insights/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
})
```

Add a new test:
```ts
it('marks Flashcards as active on "/flashcards"', () => {
  mockPathname.mockReturnValue('/flashcards')
  render(<BottomNav />)
  expect(screen.getByRole('link', { name: /flashcards/i })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/BottomNav.test.tsx
```
Expected: FAIL — "five nav links" test fails, Flashcards link doesn't exist.

- [ ] **Step 3: Add Flashcards tab to `components/BottomNav.tsx`**

In the `TABS` array, insert between Practice and Insights:
```ts
{
  href: '/flashcards',
  label: 'Flashcards',
  exact: false,
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="w-6 h-6" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
},
```

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/components/BottomNav.test.tsx
```
Expected: all tests pass.

- [ ] **Step 5: Run all tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/BottomNav.tsx __tests__/components/BottomNav.test.tsx
git commit -m "feat: add Flashcards tab to bottom navigation"
```

---

## Done

All tasks complete. The three features — filter collapse, session list redesign, and flashcard review — are built, tested, and committed. Run `npm run build` to confirm no TypeScript errors before deploying.

```bash
npm run build
npm run lint
```
