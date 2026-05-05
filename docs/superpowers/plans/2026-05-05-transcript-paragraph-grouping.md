# Transcript Paragraph Grouping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break long transcript utterances into reader-friendly paragraphs by storing AssemblyAI's semantic paragraph offsets on each `transcript_segments` row and rendering one `<p>` block per paragraph.

**Architecture:** New `paragraph_breaks int[] not null default '{}'` column on `transcript_segments` holds character offsets within `segment.text`. The webhook calls `client.transcripts.paragraphs(jobId)` after the existing `getTranscript()` call, passes both into a new pure helper `mapParagraphsToSegments()` that maps each AssemblyAI paragraph to its containing utterance via timestamp + text search, and persists the resulting offsets alongside the existing segment fields. Render-side, `TranscriptView` splits each segment's text on those offsets and feeds each slice (with a per-paragraph `offsetBase`) into the existing `AnnotatedText` component, which subtracts the base before computing local offsets so annotation rendering stays correct.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase Postgres, AssemblyAI Node SDK (`assemblyai`), Vitest + React Testing Library. No new dependencies. Key files: `supabase/migrations/20260505000000_add_paragraph_breaks.sql` (new), `lib/types.ts`, `lib/assemblyai.ts`, `app/api/webhooks/assemblyai/route.ts`, `components/AnnotatedText.tsx`, `components/TranscriptView.tsx`.

**Spec:** `docs/superpowers/specs/2026-05-05-transcript-paragraph-grouping-design.md`

---

## File Map

| Action     | Path                                                          | Purpose                                                                        |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Create** | `supabase/migrations/20260505000000_add_paragraph_breaks.sql` | Add `paragraph_breaks int[] not null default '{}'` to `transcript_segments`    |
| **Modify** | `lib/types.ts`                                                | Add `paragraph_breaks: number[]` to `TranscriptSegment`                        |
| **Modify** | `lib/assemblyai.ts`                                           | Extend `ParsedSegment`; add `getParagraphs`, `TranscriptParagraph`, `mapParagraphsToSegments` |
| **Modify** | `__tests__/lib/assemblyai.test.ts`                            | Update existing `parseWebhookBody` test for new field; add `mapParagraphsToSegments` suite |
| **Modify** | `app/api/webhooks/assemblyai/route.ts`                        | Call `getParagraphs`, run mapper, persist `paragraph_breaks` in segment insert |
| **Modify** | `__tests__/api/webhook.test.ts`                               | Update existing mocks for new field; add paragraph-fetch happy/error tests     |
| **Modify** | `components/AnnotatedText.tsx`                                | Add optional `offsetBase` prop; subtract from annotation offsets when slicing  |
| **Modify** | `__tests__/components/AnnotatedText.test.tsx`                 | Add `offsetBase` rebasing test                                                 |
| **Modify** | `components/TranscriptView.tsx`                               | Add `splitIntoParagraphs`; render one `<p>` per paragraph with `space-y-3`    |
| **Modify** | `__tests__/components/TranscriptView.test.tsx`                | Update fixtures with `paragraph_breaks`; add multi-paragraph render test       |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260505000000_add_paragraph_breaks.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260505000000_add_paragraph_breaks.sql
--
-- Adds a paragraph_breaks column to transcript_segments to support
-- reader-friendly paragraph rendering of long monologue utterances.
--
-- Each value in the array is a character offset into segment.text where
-- a new paragraph begins after the first. The first paragraph always
-- starts at offset 0, which is implicit and NOT stored in the array.
-- An empty array means the segment renders as a single paragraph
-- (the legacy / pre-migration behaviour).
--
-- This is additive: existing rows pick up the default '{}' immediately
-- and continue to render as a single block — pixel-identical to today.
-- New sessions will have this populated by the webhook handler from
-- AssemblyAI's /v2/transcript/:id/paragraphs response.

alter table transcript_segments
  add column paragraph_breaks int[] not null default '{}';
```

- [ ] **Step 2: Apply migration to remote (linked Supabase)**

Run: `supabase db push`
Expected: success message; the new column appears in `transcript_segments`. Verify with:

```bash
supabase db query --linked "select column_name, data_type, is_nullable, column_default from information_schema.columns where table_name = 'transcript_segments' and column_name = 'paragraph_breaks';"
```

Expected output: one row, `data_type = ARRAY`, `is_nullable = NO`, `column_default = '{}'::integer[]`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260505000000_add_paragraph_breaks.sql
git commit -m "feat(db): add paragraph_breaks to transcript_segments"
```

---

