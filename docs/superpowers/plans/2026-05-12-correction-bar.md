# Raise the Correction Bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten both Claude analysis prompts and add a server-side filter so the post-recording analyzer stops surfacing regional-flair upsells and other low-value corrections.

**Architecture:** Two surgical changes in existing files. (1) Rewrite both system prompts in `lib/claude.ts` to redefine "naturalness", add a shared quality-guidelines block, recalibrate `importance_score` bands, and include a language-specific negative few-shot example. (2) Add a server-side filter in `lib/pipeline.ts` that drops `importance_score === 1` annotations before insert as a safety net.

**Tech Stack:** Next.js 14 App Router, TypeScript, Anthropic SDK (Claude Sonnet 4.6), Supabase Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-12-correction-bar-design.md`

---

## File Map

- **Modify:** `lib/claude.ts` — extract `QUALITY_GUIDELINES` constant; rewrite both system prompts (naturalness wording, importance bands, negative examples). Net diff ~70 lines.
- **Modify:** `lib/pipeline.ts` — add filter after `correctedAnnotations` is built, before insert. ~6 lines.
- **Modify:** `__tests__/lib/claude.test.ts` — extend two existing prompt tests with structural assertions for the new guardrails.
- **Modify:** `__tests__/lib/pipeline.test.ts` — add one new test asserting `importance_score === 1` is dropped before insert.

No new files. No DB migration. No UI changes.

---

## Task 1: Rewrite both Claude system prompts

**Files:**
- Modify: `lib/claude.ts:6-79`
- Modify: `__tests__/lib/claude.test.ts:205-228`

This is a cohesive prompt-design change. We assert structural elements of the new prompts (specific phrases that prove the rewrite landed), then make the assertions pass.

- [ ] **Step 1: Update existing ES-AR and EN-NZ prompt tests with new structural assertions**

In `__tests__/lib/claude.test.ts`, replace the existing `it('uses the ES-AR system prompt when targetLanguage is es-AR', ...)` block (lines ~205-214) with:

```typescript
it('uses the ES-AR system prompt when targetLanguage is es-AR', async () => {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify({ title: 'Test', annotations: [] }) }],
    stop_reason: 'end_turn',
  })
  await analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], null, 'session-1', 'es-AR')
  const callArgs = mockCreate.mock.calls[0][0]
  expect(callArgs.system).toContain('Rioplatense')
  expect(callArgs.system).not.toContain('New Zealand English')
  // New guardrails (shared across both languages):
  expect(callArgs.system).toContain('Skip self-corrections')
  expect(callArgs.system).toContain('Do not upsell regional flair')
  expect(callArgs.system).toContain('De-duplicate recurring patterns')
  expect(callArgs.system).toContain('Favour quality over quantity')
  // ES-AR-specific negative example:
  expect(callArgs.system).toContain('pego un mordisco')
  // Recalibrated importance bands (no score=1):
  expect(callArgs.system).toContain('do not assign 1')
})
```

And replace the existing `it('uses the EN-NZ system prompt when targetLanguage is en-NZ', ...)` block (lines ~216-228) with:

```typescript
it('uses the EN-NZ system prompt when targetLanguage is en-NZ', async () => {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text: JSON.stringify({ title: 'Test', annotations: [] }) }],
    stop_reason: 'end_turn',
  })
  await analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], null, 'session-1', 'en-NZ')
  const callArgs = mockCreate.mock.calls[0][0]
  expect(callArgs.system).toContain('New Zealand English')
  expect(callArgs.system).toContain(
    'An invented Spanish sentence (in everyday Rioplatense register)',
  )
  expect(callArgs.system).toContain('The equivalent NZ English sentence')
  // Parity with ES-AR — EN-NZ now has the same quality guardrails:
  expect(callArgs.system).toContain('Skip self-corrections')
  expect(callArgs.system).toContain('Do not upsell regional flair')
  expect(callArgs.system).toContain('De-duplicate recurring patterns')
  expect(callArgs.system).toContain('Favour quality over quantity')
  // EN-NZ-specific negative example (the user's original complaint):
  expect(callArgs.system).toContain('have a yarn')
  // Recalibrated importance bands (no score=1):
  expect(callArgs.system).toContain('do not assign 1')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/claude.test.ts`

Expected: both prompt tests fail. The assertions for `'Skip self-corrections'`, `'Do not upsell regional flair'`, `'De-duplicate recurring patterns'`, `'Favour quality over quantity'`, `'pego un mordisco'`, `'have a yarn'`, and `'do not assign 1'` will not match the current prompts. Other tests in the file should still pass.

- [ ] **Step 3: Rewrite `lib/claude.ts` prompt block**

Replace the whole prompt block — both system prompt constants and the `PROMPTS` record (lines 6-79) — with the version below. Leave everything else (imports, types, `analyseUserTurns`) untouched.

```typescript
const QUALITY_GUIDELINES = `Quality guidelines — follow these strictly:

- **Skip self-corrections**: if the speaker corrects their own error within the same turn (e.g. "las holandesas, holandeses"), do NOT annotate it. Only flag errors that remain uncorrected.

- **De-duplicate recurring patterns**: if the speaker makes the same minor slip 3 or more times in the session, flag at most ONE representative example and note it is a recurring pattern. Reserve repeated annotations for non-obvious errors that genuinely warrant separate teaching.

- **Do not upsell regional flair.** Idioms, slang, and local vocabulary are optional flair, NOT corrections. If a neutral, intelligible, register-appropriate phrasing is being replaced with a more "local" version ("have a chat" → "have a yarn"; "decir" → "che decí"; "going to leave" → "I'm gonna head off"), DO NOT flag it. The bar is whether the original sounds clearly OFF, not whether a more idiomatic alternative exists.

- **Favour quality over quantity.** Prefer fewer, higher-value annotations. An annotation is high-value only if understanding the correction closes a genuine knowledge gap. Skip obvious one-off slips the speaker almost certainly already knows.

- **If you would rate an annotation importance_score: 1, do NOT include it.** The bar is "a native would notice". Anything below that is noise.`

