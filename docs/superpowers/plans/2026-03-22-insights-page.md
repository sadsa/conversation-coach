# Insights Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/insights` page that ranks Spanish mistake sub-categories by frequency and trend across all sessions, with expandable cards showing real examples from the user's own transcripts.

**Architecture:** Claude tags each annotation with a `sub_category` from a fixed taxonomy at analysis time. Four Postgres RPC functions aggregate the data server-side. A Next.js server component fetches all data at request time and passes it to a `'use client'` `InsightsCardList` component that handles expand/collapse. The Practice page gains a silent sub-category filter driven by a URL param.

**Tech Stack:** Next.js 14 App Router (server + client components), Supabase Postgres RPC (supabase-js v2), TypeScript, Tailwind CSS, Vitest + React Testing Library

**Worktree:** `/Users/entelect-jbiddick/Projects/conversation-coach/.worktrees/feature/insights-page`

All `npm test` and `npm run build` commands should be run from the worktree path above.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `supabase/migrations/20260322000000_add_sub_category.sql` | Add sub_category column to annotations + practice_items |
| Create | `supabase/migrations/20260322000001_insights_rpc.sql` | Four RPC functions for insights queries |
| Modify | `lib/types.ts` | Add `SUB_CATEGORIES`, `SubCategory`, `SUB_CATEGORY_TYPE_MAP`; update `Annotation` + `PracticeItem` |
| Modify | `lib/claude.ts` | Add `sub_category` to `ClaudeAnnotation`; update system prompt |
| Modify | `lib/pipeline.ts` | Validate + insert `sub_category` |
| Modify | `components/AnnotationCard.tsx` | Add `sub_category` to POST body |
| Create | `lib/insights.ts` | `computeTrend()`, `fetchInsightsData()` — all data fetching + business logic |
| Modify | `components/BottomNav.tsx` | Add Insights tab (4th tab) |
| Create | `app/insights/page.tsx` | Server component — fetches data, renders page shell |
| Create | `components/InsightsCardList.tsx` | `'use client'` — expand/collapse cards, examples, strengths chips |
| Modify | `app/practice/page.tsx` | Read `?sub_category` param, pass to PracticeList |
| Modify | `components/PracticeList.tsx` | Add `initialSubCategory` prop + `subCategoryFilter` state |
| Modify | `__tests__/lib/pipeline.test.ts` | Add sub_category validation tests |
| Modify | `__tests__/components/AnnotationCard.test.tsx` | Assert sub_category in POST body |
| Modify | `__tests__/components/BottomNav.test.tsx` | Assert Insights tab exists |
| Create | `__tests__/lib/insights.test.ts` | Unit tests for `computeTrend()` |
| Create | `__tests__/components/InsightsCardList.test.tsx` | Render + interaction tests |
| Modify | `__tests__/components/PracticeList.test.tsx` | Add sub-category filter tests |

---

## Task 1: DB Migration — sub_category columns

**Files:**
- Create: `supabase/migrations/20260322000000_add_sub_category.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260322000000_add_sub_category.sql
ALTER TABLE annotations
  ADD COLUMN IF NOT EXISTS sub_category text NOT NULL DEFAULT 'other';

ALTER TABLE practice_items
  ADD COLUMN IF NOT EXISTS sub_category text NOT NULL DEFAULT 'other';
```

- [ ] **Step 2: Apply the migration locally**

```bash
cd /Users/entelect-jbiddick/Projects/conversation-coach/.worktrees/feature/insights-page
npx supabase db push
```

Expected: migration applies cleanly. Existing rows get `sub_category = 'other'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260322000000_add_sub_category.sql
git commit -m "feat: add sub_category column to annotations and practice_items"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add `SUB_CATEGORIES`, `SubCategory`, `SUB_CATEGORY_TYPE_MAP` and update interfaces**

In `lib/types.ts`, add after the existing type declarations:

```ts
export const SUB_CATEGORIES = [
  'verb-conjugation', 'subjunctive', 'gender-agreement', 'number-agreement',
  'ser-estar', 'por-para', 'tense-selection', 'article-usage', 'word-order',
  'vocabulary-choice', 'register', 'phrasing',
  'voseo', 'natural-expressions', 'fluency', 'other',
] as const

export type SubCategory = typeof SUB_CATEGORIES[number]

// Maps each non-other sub-category to its annotation type.
// Used in pipeline validation to catch Claude mis-classifications.
export const SUB_CATEGORY_TYPE_MAP: Partial<Record<SubCategory, AnnotationType>> = {
  'verb-conjugation': 'grammar',
  'subjunctive': 'grammar',
  'gender-agreement': 'grammar',
  'number-agreement': 'grammar',
  'ser-estar': 'grammar',
  'por-para': 'grammar',
  'tense-selection': 'grammar',
  'article-usage': 'grammar',
  'word-order': 'grammar',
  'vocabulary-choice': 'naturalness',
  'register': 'naturalness',
  'phrasing': 'naturalness',
  'voseo': 'strength',
  'natural-expressions': 'strength',
  'fluency': 'strength',
}

