# Raise the bar for what counts as a correction

**Status:** Draft
**Date:** 2026-05-12
**Surface:** post-recording analysis (`lib/claude.ts`, `lib/pipeline.ts`)

## Problem

The Claude analyzer over-flags. Concrete example, EN-NZ target language, native English speaker recording themselves:

> Original: "thought I'd have a bit of a chat with you and just see how everything's going"
>
> Correction: "just thought I'd have a yarn and see how you're getting on"
>
> "La frase es comprensible pero suena un poco formal para el inglés cotidiano de Nueva Zelanda. 'Have a yarn' es la forma típica kiwi de decir 'tener una charla'..."

The original is intelligible, register-appropriate, and would not make a native pause. "Yarn" is local flair, not a correction. Surfacing this kind of suggestion makes users feel their language isn't good enough for a problem that doesn't exist.

Two structural causes:

1. **EN-NZ has no quality guardrails.** The ES-AR prompt has three (skip self-corrections, de-duplicate basic voseo slips, favour quality over quantity). The EN-NZ prompt has none.
2. **Both prompts treat regional flair as a naturalness correction.** The current naturalness definition — "things that are technically correct but would sound more natural said differently" — invites *any* improvement. There is no rule against suggesting a more local idiom when the original is already fine.

A third symptom: `importance_score` (1–3) exists, score 1 is hidden in the UI pill, but the annotation still appears in the transcript and Write list. Scoring exists but doesn't gate visibility.

## Goals

1. Drop regional-flair upsells across both languages.
2. Bring EN-NZ guardrails to parity with ES-AR.
3. Keep naturalness annotations *only* when the original sounds clearly off to a native.
4. Recalibrate `importance_score` semantics so the model self-rates by "would a native notice".
5. Add a server-side safety net: drop `importance_score === 1` before insert.

## Non-goals

- No DB migration.
- No cleanup of existing annotations. Users can re-analyse a session on demand if they want fresher results.
- No UI changes. The pill, sort behaviour, and Write-list flow stay as-is.
- No new "strict / lenient" toggle. One bar for everyone.
- No change to the realtime voice agent. It does not generate written corrections.
- No change to practice mode prompts. They already forbid mid-conversation correction.

## Architecture

Two surgical changes in existing files. No new files, no migrations.

```
┌──────────────────────────┐
│  lib/claude.ts            │  ← Change #1: prompt rewrites
│  analyseUserTurns()       │     (EN-NZ + ES-AR guardrails,
│                           │      naturalness redefinition,
│                           │      importance_score recalibration,
│                           │      negative few-shot examples)
└────────────┬──────────────┘
             │ ClaudeAnnotation[]
             ▼
┌──────────────────────────┐
│  lib/pipeline.ts          │  ← Change #2: filter score=1
│  runClaudeAnalysis()      │     (after offset/sub_category
│                           │      validation, before insert)
└────────────┬──────────────┘
             │ filtered annotations
             ▼
        annotations table
```

**Why split the work across both layers.** The prompt is the primary lever — fewer bad annotations generated means fewer tokens, lower latency, less noise. The filter is the safety net for when Claude slips. Each layer has one job: `claude.ts` decides *what to flag*, `pipeline.ts` enforces *what makes it to the UI*.

No change to `ClaudeAnnotation` type, `annotations` schema, `practice_items` schema, or any UI component. The filter runs over the same shape that's already validated for `sub_category` and corrected for character offsets — it just shrinks the array before insert.

## Change #1 — Prompt rewrites in `lib/claude.ts`

### 1a. Redefine naturalness (top of both prompts)

Replace the current line:

> Unnatural phrasing — things that are technically correct but would sound more natural said differently in everyday [Argentine | New Zealand] speech (type: "naturalness")

with:

> Unnatural phrasing — things that are technically correct but would sound clearly OFF or unnatural to a native speaker (type: "naturalness"). NOT every alternative phrasing the speaker could have used. If the original is intelligible, register-appropriate, and would not make a native pause, do NOT flag it.

This is the central nudge. The old wording invites *any* improvement. The new wording requires a defect, not a preference.

### 1b. Shared quality guidelines block

Extract a `QUALITY_GUIDELINES` constant interpolated into both prompts. Replaces the existing ES-AR-only guidelines block; the EN-NZ prompt gains the block for parity.