## Task 2: TypeScript types update

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/assemblyai.ts:9-15` (extend `ParsedSegment`)
- Modify: `lib/assemblyai.ts:73-96` (have `parseWebhookBody` populate `paragraph_breaks: []`)

This task only updates types and ensures every existing path constructs `ParsedSegment` with the new (empty) field. It deliberately does NOT introduce paragraph fetching yet — that lands in Task 4. The mapper and the webhook integration follow.

- [ ] **Step 1: Add `paragraph_breaks` to `TranscriptSegment` in `lib/types.ts`**

Replace:

```typescript
export interface TranscriptSegment {
  id: string
  session_id: string
  speaker: 'A' | 'B'
  text: string
  start_ms: number
  end_ms: number
  position: number
}
```

with:

```typescript
export interface TranscriptSegment {
  id: string
  session_id: string
  speaker: 'A' | 'B'
  text: string
  start_ms: number
  end_ms: number
  position: number
  /**
   * Character offsets into `text` where each new paragraph begins after
   * the first. Empty = single paragraph. See migration
   * 20260505000000_add_paragraph_breaks.sql for full semantics.
   */
  paragraph_breaks: number[]
}
```

- [ ] **Step 2: Extend `ParsedSegment` in `lib/assemblyai.ts`**

Replace the existing interface:

```typescript
export interface ParsedSegment {
  speaker: string
  text: string
  start_ms: number
  end_ms: number
  position: number
}
```

with:

```typescript
export interface ParsedSegment {
  speaker: string
  text: string
  start_ms: number
  end_ms: number
  position: number
  /** Populated by mapParagraphsToSegments; '[]' for legacy or short utterances. */
  paragraph_breaks: number[]
}
```

- [ ] **Step 3: Have `parseWebhookBody` initialise `paragraph_breaks: []`**

In `lib/assemblyai.ts`, change the segment construction inside `parseWebhookBody` from:

```typescript
const segments: ParsedSegment[] = utterances.map((u, i) => ({
  speaker: u.speaker,
  text: u.text,
  start_ms: u.start,
  end_ms: u.end,
  position: i,
}))
```

to:

```typescript
const segments: ParsedSegment[] = utterances.map((u, i) => ({
  speaker: u.speaker,
  text: u.text,
  start_ms: u.start,
  end_ms: u.end,
  position: i,
  paragraph_breaks: [],
}))
```

- [ ] **Step 4: Update existing webhook test mocks to include `paragraph_breaks: []`**

In `__tests__/api/webhook.test.ts`, in the test `'sets status to identifying for 2-speaker transcription'` (around lines 73-79), change:

```typescript
vi.mocked(parseWebhookBody).mockReturnValue({
  speakerCount: 2,
  segments: [
    { speaker: 'A', text: 'Hola', start_ms: 0, end_ms: 500, position: 0 },
    { speaker: 'B', text: 'Buenos días', start_ms: 600, end_ms: 1200, position: 1 },
  ],
})
```

to:

```typescript
vi.mocked(parseWebhookBody).mockReturnValue({
  speakerCount: 2,
  segments: [
    { speaker: 'A', text: 'Hola', start_ms: 0, end_ms: 500, position: 0, paragraph_breaks: [] },
    { speaker: 'B', text: 'Buenos días', start_ms: 600, end_ms: 1200, position: 1, paragraph_breaks: [] },
  ],
})
```

In the test `'triggers Claude analysis immediately for single-speaker'` (around line 112), change:

```typescript
vi.mocked(parseWebhookBody).mockReturnValue({
  speakerCount: 1,
  segments: [{ speaker: 'A', text: 'Solo yo.', start_ms: 0, end_ms: 1000, position: 0 }],
})
```

to:

```typescript
vi.mocked(parseWebhookBody).mockReturnValue({
  speakerCount: 1,
  segments: [{ speaker: 'A', text: 'Solo yo.', start_ms: 0, end_ms: 1000, position: 0, paragraph_breaks: [] }],
})
```

- [ ] **Step 5: Update existing TranscriptView test fixture**

In `__tests__/components/TranscriptView.test.tsx`, the `segments` constant (lines 12-15) needs the new field on every row:

```typescript
const segments: TranscriptSegment[] = [
  { id: 'seg-1', session_id: 's1', speaker: 'A', text: 'Yo fui al mercado.', start_ms: 0, end_ms: 2000, position: 0, paragraph_breaks: [] },
  { id: 'seg-2', session_id: 's1', speaker: 'B', text: '¿Qué compraste?', start_ms: 2500, end_ms: 4000, position: 1, paragraph_breaks: [] },
]
```

- [ ] **Step 6: Update `parseWebhookBody` test to assert the new field**

In `__tests__/lib/assemblyai.test.ts`, in the test `'extracts segments and speaker count from AssemblyAI transcript'`, extend the `toMatchObject` assertion (around line 19-25):

```typescript
expect(result.segments[0]).toMatchObject({
  speaker: 'A',
  text: 'Hola, ¿cómo estás?',
  start_ms: 0,
  end_ms: 2000,
  position: 0,
  paragraph_breaks: [],
})
```

- [ ] **Step 7: Run tests — should compile and pass**

Run: `npm test -- __tests__/lib/assemblyai.test.ts __tests__/api/webhook.test.ts __tests__/components/TranscriptView.test.tsx`
Expected: all tests pass. The wider suite should also still pass:

Run: `npm test`
Expected: full green.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/assemblyai.ts __tests__/lib/assemblyai.test.ts __tests__/api/webhook.test.ts __tests__/components/TranscriptView.test.tsx
git commit -m "feat(types): add paragraph_breaks field to TranscriptSegment + ParsedSegment"
```

---

## Task 3: `mapParagraphsToSegments` pure helper (TDD)

**Files:**
- Modify: `lib/assemblyai.ts` (add `TranscriptParagraph` type + `mapParagraphsToSegments` function)
- Modify: `__tests__/lib/assemblyai.test.ts` (add new `describe` block)

This is the algorithmic core — write tests first.

- [ ] **Step 1: Add the failing test suite**

Append the following to `__tests__/lib/assemblyai.test.ts`:

