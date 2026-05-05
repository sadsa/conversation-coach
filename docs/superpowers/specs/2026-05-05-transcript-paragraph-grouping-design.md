# Transcript Paragraph Grouping Design

**Date:** 2026-05-05
**Status:** Draft

## Problem

Transcripts render as walls of text. Each `transcript_segments` row stores one full AssemblyAI utterance (a single speaker turn), which for a rambling monologue can be a minute or more of continuous prose with zero paragraph breaks. Users have noted the transcript feels difficult to read because the "stream of consciousness" nature of spontaneous speech lacks natural visual rests — every line runs into the next until the speaker changes.

Line height and text size are already tuned for readability (`leading-[1.8]`, `text-base md:text-lg`, `max-w-prose`). The remaining lever is paragraph structure: introducing visual rests inside a single speaker turn where the speaker would have paused for breath or shifted topic.

## Solution Overview

Use AssemblyAI's existing `/v2/transcript/:id/paragraphs` endpoint — the same job that already produced our utterances — to get semantic paragraph groupings, and store each paragraph's starting offset as metadata on the segment. The UI then splits `segment.text` on those offsets and renders each slice as a block.

Four additive changes:

1. **DB**: one new column on `transcript_segments` (`paragraph_breaks int[] not null default '{}'`).
2. **Webhook**: one extra AssemblyAI call per session (`client.transcripts.paragraphs(jobId)`), mapped to segment-local character offsets before the segment insert.
3. **Render**: split each segment into paragraph blocks with a `space-y-3 md:space-y-4` gap. Existing annotation rendering continues to work unchanged by passing a per-paragraph offset base into `AnnotatedText`.
4. **Types**: extend `TranscriptSegment` with the new field. No loader changes — `select('*')` flows the column through automatically.

Scope decisions (locked in during brainstorming):

- **New sessions only.** No backfill, no lazy re-fetch. Existing sessions keep their empty `paragraph_breaks` and render as a single block, which is what they do today.
- **Failure is strict.** If `paragraphs()` fails, the webhook treats it as a `transcribing` error — same error_stage users already see, same retry path via `/api/sessions/:id/retry`.
- **Every segment gets paragraphed, regardless of length or speaker.** Consistent render rule; no "long enough" heuristic.

---

## 1. Data Model

New migration: `supabase/migrations/YYYYMMDD_add_paragraph_breaks.sql`.

```sql
alter table transcript_segments
  add column paragraph_breaks int[] not null default '{}';
```

Semantics of `paragraph_breaks`:

- An ordered array of **character offsets into `segment.text`** where each new paragraph begins after the first.
- The first paragraph always starts at offset 0 — this is implicit and NOT stored in the array.
- `[]` = single-paragraph segment (legacy rows, or short utterances with no semantic break).
- `[142, 289]` on a 400-char segment = three paragraphs: `[0, 142)`, `[142, 289)`, `[289, 400)`.
- Invariants (enforced by mapping code, not the database):
  - All values are strictly greater than 0.
  - All values are strictly less than `length(segment.text)`.
  - Array is strictly monotonically increasing.

**`annotations` is untouched.** `start_char` / `end_char` continue to index into `segment.text` verbatim. Paragraph structure is metadata sitting parallel to annotations; the two never need to know about each other in storage.

---

## 2. Pipeline Integration

### `lib/assemblyai.ts`

Extend `ParsedSegment`:

```typescript
export interface ParsedSegment {
  speaker: string
  text: string
  start_ms: number
  end_ms: number
  position: number
  paragraph_breaks: number[]
}
```

New exported function:

```typescript
export async function getParagraphs(jobId: string): Promise<TranscriptParagraph[]> {
  const client = getClient()
  const { paragraphs } = await client.transcripts.paragraphs(jobId)
  return paragraphs
}
```

New exported helper (pure function, no I/O — easy to unit-test):

```typescript
export function mapParagraphsToSegments(
  segments: ParsedSegment[],     // output of parseWebhookBody, with empty paragraph_breaks
  paragraphs: TranscriptParagraph[]
): ParsedSegment[]
```

### Mapping Algorithm

For each `paragraph` in the input array, in order:

1. Find the **first** segment whose time range contains the paragraph's start:
   `seg.start_ms <= paragraph.start && paragraph.start <= seg.end_ms`.
   "First" matters for the boundary case where paragraph.start exactly equals the end of segment N and the start of segment N+1 — the paragraph attaches to segment N by this rule.