const SYSTEM_PROMPT_ES_AR = `You are an expert Spanish language coach specialising in Rioplatense (Argentine) Spanish. Analyse the speech turns provided and identify:

1. Grammar errors — mistakes the speaker made (type: "grammar")
2. Unnatural phrasing — things that are technically correct but would sound clearly OFF or unnatural to a native Argentine speaker (type: "naturalness"). NOT every alternative phrasing the speaker could have used. If the original is intelligible, register-appropriate, and would not make a native pause, do NOT flag it.

For each annotation:
- "segment_id": the ID from the [ID: ...] prefix of the turn being annotated
- "type": one of "grammar" or "naturalness"
- "original": copy the exact substring from the turn's text
- "start_char" / "end_char": character offsets of "original" within the turn's text content only — do NOT count the [ID: ...] prefix line; offset 0 is the first character of the text itself
- "correction": the improved version
- "explanation": a concise plain-language explanation tuned to Argentine Spanish conventions
- "sub_category": classify into exactly one of these categories (use "other" if nothing fits):
  Grammar: "verb-conjugation", "subjunctive", "gender-agreement", "number-agreement", "ser-estar", "por-para", "tense-selection", "article-usage", "word-order"
  Naturalness: "vocabulary-choice", "register", "phrasing"
- "flashcard_front": An invented English sentence that correctly expresses the same meaning as the practice phrase. The correct English equivalent phrase is wrapped in [[double brackets]]. Example: "I [[went]] to the market yesterday."
- "flashcard_back": The equivalent Spanish sentence using the correct form, wrapped in [[double brackets]]. Example: "[[Fui]] al mercado ayer."
- "flashcard_note": 1–2 sentences (in English) explaining why the original was wrong or unnatural from a Rioplatense register perspective. Be concise.
- "importance_score": integer 2 or 3 (do not assign 1 — see Quality guidelines below):
  - 3: the original would mark the speaker as a non-native or cause confusion / misunderstanding
  - 2: a native would notice the original is slightly off, but understanding is not impaired

Be tuned to Rioplatense register: voseo verb forms, Rioplatense vocabulary, lunfardo where relevant. Prefer natural everyday Argentine speech over textbook Castilian.

${QUALITY_GUIDELINES}

Ejemplo de lo que NO hay que marcar:
  Original:   "Voy a comer algo rápido"
  Mal flag:   marcar como naturalidad, sugerir "pego un mordisco rápido"
  Por qué:    El original es claro, natural y apropiado al registro. El lunfardo es opcional, no una corrección.

For the title:
- Summarise the conversation topic in 5 words or fewer using natural Spanish/English mix (e.g. "Football con Kevin", "Planificando el fin de semana").
- If the original filename matches a WhatsApp audio pattern (starts with "PTT-" or contains "WhatsApp Audio"), prepend "WhatsApp: " to the title (e.g. "WhatsApp: Football con Kevin").
- Otherwise use the topic only.

Respond ONLY with a JSON object with this exact shape: { "title": string, "annotations": [{ "segment_id", "type", "sub_category", "original", "start_char", "end_char", "correction", "explanation", "flashcard_front", "flashcard_back", "flashcard_note", "importance_score" }] }. If there are no errors or unnatural phrases worth annotating, return an empty annotations array. No other text — no explanations, no prose.`