```typescript
import { mapParagraphsToSegments, type TranscriptParagraph } from '@/lib/assemblyai'
import type { ParsedSegment } from '@/lib/assemblyai'
import { log } from '@/lib/logger'

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

function seg(overrides: Partial<ParsedSegment> = {}): ParsedSegment {
  return {
    speaker: 'A',
    text: 'sample text',
    start_ms: 0,
    end_ms: 1000,
    position: 0,
    paragraph_breaks: [],
    ...overrides,
  }
}

function para(overrides: Partial<TranscriptParagraph> = {}): TranscriptParagraph {
  return {
    text: 'sample text',
    start: 0,
    end: 1000,
    confidence: 0.99,
    words: [],
    ...overrides,
  }
}

describe('mapParagraphsToSegments', () => {
  beforeEach(() => {
    vi.mocked(log.warn).mockClear()
  })

  it('returns empty paragraph_breaks when one paragraph fills one segment', () => {
    const segs = [seg({ text: 'Hola mundo entero.', start_ms: 0, end_ms: 1000 })]
    const paras = [para({ text: 'Hola mundo entero.', start: 0, end: 1000 })]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([])
  })

  it('records breaks at correct offsets when one segment contains three paragraphs', () => {
    // segment.text length: 49.
    // paragraph A: "First paragraph here." (chars 0-21)
    // paragraph B: " Second paragraph too." (chars 21-43)
    // paragraph C: " Last bit." (chars 43-53) — note +0 lead trim handled below
    const text = 'First paragraph here. Second paragraph too. Last bit.'
    const segs = [seg({ text, start_ms: 0, end_ms: 9000 })]
    const paras = [
      para({ text: 'First paragraph here.', start: 0,    end: 3000 }),
      para({ text: 'Second paragraph too.', start: 3500, end: 6000 }),
      para({ text: 'Last bit.',             start: 6500, end: 9000 }),
    ]
    const out = mapParagraphsToSegments(segs, paras)
    // First paragraph at 0 is implicit (not stored).
    // 'Second paragraph too.' begins at index 22 (after "First paragraph here. ").
    // 'Last bit.' begins at index 44 (after "First paragraph here. Second paragraph too. ").
    expect(out[0].paragraph_breaks).toEqual([22, 44])
  })

  it('attributes paragraphs to the correct segment by timestamp', () => {
    const segs = [
      seg({ text: 'Speaker A here. More A.', start_ms: 0,    end_ms: 5000, position: 0 }),
      seg({ text: 'Speaker B reply.',         start_ms: 5500, end_ms: 8000, position: 1, speaker: 'B' }),
    ]
    const paras = [
      para({ text: 'Speaker A here.',   start: 0,    end: 2000 }),
      para({ text: 'More A.',           start: 2500, end: 5000 }),
      para({ text: 'Speaker B reply.',  start: 5500, end: 8000 }),
    ]
    const out = mapParagraphsToSegments(segs, paras)
    // First segment: 'More A.' begins at index 16. 'Speaker A here.' implicit at 0.
    expect(out[0].paragraph_breaks).toEqual([16])
    // Second segment: only one paragraph, implicit at 0.
    expect(out[1].paragraph_breaks).toEqual([])
  })

  it('attributes a paragraph at a shared boundary timestamp to the EARLIER segment', () => {
    const segs = [
      seg({ text: 'Edge case.', start_ms: 0,    end_ms: 1000, position: 0 }),
      seg({ text: 'Next part.', start_ms: 1000, end_ms: 2000, position: 1 }),
    ]
    // Paragraph starts exactly at 1000 — falls within segment 0's [0, 1000] range
    // (inclusive end), so should attach to segment 0 by the "first match" rule.
    const paras = [
      para({ text: 'Edge case.', start: 0,    end: 500 }),
      para({ text: 'Next part.', start: 1000, end: 2000 }),
    ]
    const out = mapParagraphsToSegments(segs, paras)
    // Segment 0: 'Edge case.' at offset 0 (implicit), 'Next part.' is NOT in
    // segment 0's text — indexOf returns -1, paragraph skipped, log.warn fired.
    expect(out[0].paragraph_breaks).toEqual([])
    expect(out[1].paragraph_breaks).toEqual([])
    expect(log.warn).toHaveBeenCalledWith(
      'Paragraph text not found in segment text',
      expect.any(Object)
    )
  })

  it('skips paragraphs whose timestamps fall outside every segment range', () => {
    const segs = [seg({ text: 'Only segment.', start_ms: 0, end_ms: 1000 })]
    const paras = [
      para({ text: 'Only segment.', start: 0, end: 1000 }),
      para({ text: 'Stray.',        start: 5000, end: 6000 }),
    ]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([])
    expect(log.warn).toHaveBeenCalledWith(
      'Paragraph timestamp outside all segment ranges',
      expect.any(Object)
    )
  })

  it('skips a paragraph whose text is not found in the segment text', () => {
    const segs = [seg({ text: 'Hola mundo.', start_ms: 0, end_ms: 1000 })]
    const paras = [
      para({ text: 'Adiós mundo.', start: 0, end: 1000 }),  // text mismatch
    ]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([])
    expect(log.warn).toHaveBeenCalledWith(
      'Paragraph text not found in segment text',
      expect.any(Object)
    )
  })

  it('uses progressive search to disambiguate repeated paragraph text', () => {
    // Repeated phrase "OK." occurs three times. searchFrom must advance past
    // each successful match so consecutive paragraphs do not collapse onto
    // the same offset.
    const text = 'OK. OK. OK.'
    const segs = [seg({ text, start_ms: 0, end_ms: 3000 })]
    const paras = [
      para({ text: 'OK.', start: 0,    end: 1000 }),  // offset 0
      para({ text: 'OK.', start: 1000, end: 2000 }),  // offset 4
      para({ text: 'OK.', start: 2000, end: 3000 }),  // offset 8
    ]
    const out = mapParagraphsToSegments(segs, paras)
    expect(out[0].paragraph_breaks).toEqual([4, 8])
  })

  it('returns segments unmodified when paragraphs array is empty', () => {
    const segs = [seg({ text: 'Hola.', start_ms: 0, end_ms: 1000 })]
    const out = mapParagraphsToSegments(segs, [])
    expect(out[0].paragraph_breaks).toEqual([])
  })
})
```