// Human-readable display names for each sub-category key
export const SUB_CATEGORY_DISPLAY: Record<SubCategory, string> = {
  'verb-conjugation': 'Verb conjugation',
  'subjunctive': 'Subjunctive',
  'gender-agreement': 'Gender agreement',
  'number-agreement': 'Number agreement',
  'ser-estar': 'Ser / Estar',
  'por-para': 'Por / Para',
  'tense-selection': 'Tense selection',
  'article-usage': 'Article usage',
  'word-order': 'Word order',
  'vocabulary-choice': 'Vocabulary choice',
  'register': 'Register',
  'phrasing': 'Phrasing',
  'voseo': 'Voseo',
  'natural-expressions': 'Natural expressions',
  'fluency': 'Fluency',
  'other': 'Other',
}
```

Add `sub_category: SubCategory` to the `Annotation` interface (after `explanation`):

```ts
export interface Annotation {
  id: string
  session_id: string
  segment_id: string
  type: AnnotationType
  original: string
  start_char: number
  end_char: number
  correction: string | null
  explanation: string
  sub_category: SubCategory
}
```

Add `sub_category: SubCategory` to the `PracticeItem` interface (after `explanation`):

```ts
export interface PracticeItem {
  id: string
  session_id: string
  annotation_id: string | null
  type: AnnotationType
  original: string
  correction: string | null
  explanation: string
  sub_category: SubCategory
  reviewed: boolean
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Run tests — expect TypeScript errors from stale test fixtures**

```bash
npm test 2>&1 | tail -30
```

Expected: tests that create `Annotation` or `PracticeItem` fixtures without `sub_category` will show TypeScript errors. Fix each failing test file by adding `sub_category: 'other'` to those fixtures. The tests themselves don't need new assertions yet — just update the fixture objects.

- [ ] **Step 3: Run tests again — should be green**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts __tests__/
git commit -m "feat: add SubCategory type, display map, and update Annotation/PracticeItem interfaces"
```

---

## Task 3: Claude prompt — add sub_category

**Files:**
- Modify: `lib/claude.ts`
- Modify: `__tests__/lib/claude.test.ts`

- [ ] **Step 1: Write a failing test for sub_category in the response**

Open `__tests__/lib/claude.test.ts`. Find the existing test that asserts on annotations. Add a new test:

```ts
it('returns sub_category field on each annotation', async () => {
  const mockResponse = {
    content: [{
      type: 'text',
      text: JSON.stringify({
        title: 'Test',
        annotations: [{
          segment_id: 'seg-1',
          type: 'grammar',
          sub_category: 'subjunctive',
          original: 'vengas',
          start_char: 0,
          end_char: 6,
          correction: 'venís',
          explanation: 'Voseo subjunctive form.',
        }],
      }),
    }],
  }
  vi.mocked(client.messages.create).mockResolvedValueOnce(mockResponse as never)
  const result = await analyseUserTurns([{ id: 'seg-1', text: 'vengas' }], null)
  expect(result.annotations[0].sub_category).toBe('subjunctive')
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- __tests__/lib/claude.test.ts 2>&1 | tail -20
```

Expected: FAIL — `sub_category` is not on the `ClaudeAnnotation` interface.

- [ ] **Step 3: Update `ClaudeAnnotation` interface and system prompt in `lib/claude.ts`**

Update the `ClaudeAnnotation` interface to add `sub_category`:

```ts
export interface ClaudeAnnotation {
  segment_id: string
  type: 'grammar' | 'naturalness' | 'strength'
  sub_category: string   // validated downstream in pipeline.ts
  original: string
  start_char: number
  end_char: number
  correction: string | null
  explanation: string
}
```

Update `SYSTEM_PROMPT` — add to the per-annotation instructions (after the `"explanation"` line):

```
- "sub_category": classify into exactly one of these categories (use "other" if nothing fits):
  Grammar: "verb-conjugation", "subjunctive", "gender-agreement", "number-agreement", "ser-estar", "por-para", "tense-selection", "article-usage", "word-order"
  Naturalness: "vocabulary-choice", "register", "phrasing"
  Strength: "voseo", "natural-expressions", "fluency"
```

Update the JSON shape description at the end of the prompt to include `"sub_category"`:

```
Respond ONLY with a JSON object with this exact shape: { "title": string, "annotations": [{ "segment_id", "type", "sub_category", "original", "start_char", "end_char", "correction", "explanation" }] }. No other text.
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- __tests__/lib/claude.test.ts 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/claude.ts __tests__/lib/claude.test.ts
git commit -m "feat: add sub_category to Claude prompt and ClaudeAnnotation interface"
```

---

## Task 4: Pipeline — validate and insert sub_category

**Files:**
- Modify: `lib/pipeline.ts`
- Modify: `__tests__/lib/pipeline.test.ts`

- [ ] **Step 1: Write a failing test for sub_category validation**

In `__tests__/lib/pipeline.test.ts`, add two tests after the existing ones:

```ts
it('inserts sub_category from Claude annotation', async () => {
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
          data: [{ id: 'seg-1', speaker: 'A', text: 'cuando vengas' }], error: null,
        }) }) }),
      }
      if (table === 'annotations') return { insert: insertAnnotationsMock }
      return {}
    }),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test', annotations: [
    { segment_id: 'seg-1', type: 'grammar', sub_category: 'subjunctive', original: 'vengas', start_char: 8, end_char: 14, correction: 'venís', explanation: 'Voseo form.' },
  ] })
  vi.mocked(deleteObject).mockResolvedValue(undefined)

  await runClaudeAnalysis('sess-1')

  const insertedRows = insertAnnotationsMock.mock.calls[0][0]
  expect(insertedRows[0].sub_category).toBe('subjunctive')
})

it('resets sub_category to "other" when value is not in the taxonomy', async () => {
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
  vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test', annotations: [
    { segment_id: 'seg-1', type: 'grammar', sub_category: 'made-up-category', original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.' },
  ] })
  vi.mocked(deleteObject).mockResolvedValue(undefined)

  await runClaudeAnalysis('sess-2')

  const insertedRows = insertAnnotationsMock.mock.calls[0][0]
  expect(insertedRows[0].sub_category).toBe('other')
})