2. If no such segment exists, log a warning (`'Paragraph timestamp outside all segment ranges'`) and skip the paragraph.
3. Track a per-segment `searchFrom` cursor, initially 0, that advances as paragraphs in that segment are consumed. Within the chosen segment's `text`, call `text.indexOf(paragraph.text, searchFrom)` to locate the paragraph. This prevents matching an earlier identical substring elsewhere in the utterance (e.g. a repeated filler phrase).
4. If `indexOf` returns `-1`, log a warning (`'Paragraph text not found in segment text'`) and skip that paragraph. The segment still gets any other breaks that map successfully. Do not advance `searchFrom` for a failed match.
5. If the resulting offset is `> 0`, append it to the segment's `paragraph_breaks` array. If the offset is `0`, this is the first paragraph of the segment — no break is recorded (first paragraph is implicit).
6. Advance that segment's `searchFrom` to `offset + paragraph.text.length` before moving to the next paragraph.
7. Final validation pass per segment: if breaks end up non-monotonic, out of range (`>= text.length` or `<= 0`), or duplicated, throw. This indicates a bug in the algorithm, not user-recoverable data.

The output is the same `ParsedSegment[]` with populated `paragraph_breaks`.

### Webhook Changes

`app/api/webhooks/assemblyai/route.ts`, after the existing `parseWebhookBody` block:

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

The subsequent insert adds `paragraph_breaks: s.paragraph_breaks` alongside the existing columns.

### Failure Semantics

- **`paragraphs()` network / API failure** → session to `error` / `error_stage: 'transcribing'`. Existing retry (`POST /api/sessions/:id/retry`) is valid for this error_stage and re-submits the job, re-firing the webhook.
- **Paragraph text not found / timestamp off-range** (per-paragraph, non-fatal) → log warning, skip that break. Segment renders with fewer paragraphs but the session still succeeds.
- **Monotonicity / range validation failure** (per-segment, fatal) → throw out of `mapParagraphsToSegments`, webhook catches as transcribing error. Indicates an algorithm bug.

---

## 3. Rendering

### `components/TranscriptView.tsx`

New local helper (not exported):

```typescript
function splitIntoParagraphs(
  text: string,
  breaks: number[]
): Array<{ text: string; offset: number }> {
  const bounds = [0, ...breaks, text.length]
  return bounds.slice(0, -1).map((start, i) => ({
    text: text.slice(start, bounds[i + 1]),
    offset: start,
  }))
}
```

Per-segment render becomes (replacing the current `<span>` block):

```tsx
const paragraphs = splitIntoParagraphs(seg.text, seg.paragraph_breaks)
const segAnns = annotationsBySegment[seg.id] ?? []

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
            ? segAnns.filter(a =>
                a.start_char >= para.offset && a.end_char <= para.offset + para.text.length
              )
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
```

Spacing choice: `space-y-3 md:space-y-4` between paragraphs is enough for the eye to register a beat without separating paragraphs so much they look unrelated. No horizontal indent, no drop cap, no visual chrome — the rhythm comes from the gap alone.

Line height (`leading-[1.8]`) moves up from the `<span>` onto the wrapping `<div>` so it inherits to every `<p>`.

### `components/AnnotatedText.tsx`

One new optional prop:

```typescript
interface Props {
  // ...existing props
  offsetBase?: number
}
```

Default `0`. Inside the component, wherever `annotation.start_char` and `annotation.end_char` are compared against the local `text` argument, subtract `offsetBase`:

```typescript
const localStart = a.start_char - offsetBase
const localEnd = a.end_char - offsetBase
```

Everything downstream — annotation IDs, click handlers, `data-annotation-id` attributes, state classes — is unchanged.

### Edge Case — Annotation Spans a Paragraph Break