- [ ] **Step 2: Run the new tests — they should fail at import time**

Run: `npm test -- __tests__/lib/assemblyai.test.ts`
Expected: failures with `mapParagraphsToSegments is not a function` or `Module '"@/lib/assemblyai"' has no exported member 'mapParagraphsToSegments'`.

- [ ] **Step 3: Implement `TranscriptParagraph` type and `mapParagraphsToSegments`**

Append to `lib/assemblyai.ts` (after `parseWebhookBody`):

```typescript
/** Subset of AssemblyAI's TranscriptParagraph response we actually use.
 *  Source: https://www.assemblyai.com/docs/api-reference/transcripts/get-paragraphs */
export interface TranscriptParagraph {
  text: string
  start: number
  end: number
  confidence: number
  words: Array<{ start: number; end: number; text: string }>
}

/**
 * Map AssemblyAI's transcript-level paragraphs back to per-segment character
 * offsets. Returns a NEW array of segments with `paragraph_breaks` populated
 * based on each paragraph's timestamp + text match within its containing
 * segment.
 *
 * Algorithm (per paragraph, in order):
 *   1. Find the first segment whose [start_ms, end_ms] (inclusive) contains
 *      paragraph.start. Boundary ties go to the earlier segment.
 *   2. If none, skip + warn ('Paragraph timestamp outside all segment ranges').
 *   3. Within that segment's text, indexOf(paragraph.text) starting from a
 *      per-segment cursor that advances past each successful match.
 *   4. If indexOf returns -1, skip + warn ('Paragraph text not found in
 *      segment text'); do NOT advance the cursor.
 *   5. If offset > 0, append to that segment's paragraph_breaks. Offset 0 is
 *      the implicit first paragraph and is not stored.
 *   6. Validate per segment after processing: offsets must be strictly > 0,
 *      < text.length, and strictly monotonically increasing. Throws otherwise.
 */
export function mapParagraphsToSegments(
  segments: ParsedSegment[],
  paragraphs: TranscriptParagraph[],
): ParsedSegment[] {
  // Clone so we don't mutate the input.
  const out: ParsedSegment[] = segments.map(s => ({ ...s, paragraph_breaks: [] }))
  // Per-segment cursor for progressive indexOf search.
  const cursors = new Array<number>(out.length).fill(0)

  for (const p of paragraphs) {
    const segIndex = out.findIndex(s => s.start_ms <= p.start && p.start <= s.end_ms)
    if (segIndex === -1) {
      log.warn('Paragraph timestamp outside all segment ranges', {
        paragraphStart: p.start,
        paragraphTextSample: p.text.slice(0, 40),
      })
      continue
    }

    const segment = out[segIndex]
    const offset = segment.text.indexOf(p.text, cursors[segIndex])
    if (offset === -1) {
      log.warn('Paragraph text not found in segment text', {
        segmentPosition: segment.position,
        paragraphTextSample: p.text.slice(0, 40),
      })
      continue
    }

    if (offset > 0) {
      segment.paragraph_breaks.push(offset)
    }
    cursors[segIndex] = offset + p.text.length
  }

  // Per-segment validation.
  for (const s of out) {
    let last = 0
    for (const b of s.paragraph_breaks) {
      if (b <= 0 || b >= s.text.length) {
        throw new Error(
          `mapParagraphsToSegments: break ${b} out of range for segment text length ${s.text.length} (position ${s.position})`,
        )
      }
      if (b <= last) {
        throw new Error(
          `mapParagraphsToSegments: non-monotonic break ${b} after ${last} (position ${s.position})`,
        )
      }
      last = b
    }
  }

  return out
}
```

Note: this requires importing `log` if not already imported. Check the top of `lib/assemblyai.ts` — `import { log } from '@/lib/logger'` should already be there.

- [ ] **Step 4: Run the new tests — should pass**

Run: `npm test -- __tests__/lib/assemblyai.test.ts`
Expected: all tests in the file pass, including the new `mapParagraphsToSegments` describe block.

- [ ] **Step 5: Commit**

```bash
git add lib/assemblyai.ts __tests__/lib/assemblyai.test.ts
git commit -m "feat(assemblyai): add mapParagraphsToSegments helper"
```

---

## Task 4: `getParagraphs` SDK wrapper

**Files:**
- Modify: `lib/assemblyai.ts`

A thin wrapper analogous to `getTranscript`. No dedicated unit test — it's covered by the webhook integration test in Task 5.

- [ ] **Step 1: Add the wrapper function**

Append to `lib/assemblyai.ts` (after `getTranscript`):

```typescript
/** Fetch the speech-aware paragraph grouping for a completed job. */
export async function getParagraphs(jobId: string): Promise<TranscriptParagraph[]> {
  const client = getClient()
  const { paragraphs } = await client.transcripts.paragraphs(jobId)
  return paragraphs as TranscriptParagraph[]
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/assemblyai.ts
git commit -m "feat(assemblyai): add getParagraphs SDK wrapper"
```

---

## Task 5: Wire paragraph fetch into webhook (TDD)

**Files:**
- Modify: `app/api/webhooks/assemblyai/route.ts`
- Modify: `__tests__/api/webhook.test.ts`