it('resets sub_category to "other" when type mismatches the taxonomy', async () => {
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
          data: [{ id: 'seg-1', speaker: 'A', text: 'voseo example' }], error: null,
        }) }) }),
      }
      if (table === 'annotations') return { insert: insertAnnotationsMock }
      return {}
    }),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  // 'voseo' belongs to 'strength', not 'grammar' — should be reset to 'other'
  vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test', annotations: [
    { segment_id: 'seg-1', type: 'grammar', sub_category: 'voseo', original: 'voseo', start_char: 0, end_char: 5, correction: null, explanation: 'Good voseo.' },
  ] })
  vi.mocked(deleteObject).mockResolvedValue(undefined)

  await runClaudeAnalysis('sess-3')

  const insertedRows = insertAnnotationsMock.mock.calls[0][0]
  expect(insertedRows[0].sub_category).toBe('other')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/lib/pipeline.test.ts 2>&1 | tail -20
```

Expected: FAIL — `sub_category` not in insert object.

- [ ] **Step 3: Update `lib/pipeline.ts`**

Add the import at the top:

```ts
import { SUB_CATEGORIES, SUB_CATEGORY_TYPE_MAP } from '@/lib/types'
```

In the `correctedAnnotations` map block, after the existing offset correction logic, add sub_category validation:

```ts
const correctedAnnotations = annotations.map(a => {
  const segText = segmentTextById.get(a.segment_id)
  let corrected = { ...a }

  // Correct character offsets
  if (segText && segText.slice(corrected.start_char, corrected.end_char) !== corrected.original) {
    const idx = segText.indexOf(corrected.original)
    if (idx !== -1) {
      corrected = { ...corrected, start_char: idx, end_char: idx + corrected.original.length }
    }
  }

  // Validate sub_category: must be in taxonomy and match the annotation type
  const rawSubCat = (corrected as typeof corrected & { sub_category?: string }).sub_category
  const isValidKey = typeof rawSubCat === 'string' && (SUB_CATEGORIES as readonly string[]).includes(rawSubCat)
  const expectedType = isValidKey ? SUB_CATEGORY_TYPE_MAP[rawSubCat as keyof typeof SUB_CATEGORY_TYPE_MAP] : undefined
  const subCategory = (isValidKey && (expectedType === undefined || expectedType === corrected.type))
    ? rawSubCat
    : 'other'

  return { ...corrected, sub_category: subCategory }
})
```

Update the annotation insert to include `sub_category`:

```ts
correctedAnnotations.map(a => ({
  session_id: sessionId,
  segment_id: a.segment_id,
  type: a.type,
  original: a.original,
  start_char: a.start_char,
  end_char: a.end_char,
  correction: a.correction,
  explanation: a.explanation,
  sub_category: a.sub_category,
}))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/lib/pipeline.test.ts 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Run all tests**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline.ts __tests__/lib/pipeline.test.ts
git commit -m "feat: validate and insert sub_category in pipeline"
```

---

## Task 5: AnnotationCard — add sub_category to POST body

**Files:**
- Modify: `components/AnnotationCard.tsx`
- Modify: `__tests__/components/AnnotationCard.test.tsx`

- [ ] **Step 1: Write a failing test asserting sub_category in POST body**

In `__tests__/components/AnnotationCard.test.tsx`, add `sub_category: 'subjunctive'` to the `grammarAnnotation` fixture, then add a new test:

```ts
// Update fixture:
const grammarAnnotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', sub_category: 'subjunctive',
  original: 'Yo fui', start_char: 0, end_char: 6,
  correction: 'Fui', explanation: 'Drop the subject pronoun.',
}
const strengthAnnotation: Annotation = {
  id: 'ann-2', session_id: 's1', segment_id: 'seg-1',
  type: 'strength', sub_category: 'voseo',
  original: 'buenísimo', start_char: 0, end_char: 9,
  correction: null, explanation: 'Great superlative usage.',
}

// New test:
it('includes sub_category in POST body when adding to practice', async () => {
  let capturedBody: Record<string, unknown> = {}
  vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
    capturedBody = JSON.parse((init as RequestInit).body as string)
    return { ok: true } as Response
  })
  render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
  await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
  expect(capturedBody.sub_category).toBe('subjunctive')
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `sub_category` not in body.

- [ ] **Step 3: Update `AnnotationCard.tsx` `handleAdd`**

Add `sub_category: annotation.sub_category` to the JSON body:

```ts
body: JSON.stringify({
  session_id: sessionId,
  annotation_id: annotation.id,
  type: annotation.type,
  original: annotation.original,
  correction: annotation.correction,
  explanation: annotation.explanation,
  sub_category: annotation.sub_category,
}),
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/AnnotationCard.tsx __tests__/components/AnnotationCard.test.tsx
git commit -m "feat: include sub_category in practice item POST body"
```

---

## Task 6: DB Migration — Insights RPC functions

**Files:**
- Create: `supabase/migrations/20260322000001_insights_rpc.sql`

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/20260322000001_insights_rpc.sql