const SYSTEM_PROMPT_EN_NZ = `You are an expert English language coach specialising in New Zealand English. Analyse the speech turns provided and identify:

1. Grammar errors — mistakes the speaker made (type: "grammar")
2. Unnatural phrasing — things that are technically correct but would sound clearly OFF or unnatural to a native New Zealand speaker (type: "naturalness"). NOT every alternative phrasing the speaker could have used. If the original is intelligible, register-appropriate, and would not make a native pause, do NOT flag it.

For each annotation:
- "segment_id": the ID from the [ID: ...] prefix of the turn being annotated
- "type": one of "grammar" or "naturalness"
- "original": copy the exact substring from the turn's text
- "start_char" / "end_char": character offsets of "original" within the turn's text content only — do NOT count the [ID: ...] prefix line; offset 0 is the first character of the text itself
- "correction": the improved version
- "explanation": a concise plain-language explanation in Spanish (Rioplatense register), tuned to New Zealand English conventions
- "sub_category": classify into exactly one of these categories (use "other" if nothing fits):
  Grammar: "verb-conjugation", "subjunctive", "gender-agreement", "number-agreement", "ser-estar", "por-para", "tense-selection", "article-usage", "word-order"
  Naturalness: "vocabulary-choice", "register", "phrasing"
  Note: most grammar errors in English will fall under "verb-conjugation", "tense-selection", or "word-order". The Spanish-specific categories (gender-agreement, ser-estar, por-para, subjunctive) are unlikely to apply; use "other" if nothing fits.
- "flashcard_front": An invented Spanish sentence (in everyday Rioplatense register) that correctly expresses the same meaning as the practice phrase. The correct Spanish equivalent phrase is wrapped in [[double brackets]]. Example: "Ayer [[fui]] al mercado."
- "flashcard_back": The equivalent NZ English sentence using the correct form, wrapped in [[double brackets]]. Example: "Yesterday I [[went]] to the shops."
- "flashcard_note": 1–2 sentences (in Spanish, Rioplatense register) explaining why the original was wrong or unnatural from a New Zealand English perspective. Be concise.
- "importance_score": integer 2 or 3 (do not assign 1 — see Quality guidelines below):
  - 3: the original would mark the speaker as a non-native or cause confusion / misunderstanding
  - 2: a native would notice the original is slightly off, but understanding is not impaired

Be tuned to New Zealand English: use NZ spelling (colour, organise, programme), NZ vocabulary and idioms WHEN THE SPEAKER ALREADY USES THEM, and everyday NZ register. Note that NZ English tends to be informal and direct. Do not push the speaker toward kiwi-isms — neutral, intelligible English is fine.

${QUALITY_GUIDELINES}

Example of what NOT to flag:
  Original:   "thought I'd have a bit of a chat and see how things are going"
  Bad call:   flag as naturalness, suggest "have a yarn" / "see how you're getting on"
  Why bad:    Original is intelligible, natural, and register-appropriate. "Yarn" is local flair, not a correction.

For the title:
- Summarise the conversation topic in 5 words or fewer in natural English (e.g. "Football with Kevin", "Planning the weekend").
- If the original filename matches a WhatsApp audio pattern (starts with "PTT-" or contains "WhatsApp Audio"), prepend "WhatsApp: " to the title.
- Otherwise use the topic only.

Respond ONLY with a JSON object with this exact shape: { "title": string, "annotations": [{ "segment_id", "type", "sub_category", "original", "start_char", "end_char", "correction", "explanation", "flashcard_front", "flashcard_back", "flashcard_note", "importance_score" }] }. If there are no errors or unnatural phrases worth annotating, return an empty annotations array. No other text — no explanations, no prose.`