The webhook now calls `getParagraphs` after `parseWebhookBody`, hands both into `mapParagraphsToSegments`, and persists the resulting `paragraph_breaks` alongside other segment fields. A failure on `getParagraphs` puts the session into the existing `transcribing` error state.

- [ ] **Step 1: Add the new failing tests**

In `__tests__/api/webhook.test.ts`, update the top mock declaration and imports. Replace:

```typescript
vi.mock('@/lib/assemblyai', () => ({ parseWebhookBody: vi.fn(), getTranscript: vi.fn(), WEBHOOK_AUTH_HEADER_NAME: 'X-Webhook-Secret' }))
```

with:

```typescript
vi.mock('@/lib/assemblyai', () => ({
  parseWebhookBody: vi.fn(),
  getTranscript: vi.fn(),
  getParagraphs: vi.fn(),
  mapParagraphsToSegments: vi.fn(),
  WEBHOOK_AUTH_HEADER_NAME: 'X-Webhook-Secret',
}))
```

And update the imports below the mocks:

```typescript
import { parseWebhookBody, getTranscript, getParagraphs, mapParagraphsToSegments } from '@/lib/assemblyai'
```

In the `beforeEach` block, default-mock the new functions to return empty paragraph data so existing tests continue to pass:

```typescript
beforeEach(() => {
  process.env.ASSEMBLYAI_WEBHOOK_SECRET = WEBHOOK_SECRET
  vi.mocked(getTranscript).mockResolvedValue({} as Record<string, unknown>)
  vi.mocked(getParagraphs).mockResolvedValue([])
  // Default: mapper passes segments through unchanged.
  vi.mocked(mapParagraphsToSegments).mockImplementation((segs) => segs)
})
```

Add two new tests at the end of the `describe('POST /api/webhooks/assemblyai', ...)` block:

```typescript
it('persists paragraph_breaks from mapParagraphsToSegments in the segment insert', async () => {
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const insertMock = vi.fn().mockResolvedValue({ error: null })
  const mockDb = {
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
        }),
      }),
      update: updateMock,
      insert: insertMock,
    })),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  vi.mocked(parseWebhookBody).mockReturnValue({
    speakerCount: 2,
    segments: [
      { speaker: 'A', text: 'Una larga monólogo. Con dos partes.', start_ms: 0, end_ms: 5000, position: 0, paragraph_breaks: [] },
    ],
  })
  vi.mocked(getParagraphs).mockResolvedValue([
    { text: 'Una larga monólogo.', start: 0, end: 2000, confidence: 0.95, words: [] },
    { text: 'Con dos partes.',     start: 2500, end: 5000, confidence: 0.95, words: [] },
  ])
  // Mock the mapper to return the segment with a break recorded — exact value
  // doesn't matter to this test, just that whatever the mapper produces flows
  // into the insert.
  vi.mocked(mapParagraphsToSegments).mockReturnValue([
    { speaker: 'A', text: 'Una larga monólogo. Con dos partes.', start_ms: 0, end_ms: 5000, position: 0, paragraph_breaks: [20] },
  ])

  const { POST } = await import('@/app/api/webhooks/assemblyai/route')
  const req = requestWithSecret({ transcript_id: 'job-with-paragraphs', status: 'completed', utterances: [] })
  await POST(req)

  expect(insertMock).toHaveBeenCalledWith([
    expect.objectContaining({
      session_id: 'session-1',
      paragraph_breaks: [20],
    }),
  ])
})

it('marks session as transcribing-error when getParagraphs throws', async () => {
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const insertMock = vi.fn().mockResolvedValue({ error: null })
  const mockDb = {
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
        }),
      }),
      update: updateMock,
      insert: insertMock,
    })),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  vi.mocked(parseWebhookBody).mockReturnValue({
    speakerCount: 1,
    segments: [{ speaker: 'A', text: 'Hola.', start_ms: 0, end_ms: 1000, position: 0, paragraph_breaks: [] }],
  })
  vi.mocked(getParagraphs).mockRejectedValue(new Error('AssemblyAI 503'))

  const { POST } = await import('@/app/api/webhooks/assemblyai/route')
  const req = requestWithSecret({ transcript_id: 'failing-job', status: 'completed', utterances: [] })
  const res = await POST(req)

  expect(res.status).toBe(200)
  expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
    status: 'error',
    error_stage: 'transcribing',
  }))
  // Crucially, segments are NOT inserted on paragraph-fetch failure.
  expect(insertMock).not.toHaveBeenCalled()
  expect(vi.mocked(runClaudeAnalysis)).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the new tests — they should fail**

Run: `npm test -- __tests__/api/webhook.test.ts`
Expected: the two new tests fail (the route doesn't yet call `getParagraphs` or `mapParagraphsToSegments`). The pre-existing four tests should still pass thanks to the default mocks added in step 1.

- [ ] **Step 3: Wire `getParagraphs` + `mapParagraphsToSegments` into the route**

In `app/api/webhooks/assemblyai/route.ts`, update the import:

```typescript
import { parseWebhookBody, getTranscript, getParagraphs, mapParagraphsToSegments } from '@/lib/assemblyai'
```

After the existing `parseWebhookBody` try/catch block (currently around lines 62-72), insert:

```typescript
let paragraphs
try {
  paragraphs = await getParagraphs(jobId)
} catch (err) {
  log.error('getParagraphs failed', { sessionId: session.id, jobId, err })
  await db.from('sessions').update({
    status: 'error',
    error_stage: 'transcribing',
  }).eq('id', session.id)
  return NextResponse.json({ ok: true })
}