-- Returns all-time error/naturalness counts grouped by sub_category
CREATE OR REPLACE FUNCTION get_subcategory_error_counts()
RETURNS TABLE (
  sub_category text,
  type text,
  total_count bigint,
  session_count bigint
) AS $$
  SELECT
    a.sub_category,
    a.type::text,
    COUNT(*) AS total_count,
    COUNT(DISTINCT a.session_id) AS session_count
  FROM annotations a
  JOIN sessions s ON a.session_id = s.id
  WHERE s.status = 'ready'
    AND a.type IN ('grammar', 'naturalness')
    AND a.sub_category != 'other'
  GROUP BY a.sub_category, a.type
  ORDER BY total_count DESC
$$ LANGUAGE sql STABLE;

-- Returns all-time strength counts grouped by sub_category
CREATE OR REPLACE FUNCTION get_subcategory_strength_counts()
RETURNS TABLE (
  sub_category text,
  total_count bigint,
  session_count bigint
) AS $$
  SELECT
    a.sub_category,
    COUNT(*) AS total_count,
    COUNT(DISTINCT a.session_id) AS session_count
  FROM annotations a
  JOIN sessions s ON a.session_id = s.id
  WHERE s.status = 'ready'
    AND a.type = 'strength'
    AND a.sub_category != 'other'
  GROUP BY a.sub_category
  ORDER BY total_count DESC
$$ LANGUAGE sql STABLE;

-- Returns per-session error counts and user turn counts for trend calculation
CREATE OR REPLACE FUNCTION get_subcategory_session_counts()
RETURNS TABLE (
  sub_category text,
  session_id uuid,
  created_at timestamptz,
  error_count bigint,
  user_turn_count bigint
) AS $$
  SELECT
    a.sub_category,
    a.session_id,
    s.created_at,
    COUNT(*) AS error_count,
    (
      SELECT COUNT(*) FROM transcript_segments ts
      WHERE ts.session_id = s.id
        AND ts.speaker = ANY(COALESCE(s.user_speaker_labels, ARRAY[]::text[]))
    ) AS user_turn_count
  FROM annotations a
  JOIN sessions s ON a.session_id = s.id
  WHERE s.status = 'ready'
    AND a.type IN ('grammar', 'naturalness')
    AND a.sub_category != 'other'
  GROUP BY a.sub_category, a.session_id, s.created_at, s.user_speaker_labels
  ORDER BY s.created_at DESC
$$ LANGUAGE sql STABLE;

-- Returns up to 2 example annotations per sub_category (most recent first)
CREATE OR REPLACE FUNCTION get_subcategory_examples()
RETURNS TABLE (
  sub_category text,
  original text,
  correction text,
  start_char int,
  end_char int,
  segment_text text,
  session_title text,
  session_created_at timestamptz
) AS $$
  SELECT DISTINCT ON (a.sub_category, row_num)
    a.sub_category,
    a.original,
    a.correction,
    a.start_char,
    a.end_char,
    ts.text AS segment_text,
    s.title AS session_title,
    s.created_at AS session_created_at
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY sub_category ORDER BY (
        SELECT created_at FROM sessions WHERE id = annotations.session_id
      ) DESC) AS row_num
    FROM annotations
    WHERE sub_category != 'other'
      AND type IN ('grammar', 'naturalness')
  ) a
  JOIN transcript_segments ts ON a.segment_id = ts.id
  JOIN sessions s ON a.session_id = s.id
  WHERE s.status = 'ready'
    AND a.row_num <= 2
  ORDER BY a.sub_category, a.row_num
$$ LANGUAGE sql STABLE;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: migration applies cleanly, four functions created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260322000001_insights_rpc.sql
git commit -m "feat: add insights RPC functions for sub-category aggregation"
```

---

## Task 7: Insights data fetching + trend logic

**Files:**
- Create: `lib/insights.ts`
- Create: `__tests__/lib/insights.test.ts`

- [ ] **Step 1: Write failing tests for `computeTrend`**

Create `__tests__/lib/insights.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeTrend } from '@/lib/insights'

describe('computeTrend (errors — lower is better)', () => {
  it('returns keep-practicing when both rates are 0', () => {
    expect(computeTrend(0, 0, 0, 0, 'error')).toBe('keep-practicing')
  })

  it('returns needs-attention when older_rate is 0 and recent_rate > 0 (new mistake)', () => {
    expect(computeTrend(3, 10, 0, 5, 'error')).toBe('needs-attention')
  })

  it('returns making-progress when recent_rate < older_rate * 0.8', () => {
    // older: 5/10 = 0.5, recent: 1/10 = 0.1 → well below 80% threshold
    expect(computeTrend(1, 10, 5, 10, 'error')).toBe('making-progress')
  })

  it('returns needs-attention when recent_rate > older_rate * 1.2', () => {
    // older: 1/10 = 0.1, recent: 5/10 = 0.5 → well above 120% threshold
    expect(computeTrend(5, 10, 1, 10, 'error')).toBe('needs-attention')
  })

  it('returns keep-practicing for rates within 80–120% band', () => {
    // older: 3/10 = 0.3, recent: 3/10 = 0.3 → exactly equal
    expect(computeTrend(3, 10, 3, 10, 'error')).toBe('keep-practicing')
  })

  it('treats rate as 0 when user_turns is 0', () => {
    // recent_user_turns = 0 → recent_rate = 0; older_rate = 3/10 → making-progress
    expect(computeTrend(0, 0, 3, 10, 'error')).toBe('making-progress')
  })
})