const PROMPTS: Record<TargetLanguage, string> = {
  'es-AR': SYSTEM_PROMPT_ES_AR,
  'en-NZ': SYSTEM_PROMPT_EN_NZ,
}
```

Notes on what changed vs. the current code:
- New `QUALITY_GUIDELINES` constant template-interpolated into both prompts. Replaces the ES-AR-only block; gives EN-NZ the same guardrails for parity.
- Naturalness line in both prompts redefined: "would sound clearly OFF or unnatural" instead of "would sound more natural said differently".
- `importance_score` bands changed from 1–3 ("very common"/"moderately common"/"rare") to 2–3 ("non-native"/"slightly off"). Score 1 is now explicitly forbidden.
- Negative example added to each prompt — language-appropriate, drawn from the spec.
- ES-AR prompt: the old voseo-specific de-duplication rule is replaced by the more general "De-duplicate recurring patterns" in the shared block.
- EN-NZ prompt: the "NZ vocabulary and idioms" line is softened to "WHEN THE SPEAKER ALREADY USES THEM" + "Do not push the speaker toward kiwi-isms" — closes the loophole the user's complaint exploited.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/claude.test.ts`

Expected: all tests in this file pass, including the two updated prompt tests. If a `toContain` assertion fails, check that the exact string appears in the rewritten prompt block (whitespace and capitalisation matter).

- [ ] **Step 5: Run lint to catch any TypeScript errors**

Run: `npm run lint`

Expected: no new errors. (The `QUALITY_GUIDELINES` constant uses template-string interpolation, which is standard TypeScript.)

- [ ] **Step 6: Commit**

```bash
git add lib/claude.ts __tests__/lib/claude.test.ts
git commit -m "claude: tighten correction bar in both prompts

Drops regional-flair upsells (have a yarn, pego un mordisco) and
brings EN-NZ guardrails to parity with ES-AR. Naturalness is now
defined as 'clearly off to a native', not 'could be more idiomatic'.
importance_score recalibrated to 2-3 only; score=1 is forbidden."
```

---

## Task 2: Server-side filter for `importance_score === 1`

**Files:**
- Modify: `lib/pipeline.ts:78` (insert filter immediately above the `if (correctedAnnotations.length > 0)` block)
- Modify: `__tests__/lib/pipeline.test.ts` (add new test)

Belt-and-braces safety net: if Claude ignores the prompt and produces a score=1 annotation, drop it server-side before it reaches the database.

- [ ] **Step 1: Write the failing test**

Append the following test to `__tests__/lib/pipeline.test.ts`, immediately before the closing `})` of the `describe('runClaudeAnalysis', ...)` block. Mirrors the structure of the existing `'inserts annotations then sets status ready'` test.

```typescript
it('drops annotations with importance_score=1 before insert', async () => {
  const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { user_speaker_labels: ['A'], audio_r2_key: 'audio/test.mp3', original_filename: null },
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
                data: [{ id: 'seg-1', speaker: 'A', text: 'Yo fui al mercado y tuvo una charla.' }],
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
  vi.mocked(analyseUserTurns).mockResolvedValue({
    title: 'Test Session',
    annotations: [
      // High-value annotation — should be inserted
      {
        segment_id: 'seg-1', type: 'grammar', sub_category: 'verb-conjugation',
        original: 'Yo fui', start_char: 0, end_char: 6,
        correction: 'Fui', explanation: 'Drop pronoun.',
        flashcard_front: null, flashcard_back: null, flashcard_note: null,
        importance_score: 3, importance_note: null,
      },
      // Low-value annotation — should be DROPPED by the filter
      {
        segment_id: 'seg-1', type: 'naturalness', sub_category: 'phrasing',
        original: 'tuvo una charla', start_char: 21, end_char: 36,
        correction: 'tuvo una conversación', explanation: 'Stylistic preference only.',
        flashcard_front: null, flashcard_back: null, flashcard_note: null,
        importance_score: 1, importance_note: null,
      },
    ],
  })
  vi.mocked(deleteObject).mockResolvedValue(undefined)

  await runClaudeAnalysis('session-filter-test')

  // The insert should have been called with exactly one row — the score=3 annotation only.
  expect(insertAnnotationsMock).toHaveBeenCalledTimes(1)
  const insertedRows = insertAnnotationsMock.mock.calls[0][0]
  expect(insertedRows).toHaveLength(1)
  expect(insertedRows[0]).toMatchObject({
    original: 'Yo fui',
    importance_score: 3,
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- __tests__/lib/pipeline.test.ts -t "drops annotations with importance_score=1"`

Expected: FAIL with `expected length 1, received 2` (or similar). The current pipeline inserts both annotations because no filter exists yet.

- [ ] **Step 3: Add the filter in `lib/pipeline.ts`**

In `lib/pipeline.ts`, locate the `if (correctedAnnotations.length > 0) {` block (currently around line 78). Insert the filter ABOVE it, and update the insert block to use the filtered array. The result should look like this:

```typescript
  const correctedAnnotations = annotations.map(a => {
    // ... existing offset + sub_category logic unchanged ...
  })

  // Safety net: drop any annotation Claude rated importance_score === 1.
  // The new prompt forbids score=1, but enforce it server-side so a model
  // slip-up never reaches the UI. null/missing scores are kept (no judgement
  // available); 0 / negative / NaN are already coerced to null upstream.
  const filteredAnnotations = correctedAnnotations.filter(a => a.importance_score !== 1)

  if (filteredAnnotations.length < correctedAnnotations.length) {
    log.info('Dropped low-importance annotations', {
      sessionId,
      dropped: correctedAnnotations.length - filteredAnnotations.length,
      kept: filteredAnnotations.length,
    })
  }

  if (filteredAnnotations.length > 0) {
    const { error: annotationError } = await db.from('annotations').insert(
      filteredAnnotations.map(a => ({
        session_id: sessionId,
        segment_id: a.segment_id,
        type: a.type,
        original: a.original,
        start_char: a.start_char,
        end_char: a.end_char,
        correction: a.correction,
        explanation: a.explanation,
        sub_category: a.sub_category,
        flashcard_front: a.flashcard_front ?? null,
        flashcard_back: a.flashcard_back ?? null,
        flashcard_note: a.flashcard_note ?? null,
        importance_score: a.importance_score ?? null,
        importance_note: a.importance_note ?? null,
      }))
    )

    if (annotationError) {
      log.error('Annotation insert failed', {
        sessionId,
        error: annotationError.message,
        code: annotationError.code,
        details: annotationError.details,
        hint: annotationError.hint,
      })
      throw new Error(`Failed to insert annotations: ${annotationError.message}`)
    }
  }
```

The only changes vs. the existing code:
- Two new lines computing `filteredAnnotations` + the conditional `log.info` block.
- `if (correctedAnnotations.length > 0)` → `if (filteredAnnotations.length > 0)`.
- `correctedAnnotations.map(a => ({ ... }))` inside `.insert(...)` → `filteredAnnotations.map(a => ({ ... }))`.

Everything else in `runClaudeAnalysis` (offset correction, sub_category validation, R2 cleanup, status update, push notification) is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- __tests__/lib/pipeline.test.ts -t "drops annotations with importance_score=1"`

Expected: PASS. Then run the full pipeline test file to confirm no regression:

Run: `npm test -- __tests__/lib/pipeline.test.ts`

Expected: all 11 tests pass (the 10 existing + the 1 new).

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npm test`

Expected: all suites pass. The change touches `lib/claude.ts` and `lib/pipeline.ts`; downstream surfaces (`lib/loaders.ts`, components reading `importance_score`) don't change behaviour because `null` and `2`/`3` scores were always supported.

- [ ] **Step 6: Run lint**

Run: `npm run lint`

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add lib/pipeline.ts __tests__/lib/pipeline.test.ts
git commit -m "pipeline: drop importance_score=1 annotations before insert

Safety net for the new prompt — the model is told not to produce
score=1, but a server-side filter ensures any slip-through never
reaches the UI. Logs only when something was dropped."
```

---

## Self-Review

**Spec coverage:**
- Goal 1 (drop regional-flair upsells across both languages): Task 1, "Do not upsell regional flair" guideline + negative examples in both prompts.
- Goal 2 (EN-NZ guardrails to parity with ES-AR): Task 1, shared `QUALITY_GUIDELINES` constant interpolated into both prompts.
- Goal 3 (naturalness only when clearly off): Task 1, redefined naturalness line in both prompts.
- Goal 4 (recalibrate `importance_score`): Task 1, new bands (2–3 only) + "do not assign 1" rule.
- Goal 5 (server-side score=1 filter): Task 2.
- All non-goals (no migration, no UI, no data cleanup, no toggle, no voice agent change): respected — neither task touches those surfaces.

**Placeholder scan:** No "TBD", "TODO", "implement later", or vague "add appropriate X" instructions. Every code block is the complete code to insert.

**Type consistency:** `ClaudeAnnotation` shape unchanged. `importance_score: number | null` (existing). `filteredAnnotations` is `ClaudeAnnotation[]` (same as `correctedAnnotations`). Test annotation objects include all fields the existing pipeline expects. Filter uses `a.importance_score !== 1` — `null !== 1` is `true`, so nulls survive (matches the spec's "null → keep" decision).