const segmentsWithBreaks = mapParagraphsToSegments(parsed.segments, paragraphs)
```

Then change the segment insert block (currently around lines 74-83) from iterating `parsed.segments` to iterating `segmentsWithBreaks`, and add `paragraph_breaks` to the insert payload:

```typescript
const { error: insertError } = await db.from('transcript_segments').insert(
  segmentsWithBreaks.map(s => ({
    session_id: session.id,
    speaker: s.speaker,
    text: s.text,
    start_ms: s.start_ms,
    end_ms: s.end_ms,
    position: s.position,
    paragraph_breaks: s.paragraph_breaks,
  }))
)
if (insertError) log.error('Segment insert failed', { sessionId: session.id, error: insertError.message })
```

- [ ] **Step 4: Run the webhook test file — should now pass**

Run: `npm test -- __tests__/api/webhook.test.ts`
Expected: all six tests pass.

- [ ] **Step 5: Run the full suite for regression**

Run: `npm test`
Expected: full green.

- [ ] **Step 6: Commit**

```bash
git add app/api/webhooks/assemblyai/route.ts __tests__/api/webhook.test.ts
git commit -m "feat(webhook): persist AssemblyAI paragraph offsets per segment"
```

---

## Task 6: `AnnotatedText` `offsetBase` prop (TDD)

**Files:**
- Modify: `components/AnnotatedText.tsx`
- Modify: `__tests__/components/AnnotatedText.test.tsx`

`AnnotatedText` will soon receive paragraph slices instead of full segment text. Annotations on a paragraph carry their original (segment-relative) `start_char`/`end_char`, so the component needs to subtract a per-paragraph `offsetBase` before slicing into the local text.

- [ ] **Step 1: Add the failing test**

Append to `__tests__/components/AnnotatedText.test.tsx`:

```typescript
describe('AnnotatedText offsetBase', () => {
  it('rebases annotation offsets when rendering a paragraph slice', () => {
    // Imagine the full segment is "Saludo. Yo fui al mercado." (length 26).
    // The second paragraph "Yo fui al mercado." starts at offset 8 in the segment.
    // The annotation on "Yo fui" has segment-relative offsets 8..14.
    // When rendering ONLY the second paragraph, AnnotatedText receives:
    //   text = "Yo fui al mercado."
    //   offsetBase = 8
    // It must subtract offsetBase to highlight chars 0..6 of the paragraph slice.
    const paragraphAnnotation: Annotation = {
      ...annotation,
      original: 'Yo fui',
      start_char: 8,
      end_char: 14,
    }
    render(
      <AnnotatedText
        text="Yo fui al mercado."
        annotations={[paragraphAnnotation]}
        offsetBase={8}
        onAnnotationClick={() => {}}
      />,
    )
    expect(screen.getByText('Yo fui').tagName).toBe('MARK')
    expect(screen.getByText(' al mercado.')).toBeInTheDocument()
  })

  it('treats offsetBase as 0 when the prop is omitted', () => {
    // Sanity check: existing call sites pass no offsetBase and must continue
    // to render correctly (regression guard for the legacy code path).
    render(
      <AnnotatedText
        text="Yo fui al mercado."
        annotations={[annotation]}
        onAnnotationClick={() => {}}
      />,
    )
    expect(screen.getByText('Yo fui').tagName).toBe('MARK')
  })
})
```

- [ ] **Step 2: Run — first test should fail (offsetBase prop unknown)**

Run: `npm test -- __tests__/components/AnnotatedText.test.tsx`
Expected: TypeScript-level failure (`offsetBase` not in `Props`) OR the rendered mark mis-positions.

- [ ] **Step 3: Add `offsetBase` to `AnnotatedText`**

In `components/AnnotatedText.tsx`, extend `Props`:

```typescript
interface Props {
  text: string
  annotations: Annotation[]
  onAnnotationClick: (annotation: Annotation) => void
  savedAnnotationIds?: Set<string>
  writtenAnnotationIds?: Set<string>
  unhelpfulAnnotationIds?: Set<string>
  activeAnnotationId?: string | null
  openLabel?: string
  stateLabels?: { written: string; saved: string; unreviewed: string }
  /**
   * Subtract this from each annotation's start_char/end_char before indexing
   * into `text`. Used when rendering a paragraph slice of a larger segment;
   * the parent has already filtered annotations to those that fall within
   * the slice. Defaults to 0 (legacy whole-segment rendering).
   */
  offsetBase?: number
}
```

Update `buildSpans` to take an `offsetBase` argument:

```typescript
function buildSpans(text: string, annotations: Annotation[], offsetBase: number): Span[] {
  const sorted = [...annotations].sort((a, b) => a.start_char - b.start_char)
  const spans: Span[] = []
  let cursor = 0
  for (const ann of sorted) {
    const localStart = ann.start_char - offsetBase
    const localEnd = ann.end_char - offsetBase
    if (localStart > cursor) spans.push({ start: cursor, end: localStart })
    spans.push({ start: localStart, end: localEnd, annotation: ann })
    cursor = localEnd
  }
  if (cursor < text.length) spans.push({ start: cursor, end: text.length })
  return spans
}
```

Update the component to thread `offsetBase` through:

```typescript
export function AnnotatedText({
  text,
  annotations,
  onAnnotationClick,
  savedAnnotationIds = new Set(),
  writtenAnnotationIds = new Set(),
  unhelpfulAnnotationIds = new Set(),
  activeAnnotationId = null,
  openLabel = 'Open correction',
  stateLabels = DEFAULT_STATE_LABELS,
  offsetBase = 0,
}: Props) {
  const spans = buildSpans(text, annotations, offsetBase)
  // ...rest unchanged
```

- [ ] **Step 4: Run AnnotatedText tests — should pass**

Run: `npm test -- __tests__/components/AnnotatedText.test.tsx`
Expected: all tests pass, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add components/AnnotatedText.tsx __tests__/components/AnnotatedText.test.tsx
git commit -m "feat(annotated-text): add offsetBase prop for paragraph slicing"
```

---

## Task 7: `TranscriptView` paragraph rendering (TDD)

**Files:**
- Modify: `components/TranscriptView.tsx`
- Modify: `__tests__/components/TranscriptView.test.tsx`

This is the visible payoff. Each segment renders as one or more `<p>` blocks separated by a `space-y-3` gap.

- [ ] **Step 1: Add the failing tests**

Append to `__tests__/components/TranscriptView.test.tsx`:

```typescript
describe('TranscriptView paragraph rendering', () => {
  it('renders a single <p> when paragraph_breaks is empty (legacy)', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />,
    )
    // Speaker label is also a <p>, so we filter to ones that contain segment text.
    const paragraphs = Array.from(container.querySelectorAll('p')).filter(p =>
      p.textContent?.includes('Yo fui al mercado.'),
    )
    expect(paragraphs).toHaveLength(1)
  })

  it('renders one <p> per paragraph when paragraph_breaks is populated', () => {
    const longText = 'Primera parte aquí. Segunda parte aquí. Tercera parte aquí.'
    // 'Segunda parte aquí.' starts at index 20.
    // 'Tercera parte aquí.' starts at index 40.
    const longSegments: TranscriptSegment[] = [
      { id: 'seg-long', session_id: 's1', speaker: 'A', text: longText,
        start_ms: 0, end_ms: 5000, position: 0, paragraph_breaks: [20, 40] },
    ]
    const { container } = render(
      <TranscriptView segments={longSegments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />,
    )
    const paragraphs = Array.from(container.querySelectorAll('p')).filter(p => {
      const text = p.textContent ?? ''
      return text.includes('parte aquí.') && !text.includes('You')
    })
    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[0].textContent).toContain('Primera parte aquí.')
    expect(paragraphs[1].textContent).toContain('Segunda parte aquí.')
    expect(paragraphs[2].textContent).toContain('Tercera parte aquí.')
  })

  it('renders an annotation that lives in the second paragraph with rebased offsets', async () => {
    const longText = 'Primera parte aquí. Yo fui al mercado.'
    // 'Yo fui al mercado.' starts at index 20.
    // The "Yo fui" annotation has segment-relative offsets 20..26.
    const longSegments: TranscriptSegment[] = [
      { id: 'seg-2p', session_id: 's1', speaker: 'A', text: longText,
        start_ms: 0, end_ms: 4000, position: 0, paragraph_breaks: [20] },
    ]
    const para2Annotations: Annotation[] = [
      { id: 'ann-p2', session_id: 's1', segment_id: 'seg-2p', type: 'grammar',
        original: 'Yo fui', start_char: 20, end_char: 26, correction: 'Fui',
        explanation: 'Drop pronoun.', sub_category: 'other',
        flashcard_front: null, flashcard_back: null, flashcard_note: null,
        importance_score: null, importance_note: null,
        is_unhelpful: false, unhelpful_at: null },
    ]
    render(
      <TranscriptView
        segments={longSegments}
        annotations={para2Annotations}
        userSpeakerLabels={['A']}
        {...defaultProps}
      />,
    )
    // The annotated phrase still renders as a <mark>, and clicking it still
    // opens the AnnotationSheet (proves the rebasing didn't break navigation).
    const mark = screen.getByText('Yo fui')
    expect(mark.tagName).toBe('MARK')
    await userEvent.click(mark)
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run new tests — they should fail**

Run: `npm test -- __tests__/components/TranscriptView.test.tsx`
Expected: the new tests fail because `TranscriptView` still renders one big `<span>` per segment regardless of `paragraph_breaks`.

- [ ] **Step 3: Add `splitIntoParagraphs` helper at the top of the file**

In `components/TranscriptView.tsx`, after the existing imports, add (above the `LEGEND_LEARNED_KEY` constant):

```typescript
/** Pure helper: split a segment's text on paragraph_breaks offsets into
 *  blocks each carrying their starting offset for annotation rebasing.
 *  splitIntoParagraphs(text, []) === [{ text, offset: 0 }] — i.e. legacy
 *  single-block render. */
function splitIntoParagraphs(text: string, breaks: number[]): Array<{ text: string; offset: number }> {
  const bounds = [0, ...breaks, text.length]
  return bounds.slice(0, -1).map((start, i) => ({
    text: text.slice(start, bounds[i + 1]),
    offset: start,
  }))
}
```

- [ ] **Step 4: Replace the per-segment render block**

Find the segment render block (currently roughly lines 182-217 in `TranscriptView.tsx`):

```tsx
{segments.map(seg => {
  const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)
  return (
    <div key={seg.id}>
      <div
        className={!isUser ? 'opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity' : ''}
        data-speaker-role={isUser ? 'user' : 'partner'}
      >
        <p className="text-xs text-text-tertiary uppercase tracking-wide mb-1.5 font-medium">
          {isUser ? userLabel : themLabel}
        </p>
        <span className="text-base md:text-lg leading-[1.8] break-words text-text-primary">
          {isUser && (annotationsBySegment[seg.id] ?? []).length > 0 ? (
            <AnnotatedText
              text={seg.text}
              annotations={annotationsBySegment[seg.id] ?? []}
              onAnnotationClick={handleClick}
              savedAnnotationIds={savedAnnotationIds}
              writtenAnnotationIds={writtenAnnotations}
              unhelpfulAnnotationIds={unhelpfulAnnotations}
              activeAnnotationId={activeAnnotationId}
              openLabel={t('transcript.openCorrection')}
              stateLabels={{
                written: t('transcript.markState.written'),
                saved: t('transcript.markState.saved'),
                unreviewed: t('transcript.markState.unreviewed'),
              }}
            />
          ) : (
            seg.text
          )}
        </span>
      </div>
    </div>
  )
})}
```

Replace it with:

```tsx
{segments.map(seg => {
  const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)
  const paragraphs = splitIntoParagraphs(seg.text, seg.paragraph_breaks)
  const segAnns = annotationsBySegment[seg.id] ?? []
  // An annotation belongs to whichever paragraph contains its start char,
  // and is rendered only when its full range fits inside that paragraph.
  // In practice Claude annotates phrases short enough that this always
  // holds (paragraph breaks land on sentence boundaries); the rare case
  // where end_char crosses a break is logged so we'd see it in production.
  if (isUser && process.env.NODE_ENV !== 'production') {
    for (const a of segAnns) {
      const owningPara = paragraphs.find(p => a.start_char >= p.offset && a.start_char < p.offset + p.text.length)
      if (owningPara && a.end_char > owningPara.offset + owningPara.text.length) {
        // eslint-disable-next-line no-console
        console.warn('[TranscriptView] Annotation spans paragraph break, will not render', {
          segmentId: seg.id, annotationId: a.id,
        })
      }
    }
  }
  return (
    <div key={seg.id}>
      <div
        className={!isUser ? 'opacity-40 hover:opacity-100 focus-within:opacity-100 transition-opacity' : ''}
        data-speaker-role={isUser ? 'user' : 'partner'}
      >
        <p className="text-xs text-text-tertiary uppercase tracking-wide mb-1.5 font-medium">
          {isUser ? userLabel : themLabel}
        </p>
        <div className="space-y-3 md:space-y-4 text-base md:text-lg leading-[1.8] break-words text-text-primary">
          {paragraphs.map((para, i) => {
            const paraAnns = isUser
              ? segAnns.filter(a => a.start_char >= para.offset && a.end_char <= para.offset + para.text.length)
              : []
            return (
              <p key={i}>
                {paraAnns.length > 0 ? (
                  <AnnotatedText
                    text={para.text}
                    annotations={paraAnns}
                    offsetBase={para.offset}
                    onAnnotationClick={handleClick}
                    savedAnnotationIds={savedAnnotationIds}
                    writtenAnnotationIds={writtenAnnotations}
                    unhelpfulAnnotationIds={unhelpfulAnnotations}
                    activeAnnotationId={activeAnnotationId}
                    openLabel={t('transcript.openCorrection')}
                    stateLabels={{
                      written: t('transcript.markState.written'),
                      saved: t('transcript.markState.saved'),
                      unreviewed: t('transcript.markState.unreviewed'),
                    }}
                  />
                ) : (
                  para.text
                )}
              </p>
            )
          })}
        </div>
      </div>
    </div>
  )
})}
```

- [ ] **Step 5: Run TranscriptView tests — should pass**

Run: `npm test -- __tests__/components/TranscriptView.test.tsx`
Expected: all tests pass, including the three new paragraph-rendering ones.

- [ ] **Step 6: Run full test suite + lint**

Run: `npm test && npm run lint`
Expected: full green, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add components/TranscriptView.tsx __tests__/components/TranscriptView.test.tsx
git commit -m "feat(transcript): render paragraphs as separate blocks"
```

