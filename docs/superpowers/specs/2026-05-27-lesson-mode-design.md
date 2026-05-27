# Lesson Mode — Design Spec
**Date:** 2026-05-27  
**Status:** Approved

## Overview

A focused, phrase-level lesson mode that closes the learning loop: after reviewing feedback on the Study page, the user can tap "Practise this phrase" to launch a structured 10-minute voice lesson with an AI teacher. The teacher explains the phrase, models it in context, drills the user, then has a free conversation — advancing through phases autonomously via Gemini Live tool calls. The session is recorded, transcribed, and analysed through the existing pipeline.

---

## User Journey

1. User opens a phrase in the **Study sheet** (WriteSheet)
2. Taps **"Practise this phrase"** — the new primary footer button
3. Brief loading screen → Gemini Live connects
4. Teacher-led voice lesson (~10 min): Explain → Model → Drill → Free use
5. Session ends (auto or manual) → Review state → Save → Claude analysis → `/sessions/[id]`

---

## Entry Point

### WriteSheet footer changes

**Before:** `[Mark as written] [⋮]`  
**After:** `[Practise this phrase ▶] [⋮]`

- "Practise this phrase" becomes the **primary full-width button** in violet (`--color-accent-primary`) — same token used for all primary actions.
- "Mark as written" and "Delete" move into the **overflow menu (⋮)**.
- Button icon: play-circle (not microphone — avoids collision with the live-call semantic on the home screen).
- No badge, no gamification label.

The `PracticeItem` in scope provides `correction`, `explanation`, `flashcard_front`, `flashcard_back`, and `session_id` to seed the lesson.

---

## State Machine

```
lesson_loading → connecting → active → review → analysing → /sessions/[id]
                                ↑
                         phase: explain | model | drill | free_use
                         (advanced by set_phase tool calls from Gemini)
```

### States

| State | Description |
|---|---|
| `lesson_loading` | Brief spinner. Phrase pill shown immediately. No persona fetch, no ringing screen. |
| `connecting` | WebSocket handshake. Teacher speaks first — opens with explanation of the phrase. |
| `active` | 10-min hard cap. Phase rail live. Mute control visible. Timer counts down. |
| `review` | User confirms save or discard. Identical to practice review state. |
| `analysing` | POST to `/api/practice-sessions`. Redirect to `/sessions/[id]` on success. |

### Timing
- Hard cap: **600 seconds** (10 min, vs 300 for practice)
- Warning toast: **T−2 min** (vs T−1 min for practice)
- Colour shift on timer: **T−30s** (same as practice)
- Ending hold: **1500ms** (same as practice)

---

## Phase Rail

### Phases (in order)

| Phase | Teacher job | Target duration |
|---|---|---|
| **Explain** | Explain why the correction matters; 1–2 example sentences | ~2 min |
| **Model** | Demonstrate phrase in 3–4 varied contexts; yes/no comprehension checks | ~2 min |
| **Drill** | Prompt student to produce sentences; correct gently inline | ~3 min |
| **Free use** | Natural conversation; steer to elicit the phrase without prompting it directly | ~3 min |

### `set_phase` tool

Declared in the Gemini Live session config alongside the teacher system prompt:

```json
{
  "name": "set_phase",
  "description": "Advance the lesson to the next phase when you are satisfied the student is ready. Do not advance prematurely — wait for evidence of understanding.",
  "parameters": {
    "type": "object",
    "properties": {
      "phase": {
        "type": "string",
        "enum": ["model", "drill", "free_use", "complete"]
      }
    },
    "required": ["phase"]
  }
}
```

- `explain` is the implicit start — no tool call needed.
- The client sends `tool_response: { ok: true }` after each phase update.
- On `complete`, the client transitions to `review`.
- The phase rail node becomes active (violet pulse), done (green check), or pending (outlined) based on current phase.

### UI

- Phase rail sits between the top bar and the phrase pill.
- Nodes: 18px circles. Active = violet + glow ring. Done = emerald fill + checkmark. Pending = outlined.
- Connecting lines between nodes: `--color-border` (pending→pending), emerald (done→done/active).
- Labels: 9.5px uppercase. Active = `--color-text-primary`. Done = emerald. Pending = `--color-text-tertiary`.
- Phrase pill anchored below the rail throughout: eyebrow "Studying" + correction in Source Serif 4 with phrase highlighted in `--color-correction-text`.