Very unlikely in practice (AssemblyAI's paragraphs respect sentence boundaries, Claude annotates phrases rather than multi-sentence spans), but possible. Policy:

- An annotation is rendered in the paragraph that contains its `start_char`.
- If its `end_char` extends past that paragraph's boundary, clamp the highlighted range to the paragraph boundary for rendering purposes only.
- The full annotation record (including the original unclamped offsets) is what `AnnotationSheet` operates on — click still opens the sheet with complete data.
- Log `log.warn('Annotation spans paragraph break', { annotationId, segmentId })` once so we have signal if this turns out to be more than theoretical.

### Visual Backward Compatibility

`splitIntoParagraphs(text, [])` returns `[{ text, offset: 0 }]` — a single-element array. A segment with an empty `paragraph_breaks` renders as exactly one `<p>` inside the `space-y-3` container. One paragraph means no gaps are applied. Render is pixel-identical to today for legacy sessions.

---

## 4. Types & Loaders

### `lib/types.ts`

```typescript
export interface TranscriptSegment {
  id: string
  session_id: string
  speaker: 'A' | 'B'
  text: string
  start_ms: number
  end_ms: number
  position: number
  paragraph_breaks: number[]
}
```

### `lib/loaders.ts`

No changes. The session-detail loader already uses `select('*')` on `transcript_segments`. The new column flows through automatically once the type is updated.

### What Does Not Need to Change

- `AnnotationSheet`, `AnnotationCard`, `CorrectionInContext`, `WriteList`, `WriteSheet` — all operate on annotation records and segment text as opaque strings. Paragraph structure is invisible to them.
- `lib/pipeline.ts` — passes `segment.text` to Claude unchanged. Claude continues to analyse the same raw text. Annotation offsets are still valid.
- `lib/claude.ts` — no prompt changes.
- The `status`, `identify`, and speaker-sample API routes — they project specific columns and don't need `paragraph_breaks`.

---

## 5. Testing

### Unit — `__tests__/lib/assemblyai.test.ts` (new)

Cases for `mapParagraphsToSegments`:

1. Single segment, single paragraph → `paragraph_breaks: []`.
2. Single segment, three paragraphs → breaks at correct offsets, monotonically increasing.
3. Two segments (speaker A then speaker B), each with its own paragraphs → each segment gets only its own paragraph offsets; no cross-contamination.
4. Paragraph text not found in segment text (simulated punctuation drift) → that break is skipped, warning logged via `log.warn` mock, other breaks still recorded.
5. Paragraph start timestamp falls outside every segment's time range → skipped, warning logged.
6. Two paragraphs whose starts map to the same character offset (degenerate) → throws on the monotonicity check.

### Unit — `__tests__/components/TranscriptView.test.tsx` (extend existing)

1. Segment with `paragraph_breaks: []` renders exactly one `<p>` — no regression for legacy sessions.
2. Segment with `paragraph_breaks: [50, 120]` renders three `<p>` elements with the expected text slices and the expected inter-paragraph gap class.
3. Annotation with `start_char: 60, end_char: 75` in a segment with break at `50` renders inside the second `<p>` with the highlight correctly positioned (offset rebased).
4. Annotation click on a rebased highlight still opens `AnnotationSheet` with the full annotation record intact — prev/next navigation order unchanged.

### Integration — `__tests__/app/api/webhooks/assemblyai.test.ts`

If the test file doesn't exist yet, add one:

1. Webhook receives a completed-transcript body; `client.transcripts.paragraphs` mock returns valid paragraph data → session transitions to `analysing` (for single speaker) or `identifying` (for two speakers), AND `transcript_segments` rows include correctly-populated `paragraph_breaks`.
2. Same webhook; `client.transcripts.paragraphs` mock throws → session goes to `error` with `error_stage: 'transcribing'`, Claude analysis is not triggered.

### Manual Smoke (PR checklist item, not automated)

- Record a 60+ second Spanish monologue, upload, open the transcript → ≥ 2 paragraphs visible inside the user's turn where AssemblyAI would naturally pause.
- Open any old session (pre-migration) → renders as one block, no visual regression.

No new E2E tests. The existing session flow tests cover the transcription → analysis → ready state machine; we're adding metadata to segments, not changing states.

---

## Out of Scope

- Backfilling paragraph data for existing sessions. Explicitly declined during brainstorming.
- Per-paragraph audio playback. Audio is deleted after transcription, so "play from here" isn't on the roadmap.
- Adjusting paragraph grouping intelligence beyond what AssemblyAI provides. If the grouping quality is disappointing in practice, option 3 from the earlier discussion (Claude-driven paragraph breaks) remains on the shelf as a future follow-up.
- Changing Claude's system prompt. The transcript text is AssemblyAI's output, not Claude's; prompt changes would not affect paragraphing.