---

## Task 8: Manual smoke + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run dev server**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000`.

- [ ] **Step 2: Record and upload a fresh long monologue**

Using the app, upload a Spanish audio recording of at least 60 seconds where the speaker monologues without interruption. Wait for processing to complete.

Expected: the transcript page renders the user's turn split into ≥ 2 visible paragraph blocks separated by a clear gap, where AssemblyAI would naturally pause for breath.

- [ ] **Step 3: Open a pre-migration session**

Navigate to any session that existed before this work shipped.

Expected: renders as one block per speaker turn (no regression). The empty-array default means legacy data has no breaks, so `splitIntoParagraphs(text, [])` returns one paragraph and no gap appears.

- [ ] **Step 4: Verify annotation interaction still works**

On a fresh paragraphed session, click any annotation highlight inside the second or later paragraph. Expected: `AnnotationSheet` opens with the correct correction; prev/next nav still cycles through annotations in their original order.

- [ ] **Step 5: Test the failure path manually (optional, in dev)**

Temporarily edit `lib/assemblyai.ts` `getParagraphs` to throw, redeploy or `npm run dev`, upload a session.

Expected: session enters the `error` state with `error_stage: 'transcribing'`. The retry button on the status page is offered.

After verifying, REVERT the temporary throw before continuing.

- [ ] **Step 6: Final commit (if any post-smoke fixes were needed)**

If smoke testing surfaced anything, fix and commit. Otherwise this task has no commit.

---

## Out of Scope (per spec)

- Backfilling paragraph data for sessions that pre-date this migration.
- Per-paragraph audio playback ("play from here"). Audio is deleted after transcription.
- Adjusting paragraph grouping intelligence beyond what AssemblyAI returns.
- Claude system prompt changes — the transcript text comes from AssemblyAI, not Claude.