### Voice indicator
- Teacher speaking → violet animated waveform (same as existing practice)
- User speaking → emerald animated waveform
- Idle/listening → small dot + "Listening" label in tertiary text

---

## Teacher System Prompt

New function in `lib/voice-agent.ts`:

```typescript
buildLessonSystemPrompt(
  phrase: { correction: string; explanation: string; flashcard_front: string | null },
  targetLanguage: TargetLanguage
): string
```

### Prompt structure

1. **Role** — Patient language teacher giving a focused 10-minute lesson on one phrase. Not a conversation partner. Not a tutor who lectures. A patient native-speaking friend who also knows how to teach.
2. **The phrase** — `correction`, `explanation`, and flashcard pair injected verbatim. Teacher must not paraphrase the explanation — it came from careful analysis.
3. **Phase curriculum** — Explicit instructions for each phase with rough time targets and the `set_phase` call instruction.
4. **Advancement rule** — "Call `set_phase` only when you have heard evidence that the student understands and can use the phrase. Do not advance on a timer."
5. **Language/accent** — Same Rioplatense Spanish or NZ English steering as `buildPracticeSystemPrompt`. Copy constraints verbatim.
6. **Tone constraints** — Patient, warm, never condescending. No "great job!", no streak language, no therapy-speak. Correct errors gently and immediately, then move on — don't dwell.

---

## Data Model

### `sessions` table changes

```sql
-- Extend existing CHECK constraint to include 'lesson'
session_type: 'upload' | 'voice_practice' | 'lesson'

-- New nullable JSONB column
ALTER TABLE sessions ADD COLUMN lesson_phrase jsonb;
-- Shape: { correction, explanation, flashcard_front, practice_item_id }
```

`practice_item_id` links back to the Study item that launched the lesson. Enables future "practised N times" signals without new tables.

### `POST /api/practice-sessions` changes

Accepts two new optional fields:
- `session_type: 'lesson'` (defaults to `'voice_practice'` if omitted — backwards compatible)
- `lesson_phrase: { correction, explanation, flashcard_front, practice_item_id }`

Everything else in the pipeline — AssemblyAI transcription, Claude analysis, annotations, practice items created from annotations — runs unchanged.

---

## New Components

| Component | Description |
|---|---|
| `LessonClient.tsx` | Top-level lesson UI. Wraps Gemini Live session. Owns phase state. Mirrors `PracticeClient` structure with lesson-specific states and phase rail. |
| `LessonPhaseRail.tsx` | Four-node phase indicator. Accepts `currentPhase` prop. Pure display — no internal state. |
| `LessonPhrasePill.tsx` | Anchored phrase display below the rail. Accepts `correction` and `flashcard_front`. Uses `parseFlashcard()` for `[[bracketed]]` phrase tinting. |

---

## Modified Files

| File | Change |
|---|---|
| `lib/voice-agent.ts` | Add `buildLessonSystemPrompt()`. Add `set_phase` tool declaration. Handle `set_phase` tool calls in the WebSocket message parser. |
| `lib/types.ts` | Add `'lesson'` to `session_type` union. Add `lesson_phrase` field to `Session` type. |
| `components/WriteSheet.tsx` | Swap footer: "Practise this phrase" as primary button; "Mark as written" + "Delete" into overflow. Add `onPractise` prop. |
| `app/write/page.tsx` (or `WriteClient.tsx`) | Handle `onPractise` — mount `LessonClient` in-place (same pattern as `PracticeClient` on home). |
| `app/api/practice-sessions/route.ts` | Accept `session_type: 'lesson'` and `lesson_phrase`. Write to DB. |
| `migrations/` | Migration: extend `session_type` CHECK, add `lesson_phrase` column. |

---

## Out of Scope

- Multi-phrase lesson queue (select multiple Study items for one session) — future evolution
- Lesson history / "practised N times" UI — data is captured via `practice_item_id`, UI deferred
- SRS integration — `ts-fsrs` columns already reserved on the table; not wired here
- Lesson-specific analysis prompt tuning — Claude analysis runs as-is; lesson-specific prompt improvements are a separate task

---

## Open Questions (resolved)

- **How do phases advance?** Model-invoked `set_phase` tool call (Option A chosen).
- **Lesson duration?** 10 minutes hard cap.
- **Entry point?** WriteSheet — "Practise this phrase" as primary button.
- **Save pipeline?** Full pipeline: AssemblyAI + Claude analysis + practice items created as normal.