describe('computeTrend (strengths — higher is better)', () => {
  it('returns making-progress when older_rate is 0 and recent_rate > 0 (new strength)', () => {
    expect(computeTrend(3, 10, 0, 5, 'strength')).toBe('making-progress')
  })

  it('returns making-progress when recent_rate > older_rate * 1.2', () => {
    expect(computeTrend(5, 10, 1, 10, 'strength')).toBe('making-progress')
  })

  it('returns needs-attention when recent_rate < older_rate * 0.8', () => {
    expect(computeTrend(1, 10, 5, 10, 'strength')).toBe('needs-attention')
  })

  it('returns keep-practicing when both rates are 0', () => {
    expect(computeTrend(0, 0, 0, 0, 'strength')).toBe('keep-practicing')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm test -- __tests__/lib/insights.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/insights.ts` with `computeTrend` and `fetchInsightsData`**

```ts
// lib/insights.ts
import { createServerClient } from '@/lib/supabase-server'
import type { SubCategory } from '@/lib/types'

export type TrendResult = 'making-progress' | 'keep-practicing' | 'needs-attention'

/**
 * Compute trend for a single sub-category.
 * @param recentErrors   error count in recent sessions
 * @param recentTurns    user turn count in recent sessions
 * @param olderErrors    error count in older sessions
 * @param olderTurns     user turn count in older sessions
 * @param mode           'error' (lower is better) | 'strength' (higher is better)
 */
export function computeTrend(
  recentErrors: number,
  recentTurns: number,
  olderErrors: number,
  olderTurns: number,
  mode: 'error' | 'strength',
): TrendResult {
  const recentRate = recentTurns === 0 ? 0 : recentErrors / recentTurns
  const olderRate = olderTurns === 0 ? 0 : olderErrors / olderTurns

  if (mode === 'error') {
    if (recentRate === 0 && olderRate === 0) return 'keep-practicing'
    if (olderRate === 0 && recentRate > 0) return 'needs-attention'
    if (recentRate < olderRate * 0.8) return 'making-progress'
    if (recentRate > olderRate * 1.2) return 'needs-attention'
    return 'keep-practicing'
  } else {
    // strength: more is better
    if (recentRate === 0 && olderRate === 0) return 'keep-practicing'
    if (olderRate === 0 && recentRate > 0) return 'making-progress'
    if (recentRate > olderRate * 1.2) return 'making-progress'
    if (recentRate < olderRate * 0.8) return 'needs-attention'
    return 'keep-practicing'
  }
}

export interface FocusCard {
  subCategory: SubCategory
  type: 'grammar' | 'naturalness'
  displayName: string
  totalCount: number
  sessionCount: number
  trend: TrendResult | null  // null when < 4 sessions
  examples: ExampleAnnotation[]
}

export interface StrengthChip {
  subCategory: SubCategory
  totalCount: number
  trend: TrendResult | null
}

export interface ExampleAnnotation {
  original: string
  correction: string | null
  startChar: number
  endChar: number
  segmentText: string
  sessionTitle: string
  sessionCreatedAt: string
}

export interface InsightsData {
  totalReadySessions: number
  focusCards: FocusCard[]
  strengthChips: StrengthChip[]
}

export async function fetchInsightsData(): Promise<InsightsData> {
  const db = createServerClient()

  // Total ready sessions
  const { count: totalReadySessions } = await db
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ready')

  const total = totalReadySessions ?? 0

  // Query 1: error counts
  const { data: errorCounts } = await db.rpc('get_subcategory_error_counts')

  // Query 2: strength counts
  const { data: strengthCounts } = await db.rpc('get_subcategory_strength_counts')

  // Query 3: per-session counts (for trend)
  const showTrends = total >= 4
  let trendMap: Map<string, TrendResult> = new Map()

  if (showTrends) {
    const { data: sessionCounts } = await db.rpc('get_subcategory_session_counts')

    if (sessionCounts && sessionCounts.length > 0) {
      // Identify the 3 most recent session IDs
      const allSessionIds = [...new Set<string>((sessionCounts as { session_id: string }[]).map(r => r.session_id))]
      // Sessions are returned ordered by created_at DESC from the RPC
      const recentSessionIds = new Set(allSessionIds.slice(0, 3))

      // Group by sub_category
      const bySubCat = new Map<string, { recent: { errors: number; turns: number }; older: { errors: number; turns: number } }>()
      for (const row of sessionCounts as { sub_category: string; session_id: string; error_count: number; user_turn_count: number }[]) {
        if (!bySubCat.has(row.sub_category)) {
          bySubCat.set(row.sub_category, { recent: { errors: 0, turns: 0 }, older: { errors: 0, turns: 0 } })
        }
        const entry = bySubCat.get(row.sub_category)!
        const group = recentSessionIds.has(row.session_id) ? entry.recent : entry.older
        group.errors += Number(row.error_count)
        group.turns += Number(row.user_turn_count)
      }

      for (const [subCat, { recent, older }] of bySubCat) {
        trendMap.set(subCat, computeTrend(recent.errors, recent.turns, older.errors, older.turns, 'error'))
      }
    }
  }

  // Query 4: examples
  const { data: examplesRaw } = await db.rpc('get_subcategory_examples')
  const examplesBySubCat = new Map<string, ExampleAnnotation[]>()
  for (const row of (examplesRaw ?? []) as {
    sub_category: string; original: string; correction: string | null;
    start_char: number; end_char: number; segment_text: string;
    session_title: string; session_created_at: string
  }[]) {
    if (!examplesBySubCat.has(row.sub_category)) examplesBySubCat.set(row.sub_category, [])
    examplesBySubCat.get(row.sub_category)!.push({
      original: row.original,
      correction: row.correction,
      startChar: row.start_char,
      endChar: row.end_char,
      segmentText: row.segment_text,
      sessionTitle: row.session_title,
      sessionCreatedAt: row.session_created_at,
    })
  }

  // Build focus cards
  const { SUB_CATEGORY_DISPLAY } = await import('@/lib/types') // use static import at top of file instead if linter warns
  const focusCards: FocusCard[] = (errorCounts ?? []).map((row: { sub_category: string; type: string; total_count: number; session_count: number }) => ({
    subCategory: row.sub_category as SubCategory,
    type: row.type as 'grammar' | 'naturalness',
    displayName: SUB_CATEGORY_DISPLAY[row.sub_category as SubCategory] ?? row.sub_category,
    totalCount: Number(row.total_count),
    sessionCount: Number(row.session_count),
    trend: showTrends ? (trendMap.get(row.sub_category) ?? 'keep-practicing') : null,
    examples: examplesBySubCat.get(row.sub_category) ?? [],
  }))

  // Build strength chips (top 3)
  const strengthChips: StrengthChip[] = (strengthCounts ?? []).slice(0, 3).map((row: { sub_category: string; total_count: number }) => ({
    subCategory: row.sub_category as SubCategory,
    totalCount: Number(row.total_count),
    trend: null, // strength trend omitted for now (no strength session counts RPC)
  }))

  return { totalReadySessions: total, focusCards, strengthChips }
}
```

- [ ] **Step 4: Run the insights tests**

```bash
npm test -- __tests__/lib/insights.test.ts 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Run all tests**

```bash
npm test 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/insights.ts __tests__/lib/insights.test.ts
git commit -m "feat: add insights data fetching and trend calculation logic"
```

---

## Task 8: BottomNav — add Insights tab

**Files:**
- Modify: `components/BottomNav.tsx`
- Modify: `__tests__/components/BottomNav.test.tsx`

- [ ] **Step 1: Write a failing test**

In `__tests__/components/BottomNav.test.tsx`, **replace** the first test (`'renders three nav links with aria-labels'`) with the following, and add a second new test:

```ts
it('renders four nav links including Insights', () => {
  mockPathname.mockReturnValue('/')
  render(<BottomNav />)
  expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /practice/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /insights/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
})

it('marks Insights as active on "/insights"', () => {
  mockPathname.mockReturnValue('/insights')
  render(<BottomNav />)
  expect(screen.getByRole('link', { name: /insights/i })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- __tests__/components/BottomNav.test.tsx 2>&1 | tail -20
```

Expected: FAIL — "four nav links" test fails.

- [ ] **Step 3: Update `BottomNav.tsx`**

Add the Insights tab between Practice and Settings in the `TABS` array:

```ts
{
  href: '/insights',
  label: 'Insights',
  exact: false,
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="w-6 h-6" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
},
```

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/components/BottomNav.test.tsx 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add components/BottomNav.tsx __tests__/components/BottomNav.test.tsx
git commit -m "feat: add Insights tab to BottomNav"
```

---

## Task 9: InsightsCardList client component

**Files:**
- Create: `components/InsightsCardList.tsx`
- Create: `__tests__/components/InsightsCardList.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/InsightsCardList.test.tsx`:

```ts
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InsightsCardList } from '@/components/InsightsCardList'
import type { FocusCard, StrengthChip } from '@/lib/insights'

const mockCards: FocusCard[] = [
  {
    subCategory: 'subjunctive',
    type: 'grammar',
    displayName: 'Subjunctive',
    totalCount: 10,
    sessionCount: 4,
    trend: 'needs-attention',
    examples: [
      { original: 'cuando vengas', correction: 'cuando venís', startChar: 8, endChar: 14, segmentText: 'cuando vengas a casa', sessionTitle: 'Chat with Sofía', sessionCreatedAt: '2026-03-18T10:00:00Z' },
    ],
  },
  {
    subCategory: 'ser-estar',
    type: 'grammar',
    displayName: 'Ser / Estar',
    totalCount: 5,
    sessionCount: 2,
    trend: 'keep-practicing',
    examples: [],
  },
]

const mockStrengths: StrengthChip[] = [
  { subCategory: 'voseo', totalCount: 8, trend: null },
]

describe('InsightsCardList', () => {
  it('renders focus cards with rank, name, count, and trend', () => {
    render(<InsightsCardList focusCards={mockCards} strengthChips={mockStrengths} totalSessions={5} />)
    expect(screen.getByText('Subjunctive')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument()
    expect(screen.getByText('Ser / Estar')).toBeInTheDocument()
    expect(screen.getByText(/keep practicing/i)).toBeInTheDocument()
  })

  it('shows examples when a card is expanded', async () => {
    render(<InsightsCardList focusCards={mockCards} strengthChips={mockStrengths} totalSessions={5} />)
    // Examples are not visible initially
    expect(screen.queryByText('Chat with Sofía')).not.toBeInTheDocument()
    // Click the first card to expand
    await userEvent.click(screen.getByText('Subjunctive'))
    // Examples now visible
    expect(screen.getByText('Chat with Sofía')).toBeInTheDocument()
  })

  it('hides trend chips when totalSessions < 4', () => {
    const cardsNoTrend = mockCards.map(c => ({ ...c, trend: null }))
    render(<InsightsCardList focusCards={cardsNoTrend} strengthChips={mockStrengths} totalSessions={2} />)
    expect(screen.queryByText(/needs attention/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/keep practicing/i)).not.toBeInTheDocument()
  })

  it('renders strength chips', () => {
    render(<InsightsCardList focusCards={mockCards} strengthChips={mockStrengths} totalSessions={5} />)
    expect(screen.getByText('Voseo')).toBeInTheDocument()
    expect(screen.getByText(/8 times noted/i)).toBeInTheDocument()
  })

  it('omits strengths section when strengthChips is empty', () => {
    render(<InsightsCardList focusCards={mockCards} strengthChips={[]} totalSessions={5} />)
    expect(screen.queryByText(/what you.*re doing well/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- __tests__/components/InsightsCardList.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/InsightsCardList.tsx`**

```tsx
// components/InsightsCardList.tsx
'use client'
import { useState } from 'react'
import type { FocusCard, StrengthChip, TrendResult } from '@/lib/insights'
import { SUB_CATEGORY_DISPLAY } from '@/lib/types'
import type { SubCategory } from '@/lib/types'

const TREND_CONFIG: Record<TrendResult, { label: string; arrow: string; className: string }> = {
  'making-progress': { label: 'making progress', arrow: '↑', className: 'text-green-400' },
  'keep-practicing': { label: 'keep practicing', arrow: '→', className: 'text-gray-400' },
  'needs-attention': { label: 'needs attention', arrow: '↓', className: 'text-red-400' },
}

function underlineInText(segmentText: string, startChar: number, endChar: number, original: string): React.ReactNode {
  // Defensive: if offsets are out of bounds, just show original text
  const isValid = startChar >= 0 && endChar <= segmentText.length && startChar < endChar
  if (!isValid) return <span>«{original}»</span>
  return (
    <span>
      «{segmentText.slice(0, startChar)}
      <span className="underline decoration-red-400 decoration-2">{segmentText.slice(startChar, endChar)}</span>
      {segmentText.slice(endChar)}»
    </span>
  )
}

function TrendChip({ trend }: { trend: TrendResult }) {
  const { label, arrow, className } = TREND_CONFIG[trend]
  return (
    <span className={`text-xs font-semibold ${className}`}>
      {arrow} {label}
    </span>
  )
}

function FocusCardRow({ card, rank, totalSessions }: { card: FocusCard; rank: number; totalSessions: number }) {
  const [expanded, setExpanded] = useState(false)
  const showTrend = card.trend !== null

  return (
    <div
      className={`bg-gray-800 border rounded-xl p-4 cursor-pointer transition-colors ${expanded ? 'border-indigo-500' : 'border-gray-700 hover:border-gray-500'}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold w-5 flex-shrink-0 ${rank <= 2 ? 'text-red-400' : 'text-gray-500'}`}>{rank}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-100">{card.displayName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{card.type} · appears in {card.sessionCount} of {totalSessions} sessions</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-bold text-gray-100">{card.totalCount}</p>
          {showTrend && <TrendChip trend={card.trend!} />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-700" onClick={e => e.stopPropagation()}>
          {card.examples.length > 0 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-3">From your conversations</p>
              <div className="space-y-2">
                {card.examples.map((ex, i) => (
                  <div key={i} className="bg-gray-900 rounded-lg p-3">
                    <p className="text-sm text-gray-200">
                      {underlineInText(ex.segmentText, ex.startChar, ex.endChar, ex.original)}
                    </p>
                    {ex.correction && (
                      <p className="text-sm text-green-400 mt-1">→ {ex.correction}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      {ex.sessionTitle} · {new Date(ex.sessionCreatedAt).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
              <a
                href={`/practice?sub_category=${card.subCategory}`}
                className="block text-center text-sm text-indigo-400 mt-3"
                onClick={e => e.stopPropagation()}
              >
                See all {card.totalCount} examples →
              </a>
            </>
          ) : (
            <p className="text-sm text-gray-500">Add annotations to your practice list to see examples here.</p>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  focusCards: FocusCard[]
  strengthChips: StrengthChip[]
  totalSessions: number
}

export function InsightsCardList({ focusCards, strengthChips, totalSessions }: Props) {
  return (
    <div className="space-y-8">
      {/* Where to Focus */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Where to focus</h2>
        <div className="space-y-2">
          {focusCards.map((card, i) => (
            <FocusCardRow key={card.subCategory} card={card} rank={i + 1} totalSessions={totalSessions} />
          ))}
        </div>
      </section>

      {/* Strengths */}
      {strengthChips.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">What you&rsquo;re doing well</h2>
          <div className="flex gap-2 flex-wrap">
            {strengthChips.map(chip => (
              <div key={chip.subCategory} className="flex-1 min-w-[120px] bg-green-950 border border-green-800 rounded-xl p-3 text-center">
                <p className="text-sm font-semibold text-green-400">{SUB_CATEGORY_DISPLAY[chip.subCategory]}</p>
                <p className="text-xs text-green-700 mt-0.5">{chip.totalCount} times noted</p>
                {chip.trend && <TrendChip trend={chip.trend} />}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/components/InsightsCardList.test.tsx 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add components/InsightsCardList.tsx __tests__/components/InsightsCardList.test.tsx
git commit -m "feat: add InsightsCardList client component"
```

---

## Task 10: Insights page (server component)

**Files:**
- Create: `app/insights/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/insights/page.tsx
import { fetchInsightsData } from '@/lib/insights'
import { InsightsCardList } from '@/components/InsightsCardList'

export default async function InsightsPage() {
  const { totalReadySessions, focusCards, strengthChips } = await fetchInsightsData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Insights</h1>
        <p className="text-sm text-gray-400 mt-1">Patterns across all your sessions</p>
      </div>

      {totalReadySessions === 0 ? (
        <p className="text-gray-500 text-sm">
          Insights will appear once you&rsquo;ve recorded and analysed some conversations.
        </p>
      ) : focusCards.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No categorised mistakes yet. Re-analyse a session to generate insights.
        </p>
      ) : (
        <InsightsCardList
          focusCards={focusCards}
          strengthChips={strengthChips}
          totalSessions={totalReadySessions}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add app/insights/page.tsx
git commit -m "feat: add /insights server component page"
```

---

## Task 11: Practice page sub-category filter

**Files:**
- Modify: `app/practice/page.tsx`
- Modify: `components/PracticeList.tsx`
- Modify: `__tests__/components/PracticeList.test.tsx`

- [ ] **Step 1: Write failing test for sub-category filter in PracticeList**

In `__tests__/components/PracticeList.test.tsx`, find the existing test file and add:

```ts
it('filters to only items matching initialSubCategory', () => {
  const items: PracticeItem[] = [
    { id: '1', session_id: 's1', annotation_id: null, type: 'grammar', sub_category: 'subjunctive', original: 'vengas', correction: 'venís', explanation: '', reviewed: false, created_at: '', updated_at: '' },
    { id: '2', session_id: 's1', annotation_id: null, type: 'grammar', sub_category: 'ser-estar', original: 'Soy', correction: 'Estoy', explanation: '', reviewed: false, created_at: '', updated_at: '' },
  ]
  render(<PracticeList items={items} initialSubCategory="subjunctive" />)
  expect(screen.getByText('vengas')).toBeInTheDocument()
  expect(screen.queryByText('Soy')).not.toBeInTheDocument()
})

it('clears sub-category filter when a type tab is clicked', async () => {
  const items: PracticeItem[] = [
    { id: '1', session_id: 's1', annotation_id: null, type: 'grammar', sub_category: 'subjunctive', original: 'vengas', correction: 'venís', explanation: '', reviewed: false, created_at: '', updated_at: '' },
    { id: '2', session_id: 's1', annotation_id: null, type: 'naturalness', sub_category: 'phrasing', original: 'qué tal', correction: null, explanation: '', reviewed: false, created_at: '', updated_at: '' },
  ]
  render(<PracticeList items={items} initialSubCategory="subjunctive" />)
  // Initially filtered to subjunctive only
  expect(screen.getByText('vengas')).toBeInTheDocument()
  expect(screen.queryByText('qué tal')).not.toBeInTheDocument()
  // Click "All" tab
  await userEvent.click(screen.getByRole('button', { name: /all/i }))
  // Both items now visible
  expect(screen.getByText('vengas')).toBeInTheDocument()
  expect(screen.getByText('qué tal')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test -- __tests__/components/PracticeList.test.tsx 2>&1 | tail -20
```

Expected: FAIL — `initialSubCategory` prop not accepted.

- [ ] **Step 3: Update `PracticeList.tsx`**

Update the `Props` interface to add `initialSubCategory`:

```ts
interface Props {
  items: PracticeItem[]
  onDeleted?: (ids: string[]) => void
  initialSubCategory?: SubCategory
}
```

Add `import type { SubCategory } from '@/lib/types'` at the top.

Add `subCategoryFilter` state in the component, initialised from prop:

```ts
export function PracticeList({ items, onDeleted, initialSubCategory }: Props) {
  const [typeFilter, setTypeFilter] = useState<Filter>('all')
  const [subCategoryFilter, setSubCategoryFilter] = useState<SubCategory | null>(initialSubCategory ?? null)
  // ... existing state ...
```

Update the `filtered` computation to also apply `subCategoryFilter`:

```ts
const filtered = items.filter(item => {
  if (typeFilter !== 'all' && item.type !== typeFilter) return false
  if (subCategoryFilter !== null && item.sub_category !== subCategoryFilter) return false
  return true
})
```

Update the type tab click handler to clear the sub-category filter:

```ts
onClick={() => { setTypeFilter(f); setSubCategoryFilter(null) }}
```

- [ ] **Step 4: Replace the entire contents of `app/practice/page.tsx`** with the following:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'
import type { SubCategory } from '@/lib/types'
import { SUB_CATEGORIES } from '@/lib/types'

export default function PracticePage() {
  const [items, setItems] = useState<PracticeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Read sub_category param once on mount and immediately strip from URL
  const rawSubCat = searchParams.get('sub_category')
  const initialSubCategory: SubCategory | undefined =
    rawSubCat && (SUB_CATEGORIES as readonly string[]).includes(rawSubCat)
      ? (rawSubCat as SubCategory)
      : undefined

  useEffect(() => {
    if (rawSubCat) router.replace(pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setItems(data)
        else setError(data?.error ?? 'Failed to load practice items')
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading…</p>
  if (error) return <p className="text-red-400 text-sm">Error: {error}</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Practice Items</h1>
        <p className="text-sm text-gray-400 mt-1">
          {items.length} item{items.length !== 1 ? 's' : ''} across all sessions
        </p>
      </div>
      <PracticeList
        items={items}
        initialSubCategory={initialSubCategory}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
    </div>
  )
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- __tests__/components/PracticeList.test.tsx 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 6: Run all tests**

```bash
npm test 2>&1 | tail -10
```

Expected: all 116+ tests pass.

- [ ] **Step 7: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add app/practice/page.tsx components/PracticeList.tsx __tests__/components/PracticeList.test.tsx
git commit -m "feat: add sub-category filter to practice page via URL param"
```

---

## Final check

- [ ] **Run full test suite one last time**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass, 0 failures.

- [ ] **Run build**

```bash
npm run build 2>&1 | tail -10
```

Expected: build succeeds with no errors.