```
Quality guidelines — follow these strictly:

- **Skip self-corrections**: if the speaker corrects their own error within
  the same turn, do NOT annotate it.

- **De-duplicate recurring patterns**: if the speaker makes the same minor
  slip 3+ times in the session, flag at most ONE representative example
  and note it is recurring. (Replaces the old voseo-specific rule;
  applies to both languages now.)

- **Do not upsell regional flair.** Idioms, slang, and local vocabulary are
  optional flair, NOT corrections. If a neutral, intelligible, register-
  appropriate phrasing is being replaced with a more "local" version
  ("have a chat" → "have a yarn"; "decir" → "che decí"; "going to leave"
  → "I'm gonna head off"), DO NOT flag it.

- **Favour quality over quantity.** Prefer fewer, higher-value annotations.
  An annotation is high-value only if it closes a genuine knowledge gap.
  Skip obvious one-off slips the speaker almost certainly already knows.

- **If you would rate an annotation importance_score: 1, do NOT include it.**
  The bar is "a native would notice". Anything below that is noise.
```

### 1c. Recalibrate `importance_score` bands

Current bands phrase importance as "how common in everyday speech" — that pushes the model to flag *anything* not maximally common. New bands phrase it as "how noticeable is the original":

```
"importance_score": integer 2 or 3 (do not assign 1 — see guidelines above):
  - 3: the original would mark the speaker as a non-native or cause
       confusion / misunderstanding
  - 2: a native would notice the original is slightly off, but it would
       not impair understanding
```

The validator in `claude.ts` keeps accepting 1 (so any model slip-through becomes a clean signal for the pipeline filter), but we tell the model not to produce it.

### 1d. Negative few-shot examples (one per language prompt)

EN-NZ prompt:

```
Example of what NOT to flag:
  Original:   "thought I'd have a bit of a chat and see how things are going"
  Bad call:   flag as naturalness, suggest "have a yarn" / "see how you're getting on"
  Why bad:    Original is intelligible, natural, and register-appropriate.
              "Yarn" is local flair, not a correction.
```

ES-AR prompt:

```
Ejemplo de lo que NO hay que marcar:
  Original:   "Voy a comer algo rápido"
  Mal flag:   marcar como naturalidad, sugerir "pego un mordisco rápido"
  Por qué:    El original es claro, natural y apropiado al registro.
              El lunfardo es opcional, no una corrección.
```

### Implementation note

Both prompts share enough structure to factor out a `QUALITY_GUIDELINES` constant interpolated into both. The negative example stays inside each language-specific prompt. Net diff in `lib/claude.ts`: ~60 lines changed, ~10 added.

## Change #2 — Server-side filter in `lib/pipeline.ts`

After `correctedAnnotations` is built (sub_category + offsets validated) and before the insert. ~6 lines added:

```typescript
const filteredAnnotations = correctedAnnotations.filter(
  a => a.importance_score !== 1
)

if (filteredAnnotations.length < correctedAnnotations.length) {
  log.info('Dropped low-importance annotations', {
    sessionId,
    dropped: correctedAnnotations.length - filteredAnnotations.length,
    kept: filteredAnnotations.length,
  })
}
```

The existing `if (correctedAnnotations.length > 0)` insert block uses `filteredAnnotations` instead.

**Decisions baked in:**

- `importance_score === 1` → drop.
- `null` → keep (no judgement available; rare since prompt always asks for a score).
- `0`, negative, or otherwise invalid scores → already coerced to `null` by the existing `claude.ts` validator → kept. Acceptable rare path.
- The filter logs only when something was dropped — keeps logs quiet in the steady state once the prompt change does its job.

## Tests

Two new tests in existing files. No new fixtures, no new mocks.

**`__tests__/lib/pipeline.test.ts`** — new test:

```
it('drops annotations with importance_score=1 before insert', async () => {
  // Mock Claude returning two annotations: one score=1, one score=3
  // Assert annotations.insert was called with one row, score=3 only
})
```

**`__tests__/lib/claude.test.ts`** — extend the EN-NZ and ES-AR prompt tests:

```
it('uses the EN-NZ system prompt when targetLanguage is en-NZ', ...)
  // Existing assertions PLUS:
  // - prompt contains "Do not upsell regional flair"
  // - prompt contains "have a yarn" (the negative example)
  // - prompt contains "Skip self-corrections" (parity check with ES-AR)

it('uses the ES-AR system prompt when targetLanguage is es-AR', ...)
  // Add: prompt contains "Do not upsell regional flair"
  //      prompt contains "pego un mordisco" (the negative example)
```

The change is small enough to resist adding more tests for symmetry — prompt-rewrite tests check structure, the pipeline filter test checks behaviour, and existing tests already cover offset correction, sub_category validation, and the score validator.

## Risks

1. **Under-correction.** If we tighten too far, real errors get missed. Mitigation: re-analyse a known session after deploy, eyeball the diff. If we're undershooting, soften the negative-example wording — the rest of the guardrails are well-grounded.
2. **Score-1 silently lost.** If Claude does produce a useful score=1, it's dropped. Trade-off accepted in approach B. The `log.info` line surfaces dropped counts if they ever spike.
3. **Existing nitpicky annotations stay.** Users can re-analyse on demand. No bulk cleanup.

## Open questions

None.
