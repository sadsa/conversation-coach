# Lesson Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured phrase-level voice lesson that launches from the Study sheet, guides the user through Explain → Model → Drill → Free use phases via Gemini Live tool calls, and saves through the existing analysis pipeline.

**Architecture:** A new `LessonClient` component mirrors `PracticeClient`'s structure but starts directly at `connecting`, tracks phase via a `set_phase` Gemini tool call, and surfaces a `LessonPhaseRail` indicator above an anchored `LessonPhrasePill`. The `WriteSheet` footer is restructured so "Practise this phrase" is the primary action and "Mark as written" moves to the overflow menu. The API route gains optional `session_type: 'lesson'` and `lesson_phrase` fields.

**Tech Stack:** Next.js 14 App Router, TypeScript, Gemini Live WebSocket (`lib/voice-agent.ts`), AssemblyAI parallel STT, Supabase, Vitest + Testing Library, Tailwind CSS

---

## File Map

| Status | Path | Change |
|---|---|---|
| Create | `supabase/migrations/20260527000000_lesson_session_type.sql` | Extend CHECK constraint + add `lesson_phrase` column |
| Modify | `lib/types.ts` | Add `'lesson'` to `Session.session_type`; add `lesson_phrase` field |
| Modify | `lib/voice-agent.ts` | Add `buildLessonSystemPrompt`, `onToolCall` callback, `tools` option, tool-call message parsing |
| Create | `components/LessonPhaseRail.tsx` | Four-node phase indicator, pure display |
| Create | `components/LessonPhrasePill.tsx` | Anchored phrase display with `[[bracket]]` tinting |
| Create | `components/LessonClient.tsx` | Full lesson session UI |
| Modify | `components/WriteSheet.tsx` | Swap footer: Practise = primary, Mark as written → overflow |
| Modify | `components/WriteList.tsx` | Thread `onPractise` prop to WriteSheet |
| Modify | `components/WriteClient.tsx` | Mount/unmount LessonClient in-place |
| Modify | `app/api/practice-sessions/route.ts` | Accept `session_type` + `lesson_phrase` |
| Create | `__tests__/lib/lesson-system-prompt.test.ts` | Unit tests for `buildLessonSystemPrompt` |
| Create | `__tests__/components/LessonPhaseRail.test.tsx` | Phase rail rendering tests |
| Modify | `__tests__/components/WriteSheet.test.tsx` | Tests for restructured footer |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260527000000_lesson_session_type.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260527000000_lesson_session_type.sql
--
-- Adds 'lesson' as a valid session_type and a lesson_phrase JSONB column
-- that records the Study item that seeded the lesson.
-- lesson_phrase shape: { correction, explanation, flashcard_front, practice_item_id }

ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_session_type_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_session_type_check
  CHECK (session_type IN ('upload', 'voice_practice', 'lesson'));

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS lesson_phrase jsonb;
```

- [ ] **Step 2: Apply the migration locally**

```bash
npx supabase db push
```

Expected: migration runs without error. If `supabase` CLI is not linked, apply the SQL directly in the Supabase dashboard SQL editor.

- [ ] **Step 3: Verify**

```bash
npx supabase db diff
```

Expected: no pending changes (the migration was applied).

---

## Task 2: Update types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/lesson-types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { Session } from '@/lib/types'

describe('Session type', () => {
  it('accepts lesson as a session_type', () => {
    const s: Session['session_type'] = 'lesson'
    expectTypeOf(s).toEqualTypeOf<'upload' | 'voice_practice' | 'lesson'>()
  })

  it('has a lesson_phrase field', () => {
    expectTypeOf<Session['lesson_phrase']>().toEqualTypeOf<{
      correction: string
      explanation: string
      flashcard_front: string | null
      practice_item_id: string
    } | null | undefined>()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- __tests__/lib/lesson-types.test.ts
```

Expected: type error — `'lesson'` not assignable to `'upload' | 'voice_practice'`.

- [ ] **Step 3: Update `lib/types.ts`**

Change the `session_type` line in the `Session` interface and add `lesson_phrase`:

```typescript
// Before:
session_type: 'upload' | 'voice_practice'

// After:
session_type: 'upload' | 'voice_practice' | 'lesson'
lesson_phrase?: {
  correction: string
  explanation: string
  flashcard_front: string | null
  practice_item_id: string
} | null
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/lib/lesson-types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260527000000_lesson_session_type.sql lib/types.ts __tests__/lib/lesson-types.test.ts
git commit -m "feat: add lesson session_type and lesson_phrase to DB + types"
```

---

## Task 3: Extend voice-agent.ts — lesson system prompt + tool call support

**Files:**
- Modify: `lib/voice-agent.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/lesson-system-prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildLessonSystemPrompt } from '@/lib/voice-agent'

const phrase = {
  correction: 'Fui al mercado ayer',
  explanation: '"Me fui" adds a reflexive pronoun that shifts the nuance.',
  flashcard_front: 'Me [[fui]] al mercado ayer',
}

describe('buildLessonSystemPrompt', () => {
  it('includes the correction verbatim', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'es-AR')
    expect(prompt).toContain('Fui al mercado ayer')
  })

  it('includes the explanation verbatim', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'es-AR')
    expect(prompt).toContain('"Me fui" adds a reflexive pronoun')
  })

  it('references all four phase names', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'es-AR')
    expect(prompt).toContain('explain')
    expect(prompt).toContain('model')
    expect(prompt).toContain('drill')
    expect(prompt).toContain('free_use')
  })

  it('references set_phase tool', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'es-AR')
    expect(prompt).toContain('set_phase')
  })

  it('includes NZ English accent instruction for en-NZ', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'en-NZ')
    expect(prompt).toMatch(/new zealand/i)
  })

  it('includes Rioplatense instruction for es-AR', () => {
    const prompt = buildLessonSystemPrompt(phrase, 'es-AR')
    expect(prompt).toMatch(/rioplatense/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- __tests__/lib/lesson-system-prompt.test.ts
```

Expected: `buildLessonSystemPrompt is not a function`.

- [ ] **Step 3: Add `buildLessonSystemPrompt` to `lib/voice-agent.ts`**

Add after the closing brace of `buildResumeSystemPrompt` (after line 275):

```typescript
/** Phrase context passed into the lesson — the correction, its explanation,
 *  and the optional [[bracketed]] flashcard front text. */
export interface LessonPhrase {
  correction: string
  explanation: string
  flashcard_front: string | null
}

/** System prompt for lesson sessions. The teacher moves through four phases
 *  (explain → model → drill → free_use) advancing via `set_phase` tool calls.
 *  The phrase correction + explanation are injected verbatim so the teacher
 *  never paraphrases the analysis Claude already did.
 */
export function buildLessonSystemPrompt(
  phrase: LessonPhrase,
  targetLanguage: TargetLanguage,
): string {
  const accentBlock = targetLanguage === 'en-NZ'
    ? `IMPORTANT — ACCENT: You speak with a clear, natural New Zealand (Kiwi) accent throughout. Unmistakably NZ — never American, never British. Hold the Kiwi vowel shifts and rising intonation on every turn. Do not drift.`
    : `IMPORTANTE — ACENTO: Hablás con acento rioplatense (porteño) claro y natural durante toda la sesión. Inconfundiblemente argentino desde la primera palabra. Pronunciá la ll/y con sheísmo. Usá el voseo. No derrapés.`

  const toneBlock = targetLanguage === 'en-NZ'
    ? `Speak at a calm, deliberate pace. You are a patient native-speaking friend who also knows how to teach — warm, unhurried, never condescending. Do not say "great job", "amazing", or use any streak/reward language.`
    : `Hablá a un ritmo tranquilo y pausado. Sos un amigo nativo que sabe enseñar — cálido, sin apuro, nunca condescendiente. No digas "muy bien", "excelente", ni uses lenguaje de logros o rachas.`

  return `${accentBlock}

You are a patient language teacher giving a focused 10-minute lesson on a single phrase. You are not a conversation partner — you are a teacher. Your only job is to help the student understand and use this one phrase naturally.

THE PHRASE:
Correction: ${phrase.correction}
Explanation: ${phrase.explanation}${phrase.flashcard_front ? `\nNative prompt: ${phrase.flashcard_front}` : ''}

${toneBlock}

LESSON STRUCTURE — four phases in order:

Phase 1 — explain (~2 minutes):
Explain why the correction matters in plain, conversational terms. Give 1–2 example sentences that show the phrase used correctly. Ask a simple yes/no comprehension check at the end. When you are satisfied the student understands, call set_phase with phase="model".

Phase 2 — model (~2 minutes):
Demonstrate the phrase in 3–4 varied contexts — different subjects, tenses, or scenarios. Keep examples short and memorable. Ask a brief comprehension check after each example. When you are satisfied the student recognises the pattern, call set_phase with phase="drill".

Phase 3 — drill (~3 minutes):
Ask the student to produce their own sentences using the phrase. Prompt them with scenarios ("Tell me something you did yesterday", "How would you say you went to the gym?"). If they make the same error being studied, gently correct it once and move on — do not dwell. When the student has produced at least 2–3 correct uses with confidence, call set_phase with phase="free_use".

Phase 4 — free_use (~3 minutes):
Have a natural conversation on any topic. Steer the conversation so the phrase comes up naturally — do not prompt it directly. When the student uses it naturally in context at least once, or when the 10 minutes are nearly up, call set_phase with phase="complete" to end the lesson.

ADVANCEMENT RULE: Call set_phase only when you have heard evidence of understanding or production. Do not advance on a timer alone. If the student is struggling, slow down and stay in the current phase longer.

Begin the lesson now. Start with phase 1 — explain the phrase to the student.`
}
```

- [ ] **Step 4: Add `onToolCall` callback and `tools` option to interfaces**

In `VoiceAgentCallbacks` (after `onTurnComplete?`), add:

```typescript
/** Fires when Gemini calls a declared tool. The callback receives the
 *  function name and parsed args. Call the returned `respond` function
 *  with a result object to send the tool_response back to Gemini. */
onToolCall?: (name: string, args: Record<string, unknown>, respond: (result: Record<string, unknown>) => void) => void
```

In `ConnectOptions` (after `openingLine?`), add:

```typescript
/** Tool declarations to include in the setup message. Each entry maps
 *  to a Gemini `function_declaration`. */
tools?: Array<{
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, { type: string; enum?: string[]; description?: string }>
    required: string[]
  }
}>
```

- [ ] **Step 5: Wire tool declarations into the setup message**

In the `ws.addEventListener('open', ...)` handler, find the `setupMsg` object and add the `tools` field after `systemInstruction`:

```typescript
// After systemInstruction block, before the transcription spread:
...(options.tools && options.tools.length > 0 ? {
  tools: [{ function_declarations: options.tools }],
} : {}),
```

- [ ] **Step 6: Parse tool calls in the message handler**

In `ws.addEventListener('message', ...)`, after the `error` block (after line ~656), add:

```typescript
// Tool call — Gemini asks us to invoke a declared function.
const toolCall = (msg as { toolCall?: { functionCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }> } }).toolCall
if (toolCall?.functionCalls) {
  for (const fc of toolCall.functionCalls) {
    callbacks.onToolCall?.(fc.name, fc.args ?? {}, (result) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          toolResponse: {
            functionResponses: [{ id: fc.id, response: { result } }],
          },
        }))
      }
    })
  }
}
```

- [ ] **Step 7: Run tests**

```bash
npm test -- __tests__/lib/lesson-system-prompt.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 8: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/voice-agent.ts __tests__/lib/lesson-system-prompt.test.ts
git commit -m "feat: add buildLessonSystemPrompt and tool call support to voice-agent"
```

---

## Task 4: LessonPhaseRail component

**Files:**
- Create: `components/LessonPhaseRail.tsx`
- Create: `__tests__/components/LessonPhaseRail.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/components/LessonPhaseRail.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LessonPhaseRail, type LessonPhase } from '@/components/LessonPhaseRail'

describe('LessonPhaseRail', () => {
  it('renders all four phase labels', () => {
    render(<LessonPhaseRail currentPhase="explain" />)
    expect(screen.getByText('Explain')).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('Drill')).toBeInTheDocument()
    expect(screen.getByText('Free use')).toBeInTheDocument()
  })

  it('marks the active phase with aria-current=step', () => {
    render(<LessonPhaseRail currentPhase="drill" />)
    expect(screen.getByText('Drill').closest('[aria-current]')).toHaveAttribute('aria-current', 'step')
  })

  it('does not mark inactive phases with aria-current', () => {
    render(<LessonPhaseRail currentPhase="drill" />)
    const explain = screen.getByText('Explain').closest('[data-phase]')
    expect(explain).not.toHaveAttribute('aria-current', 'step')
  })

  it('phases before active have data-status=done', () => {
    render(<LessonPhaseRail currentPhase="free_use" />)
    expect(screen.getByText('Explain').closest('[data-phase]')).toHaveAttribute('data-status', 'done')
    expect(screen.getByText('Model').closest('[data-phase]')).toHaveAttribute('data-status', 'done')
    expect(screen.getByText('Drill').closest('[data-phase]')).toHaveAttribute('data-status', 'done')
    expect(screen.getByText('Free use').closest('[data-phase]')).toHaveAttribute('data-status', 'active')
  })

  it('phases after active have data-status=pending', () => {
    render(<LessonPhaseRail currentPhase="model" />)
    expect(screen.getByText('Drill').closest('[data-phase]')).toHaveAttribute('data-status', 'pending')
    expect(screen.getByText('Free use').closest('[data-phase]')).toHaveAttribute('data-status', 'pending')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- __tests__/components/LessonPhaseRail.test.tsx
```

Expected: `Cannot find module '@/components/LessonPhaseRail'`.

- [ ] **Step 3: Create `components/LessonPhaseRail.tsx`**

```typescript
// components/LessonPhaseRail.tsx
//
// Four-node phase indicator for lesson sessions. Purely display — no
// internal state. Phases: explain → model → drill → free_use.
// Nodes: pending (outlined) | active (violet + pulse ring) | done (emerald + check).

export type LessonPhase = 'explain' | 'model' | 'drill' | 'free_use'

const PHASES: { id: LessonPhase; label: string }[] = [
  { id: 'explain',  label: 'Explain' },
  { id: 'model',    label: 'Model' },
  { id: 'drill',    label: 'Drill' },
  { id: 'free_use', label: 'Free use' },
]

const ORDER: LessonPhase[] = ['explain', 'model', 'drill', 'free_use']

type PhaseStatus = 'done' | 'active' | 'pending'

function statusOf(phase: LessonPhase, current: LessonPhase): PhaseStatus {
  const idx = ORDER.indexOf(phase)
  const curIdx = ORDER.indexOf(current)
  if (idx < curIdx) return 'done'
  if (idx === curIdx) return 'active'
  return 'pending'
}

interface Props {
  currentPhase: LessonPhase
}

export function LessonPhaseRail({ currentPhase }: Props) {
  return (
    <div
      role="list"
      aria-label="Lesson phases"
      className="flex items-start px-4 pt-3"
    >
      {PHASES.map((phase, i) => {
        const status = statusOf(phase.id, currentPhase)
        const isLast = i === PHASES.length - 1

        return (
          <div
            key={phase.id}
            role="listitem"
            data-phase={phase.id}
            data-status={status}
            aria-current={status === 'active' ? 'step' : undefined}
            className="flex flex-col items-center flex-1"
          >
            <div className="relative flex items-center w-full">
              {/* Left connector line (hidden for first item) */}
              <div
                aria-hidden
                className={[
                  'flex-1 h-px',
                  i === 0 ? 'invisible' : '',
                  status === 'done' ? 'bg-status-done' : 'bg-border',
                ].join(' ')}
              />

              {/* Node */}
              <div
                aria-hidden
                className={[
                  'w-[18px] h-[18px] rounded-full border flex items-center justify-center flex-shrink-0 relative z-10',
                  status === 'active'
                    ? 'bg-accent-primary border-accent-primary shadow-[0_0_0_3px_oklch(40%_0.1_285_/_0.4)]'
                    : status === 'done'
                    ? 'bg-status-done border-status-done'
                    : 'bg-bg border-border',
                ].join(' ')}
              >
                {status === 'done' && (
                  <svg
                    width="8" height="8" viewBox="0 0 8 8"
                    fill="none" stroke="white" strokeWidth="1.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="1 4 3 6 7 2" />
                  </svg>
                )}
                {status === 'active' && (
                  <div aria-hidden className="w-[5px] h-[5px] rounded-full bg-on-accent" />
                )}
              </div>

              {/* Right connector line (hidden for last item) */}
              <div
                aria-hidden
                className={[
                  'flex-1 h-px',
                  isLast ? 'invisible' : '',
                  status === 'done' ? 'bg-status-done' : 'bg-border',
                ].join(' ')}
              />
            </div>

            <span
              className={[
                'mt-[5px] text-[9.5px] font-semibold uppercase tracking-[0.06em] text-center leading-tight',
                status === 'active' ? 'text-text-primary' : '',
                status === 'done' ? 'text-status-done' : '',
                status === 'pending' ? 'text-text-tertiary' : '',
              ].join(' ')}
            >
              {phase.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/components/LessonPhaseRail.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/LessonPhaseRail.tsx __tests__/components/LessonPhaseRail.test.tsx
git commit -m "feat: add LessonPhaseRail component"
```

---

## Task 5: LessonPhrasePill component

**Files:**
- Create: `components/LessonPhrasePill.tsx`

- [ ] **Step 1: Create the component**

```typescript
// components/LessonPhrasePill.tsx
//
// Anchored phrase display shown below the phase rail throughout a lesson.
// Eyebrow "Studying" + correction in Source Serif 4 with the [[bracketed]]
// phrase tinted in --color-correction-text.

import { parseFlashcard } from '@/lib/flashcard'

interface Props {
  /** The corrected phrase, e.g. "Fui al mercado ayer". */
  correction: string
  /**
   * Optional flashcard_front with [[double-bracket]] phrase marker,
   * e.g. "Me [[fui]] al mercado ayer".
   * When present, the bracketed segment is tinted on the correction line.
   */
  flashcard_front: string | null
}

export function LessonPhrasePill({ correction, flashcard_front }: Props) {
  const parsed = flashcard_front ? parseFlashcard(flashcard_front) : null

  return (
    <div className="mx-4 mt-3 px-3 py-2.5 bg-surface border border-border-subtle rounded-[10px] flex-shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary mb-1">
        Studying
      </p>
      <p className="font-display text-[15px] text-text-primary leading-snug">
        {parsed && parsed.phrase ? (
          <>
            {parsed.before}
            <em className="text-correction not-italic">{parsed.phrase}</em>
            {parsed.after}
          </>
        ) : (
          correction
        )}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/LessonPhrasePill.tsx
git commit -m "feat: add LessonPhrasePill component"
```

---

## Task 6: LessonClient component

**Files:**
- Create: `components/LessonClient.tsx`

This is the largest task. It mirrors `PracticeClient` closely — copy its structure and remove call/chat/reroll/resume/persona concerns, then add phase tracking.

- [ ] **Step 1: Create `components/LessonClient.tsx`**

```typescript
// components/LessonClient.tsx
//
// 10-minute structured voice lesson. Launched from the Study sheet when the
// user taps "Practise this phrase". State machine:
//
//   connecting → active/warning/ending → review → analysing → /sessions/[id]
//                                           ↘ onExit() (discard / no speech / error)
//
// Phase is tracked separately from session state. It advances when Gemini
// calls the `set_phase` tool. On `complete`, transitions to review.
//
// Audio plumbing (AssemblyAI parallel STT, AudioReactiveDots, wake lock,
// scroll, keyboard shortcuts) mirrors PracticeClient exactly.

'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from '@/components/LanguageProvider'
import {
  connect,
  buildLessonSystemPrompt,
  FLASH_LIVE_MODEL,
  type LessonPhrase,
} from '@/lib/voice-agent'
import { connectAssemblyAIStream, type AssemblyAIStream } from '@/lib/assemblyai-stream'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'
import { AudioReactiveDots } from '@/components/AudioReactiveDots'
import { LoadingScreen } from '@/components/LoadingScreen'
import { ProcessingGraphic } from '@/components/ProcessingGraphic'
import { LessonPhaseRail, type LessonPhase } from '@/components/LessonPhaseRail'
import { LessonPhrasePill } from '@/components/LessonPhrasePill'
import type { TranscriptTurn } from '@/lib/types'
import type { VoiceAgent } from '@/lib/voice-agent'
import type { VoiceTickCallback } from '@/components/AudioReactiveDots'

type LessonState =
  | 'connecting'
  | 'active' | 'warning' | 'ending'
  | 'review' | 'analysing' | 'error'

const TOTAL_SECONDS     = 600   // 10 min hard cap
const WARN_SECONDS      = 480   // 2-min warning at T-120s
const COLOR_SHIFT_SECONDS = 570 // colour shift at T-30s
const ENDING_HOLD_MS    = 1500
const RMS_DECAY         = 0.85
const RMS_FLOOR         = 0.004

const SET_PHASE_TOOL = {
  name: 'set_phase',
  description: 'Advance the lesson to the next phase when you are satisfied the student is ready. Do not advance prematurely — wait for evidence of understanding.',
  parameters: {
    type: 'object',
    properties: {
      phase: {
        type: 'string',
        enum: ['model', 'drill', 'free_use', 'complete'],
        description: 'The phase to advance to.',
      },
    },
    required: ['phase'],
  },
}

interface Props {
  /** The phrase that seeds this lesson — correction, explanation, flashcard_front. */
  phrase: LessonPhrase & { practice_item_id: string }
  /** Called when the lesson ends without saving (discard, no speech, error). */
  onExit: () => void
}

export function LessonClient({ phrase, onExit }: Props) {
  const { t, targetLanguage } = useTranslation()
  const router = useRouter()
  const reducedMotion = useReducedMotion()

  const [lessonState, setLessonState] = useState<LessonState>('connecting')
  const [currentPhase, setCurrentPhase] = useState<LessonPhase>('explain')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [voiceStatus, setVoiceStatus] = useState<'listening' | 'speaking' | 'muted'>('listening')
  const [liveTurns, setLiveTurns] = useState<TranscriptTurn[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const agentRef = useRef<VoiceAgent | null>(null)
  const assemblyStreamRef = useRef<AssemblyAIStream | null>(null)
  const placeholderTurnIndexRef = useRef<number | null>(null)
  const userBubbleEmittedThisTurnRef = useRef(false)
  const userAudibleSinceLastTurnRef = useRef(false)
  const turnsRef = useRef<TranscriptTurn[]>([])
  const frozenTurnsRef = useRef<TranscriptTurn[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const onExitRef = useRef(onExit)
  useEffect(() => { onExitRef.current = onExit }, [onExit])
  const endSessionRef = useRef<() => void>(() => {})

  const userRmsRef = useRef(0)
  const agentRmsRef = useRef(0)
  const audioTickCallbacksRef = useRef<Set<VoiceTickCallback>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastSpeakerRef = useRef<'user' | 'agent' | 'idle'>('idle')
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      agentRef.current?.disconnect()
      assemblyStreamRef.current?.disconnect()
      assemblyStreamRef.current = null
      placeholderTurnIndexRef.current = null
      if (timerRef.current) clearInterval(timerRef.current)
      if (endingTimeoutRef.current) clearTimeout(endingTimeoutRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      wakeLockRef.current?.release()
      wakeLockRef.current = null
    }
  }, [])

  useEffect(() => {
    const isLive = lessonState === 'active' || lessonState === 'warning' || lessonState === 'ending' || lessonState === 'review'
    document.body.style.overflow = isLive ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [lessonState])

  useEffect(() => {
    if (lessonState !== 'review' && lessonState !== 'analysing') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [lessonState])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const sessionLive = lessonState === 'active' || lessonState === 'warning' || lessonState === 'ending'
    async function acquire() {
      if (!sessionLive || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
      try { wakeLockRef.current = await navigator.wakeLock.request('screen') } catch { /* non-fatal */ }
    }
    function onVisibilityChange() { if (document.visibilityState === 'visible') acquire() }
    if (sessionLive) {
      acquire()
      document.addEventListener('visibilitychange', onVisibilityChange)
    } else {
      wakeLockRef.current?.release()
      wakeLockRef.current = null
    }
    return () => { document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [lessonState])

  useEffect(() => {
    const sessionLive = lessonState === 'active' || lessonState === 'warning' || lessonState === 'ending'
    if (!sessionLive) { userRmsRef.current = 0; agentRmsRef.current = 0; return }
    function tick() {
      userRmsRef.current *= RMS_DECAY
      agentRmsRef.current *= RMS_DECAY
      const u = userRmsRef.current
      const a = agentRmsRef.current
      let speaker: 'user' | 'agent' | 'idle' = 'idle'
      if (!muted) {
        if (a > u && a > RMS_FLOOR) speaker = 'agent'
        else if (u > RMS_FLOOR) speaker = 'user'
      }
      if (speaker !== lastSpeakerRef.current) {
        lastSpeakerRef.current = speaker
        if (muted) setVoiceStatus('muted')
        else if (speaker === 'agent') setVoiceStatus('speaking')
        else setVoiceStatus('listening')
      }
      audioTickCallbacksRef.current.forEach(cb => cb(u, a, muted))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null } }
  }, [lessonState, muted])

  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [liveTurns])

  useEffect(() => {
    if (lessonState === 'active' || lessonState === 'warning' || lessonState === 'ending') {
      setVoiceStatus(muted ? 'muted' : 'listening')
      lastSpeakerRef.current = 'idle'
    }
  }, [muted, lessonState])

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString()
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const remainingSecs = Math.max(0, TOTAL_SECONDS - elapsed)
  const inFinalStretch = elapsed >= COLOR_SHIFT_SECONDS

  const startTimer = useCallback((fromSecs = 0) => {
    let count = fromSecs
    timerRef.current = setInterval(() => {
      count++
      if (!isMountedRef.current) return
      setElapsed(count)
      if (count === WARN_SECONDS) {
        setLessonState('warning')
        setToast('2 minutes remaining')
      }
      if (count >= TOTAL_SECONDS) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        setLessonState('ending')
        endingTimeoutRef.current = setTimeout(() => {
          endingTimeoutRef.current = null
          endSessionRef.current()
        }, ENDING_HOLD_MS)
      }
    }, 1000)
  }, [])

  const handleAssemblyAITurn = useCallback((text: string, isFinal: boolean) => {
    if (!isMountedRef.current) return
    if (placeholderTurnIndexRef.current !== null) {
      const idx = placeholderTurnIndexRef.current
      const next = [...turnsRef.current]
      next[idx] = { ...next[idx], text, pending: !isFinal }
      turnsRef.current = next
      setLiveTurns(next)
      if (isFinal) placeholderTurnIndexRef.current = null
    } else {
      const turn: TranscriptTurn = { role: 'user', text, wallMs: Date.now(), pending: !isFinal }
      turnsRef.current = [...turnsRef.current, turn]
      setLiveTurns(turnsRef.current)
      if (!isFinal) placeholderTurnIndexRef.current = turnsRef.current.length - 1
    }
    userBubbleEmittedThisTurnRef.current = true
  }, [])

  const handleModelTurnStart = useCallback(() => {
    if (!isMountedRef.current) return
    if (!userAudibleSinceLastTurnRef.current) return
    if (userBubbleEmittedThisTurnRef.current) return
    if (placeholderTurnIndexRef.current !== null) return
    const turn: TranscriptTurn = { role: 'user', text: '', wallMs: Date.now(), pending: true }
    turnsRef.current = [...turnsRef.current, turn]
    placeholderTurnIndexRef.current = turnsRef.current.length - 1
    userBubbleEmittedThisTurnRef.current = true
    setLiveTurns(turnsRef.current)
  }, [])

  const handleTurnComplete = useCallback(() => {
    if (!isMountedRef.current) return
    if (placeholderTurnIndexRef.current !== null) {
      const idx = placeholderTurnIndexRef.current
      const old = turnsRef.current[idx]
      const next = [...turnsRef.current]
      if (!old.text.trim()) next.splice(idx, 1)
      else next[idx] = { ...old, pending: false }
      turnsRef.current = next
      setLiveTurns(next)
      placeholderTurnIndexRef.current = null
    }
    userBubbleEmittedThisTurnRef.current = false
    userAudibleSinceLastTurnRef.current = false
  }, [])

  const disconnectAssemblyAI = useCallback(() => {
    assemblyStreamRef.current?.disconnect()
    assemblyStreamRef.current = null
    placeholderTurnIndexRef.current = null
    userBubbleEmittedThisTurnRef.current = false
    userAudibleSinceLastTurnRef.current = false
  }, [])

  const submitTurns = useCallback(async (turns: TranscriptTurn[]) => {
    const userTurns = turns.filter(t => t.role === 'user')
    if (userTurns.length === 0) {
      setToast('No speech detected')
      onExitRef.current()
      return
    }
    setLessonState('analysing')
    try {
      const res = await fetch('/api/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns,
          targetLanguage,
          session_type: 'lesson',
          lesson_phrase: {
            correction: phrase.correction,
            explanation: phrase.explanation,
            flashcard_front: phrase.flashcard_front,
            practice_item_id: phrase.practice_item_id,
          },
        }),
      })
      if (!res.ok) throw new Error('Analysis failed')
      const { session_id } = await res.json() as { session_id: string }
      if (isMountedRef.current) router.push(`/sessions/${session_id}`)
    } catch {
      if (isMountedRef.current) setLessonState('error')
    }
  }, [targetLanguage, phrase, router])

  const endSession = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (endingTimeoutRef.current) { clearTimeout(endingTimeoutRef.current); endingTimeoutRef.current = null }
    agentRef.current?.flush()
    agentRef.current?.disconnect()
    agentRef.current = null
    disconnectAssemblyAI()
    const settled = turnsRef.current
      .filter(turn => !turn.pending || turn.text.trim() !== '')
      .map(turn => turn.pending ? { ...turn, pending: false } : turn)
    turnsRef.current = settled
    setLiveTurns(settled)
    if (settled.length === 0) { onExitRef.current(); return }
    frozenTurnsRef.current = [...settled]
    setLessonState('review')
  }, [disconnectAssemblyAI])

  useEffect(() => { endSessionRef.current = endSession }, [endSession])

  const toggleMute = useCallback(() => {
    if (!agentRef.current) return
    setMuted(prev => { const next = !prev; agentRef.current?.setMuted(next); return next })
  }, [])

  const endSessionStableRef = useRef(endSession)
  const toggleMuteStableRef = useRef(toggleMute)
  useEffect(() => { endSessionStableRef.current = endSession }, [endSession])
  useEffect(() => { toggleMuteStableRef.current = toggleMute }, [toggleMute])

  useEffect(() => {
    if (lessonState !== 'active' && lessonState !== 'warning') return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key === 'Escape') { e.preventDefault(); endSessionStableRef.current() }
      else if (e.code === 'Space' && !e.repeat) { e.preventDefault(); toggleMuteStableRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lessonState])

  // Initial connect — runs once on mount.
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true
    const systemPrompt = buildLessonSystemPrompt(phrase, targetLanguage)
    void (async () => {
      try {
        disconnectAssemblyAI()
        const assemblyStream = await connectAssemblyAIStream(
          { onTurn: handleAssemblyAITurn },
          { language: targetLanguage },
        )
        assemblyStreamRef.current = assemblyStream
        const agent = await connect(
          targetLanguage,
          {
            onStateChange: (s) => {
              if (!isMountedRef.current) return
              if (s === 'active') { setLessonState('active'); startTimer() }
              else if (s === 'ended') {
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
                agentRef.current = null
                disconnectAssemblyAI()
                setLessonState(prev => prev === 'connecting' ? (onExitRef.current(), prev) : prev)
              }
            },
            onError: (msg) => {
              if (!isMountedRef.current) return
              const isMic = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
              setToast(isMic ? t('practice.errorMic') : t('practice.errorConnect'))
              disconnectAssemblyAI()
              onExitRef.current()
            },
            onUserAudio: (rms) => {
              userRmsRef.current = Math.max(userRmsRef.current, rms)
              if (rms > RMS_FLOOR) userAudibleSinceLastTurnRef.current = true
            },
            onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
            onMicPcm: (samples) => assemblyStreamRef.current?.pushPcm(samples),
            onModelTurnStart: handleModelTurnStart,
            onTurnComplete: handleTurnComplete,
            onTranscript: (role, text) => {
              if (!isMountedRef.current || role !== 'model') return
              const turn: TranscriptTurn = { role, text, wallMs: Date.now() }
              turnsRef.current = [...turnsRef.current, turn]
              setLiveTurns(turnsRef.current)
            },
            onToolCall: (name, args, respond) => {
              if (name !== 'set_phase') { respond({ ok: true }); return }
              const phase = args.phase as string
              if (phase === 'complete') {
                respond({ ok: true })
                // End the session after a brief beat so the teacher's final
                // words finish playing before we transition.
                setTimeout(() => endSessionRef.current(), 800)
              } else if (['model', 'drill', 'free_use'].includes(phase)) {
                setCurrentPhase(phase as LessonPhase)
                respond({ ok: true })
              } else {
                respond({ ok: false, error: 'Unknown phase' })
              }
            },
          },
          {
            transcription: true,
            inputTranscription: false,
            systemPrompt,
            model: FLASH_LIVE_MODEL,
            tools: [SET_PHASE_TOOL],
          },
        )
        agentRef.current = agent
      } catch (err) {
        if (!isMountedRef.current) return
        const isPermission = err instanceof DOMException && err.name === 'NotAllowedError'
        setToast(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
        disconnectAssemblyAI()
        onExitRef.current()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const firstOfRoleFlags = useMemo(() => {
    const seen = new Set<TranscriptTurn['role']>()
    return liveTurns.map(turn => { if (seen.has(turn.role)) return false; seen.add(turn.role); return true })
  }, [liveTurns])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (lessonState === 'connecting') {
    return <LoadingScreen targetLanguage={targetLanguage} />
  }

  if (lessonState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50dvh] gap-4 px-6 text-center">
        <p className="text-text-secondary">{t('practice.errorConnect')}</p>
        <Button variant="secondary" size="md" onClick={() => onExitRef.current()}>
          {t('practice.dismiss')}
        </Button>
      </div>
    )
  }

  if (lessonState === 'analysing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50dvh] gap-6 px-6">
        <ProcessingGraphic />
        <p className="text-text-secondary text-sm">{t('practice.analysing')}</p>
      </div>
    )
  }

  if (lessonState === 'review') {
    return (
      <div className="flex flex-col min-h-[100dvh]">
        <div className="flex-1 overflow-y-auto px-5 pt-safe-top pb-4">
          <h2 className="font-display text-2xl font-medium text-text-primary mt-6 mb-4">
            {t('practice.reviewTitle')}
          </h2>
          <div className="space-y-2">
            {frozenTurnsRef.current.map((turn, i) => (
              <div
                key={i}
                className={[
                  'px-3 py-2 rounded-xl text-sm leading-relaxed',
                  turn.role === 'user'
                    ? 'bg-accent-chip text-on-accent-chip self-end ml-8'
                    : 'bg-surface-elevated text-text-primary mr-8',
                ].join(' ')}
              >
                {turn.text}
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 pb-safe-bottom pt-3 border-t border-border-subtle space-y-2">
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => submitTurns(frozenTurnsRef.current)}
          >
            {t('practice.saveAndAnalyse')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => onExitRef.current()}
          >
            {t('practice.discard')}
          </Button>
        </div>
        {toast && <Toast message={toast} />}
      </div>
    )
  }

  // active / warning / ending
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-safe-top pb-0 flex-shrink-0">
        <button
          type="button"
          onClick={endSession}
          className="text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors py-2"
        >
          End
        </button>
        <span
          className={[
            'text-sm font-medium tabular-nums transition-colors',
            inFinalStretch ? 'text-pill-amber' : 'text-text-tertiary',
          ].join(' ')}
        >
          {formatTime(remainingSecs)}
        </span>
      </div>

      {/* Phase rail */}
      <LessonPhaseRail currentPhase={currentPhase} />

      {/* Phrase pill */}
      <LessonPhrasePill
        correction={phrase.correction}
        flashcard_front={phrase.flashcard_front}
      />

      {/* Transcript */}
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
      >
        {liveTurns.map((turn, i) => (
          <div
            key={i}
            className={[
              'flex',
              turn.role === 'user' ? 'justify-end' : 'justify-start',
            ].join(' ')}
          >
            {firstOfRoleFlags[i] && (
              <span className="sr-only">{turn.role === 'user' ? 'You' : 'Teacher'}</span>
            )}
            <div
              className={[
                'max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed',
                turn.role === 'user'
                  ? 'bg-accent-chip text-on-accent-chip rounded-br-sm'
                  : 'bg-surface-elevated text-text-primary rounded-bl-sm',
                turn.pending ? 'italic opacity-60' : '',
              ].join(' ')}
            >
              {turn.text || '…'}
            </div>
          </div>
        ))}
      </div>

      {/* Voice indicator */}
      <div className="flex items-center justify-center h-8 flex-shrink-0">
        <AnimatePresence mode="wait">
          {voiceStatus === 'muted' ? (
            <motion.span
              key="muted"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-xs text-text-tertiary"
            >
              Muted
            </motion.span>
          ) : voiceStatus === 'speaking' ? (
            <motion.div
              key="speaking"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <AudioReactiveDots audioTickCallbacksRef={audioTickCallbacksRef} compact />
            </motion.div>
          ) : (
            <motion.div
              key="listening"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-1.5"
            >
              <div className="w-1.5 h-1.5 rounded-full border border-text-tertiary" />
              <span className="text-xs text-text-tertiary">Listening</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center pb-safe-bottom pt-2 flex-shrink-0">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted}
          className="flex flex-col items-center gap-1.5"
        >
          <div className={[
            'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
            muted ? 'bg-surface-elevated border border-border' : 'bg-surface border border-border',
          ].join(' ')}>
            <Icon
              name={muted ? 'mic-off' : 'mic'}
              className="w-5 h-5 text-text-secondary"
            />
          </div>
          <span className="text-[10px] text-text-tertiary">{muted ? 'Unmute' : 'Mute'}</span>
        </button>
      </div>

      {lessonState === 'ending' && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
          <p className="text-text-secondary text-sm">{t('practice.wrappingUp')}</p>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add components/LessonClient.tsx components/LessonPhrasePill.tsx
git commit -m "feat: add LessonClient, LessonPhrasePill"
```

---

## Task 7: Restructure WriteSheet footer

**Files:**
- Modify: `components/WriteSheet.tsx`
- Modify: `__tests__/components/WriteSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `__tests__/components/WriteSheet.test.tsx`:

```typescript
describe('WriteSheet — lesson entry point', () => {
  it('renders Practise this phrase as the primary button', () => {
    const onPractise = vi.fn()
    render(<WriteSheet item={baseItem} {...noopProps} onPractise={onPractise} />)
    expect(screen.getByTestId('sheet-practise-btn')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-practise-btn')).toHaveTextContent(/practise this phrase/i)
  })

  it('calls onPractise with the item when practise button is tapped', async () => {
    const user = userEvent.setup()
    const onPractise = vi.fn()
    render(<WriteSheet item={baseItem} {...noopProps} onPractise={onPractise} />)
    await user.click(screen.getByTestId('sheet-practise-btn'))
    expect(onPractise).toHaveBeenCalledWith(baseItem)
  })

  it('moves Mark as written into the overflow menu', async () => {
    const user = userEvent.setup()
    render(<WriteSheet item={baseItem} {...noopProps} />)
    // Should not be visible as a direct footer button
    expect(screen.queryByTestId('sheet-toggle-written')).not.toBeInTheDocument()
    // Should appear in overflow menu after opening it
    await user.click(screen.getByTestId('sheet-overflow'))
    expect(screen.getByTestId('sheet-toggle-written')).toBeInTheDocument()
  })

  it('does not render practise button when onPractise is not provided', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.queryByTestId('sheet-practise-btn')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- __tests__/components/WriteSheet.test.tsx
```

Expected: tests for `sheet-practise-btn` and `sheet-toggle-written` fail.

- [ ] **Step 3: Update `WriteSheet` Props interface**

In `components/WriteSheet.tsx`, add `onPractise` to the `Props` interface:

```typescript
/** When provided, renders "Practise this phrase" as the primary footer button.
 *  Omit on the Written (archive) view where practising from the written queue
 *  is not the primary job. */
onPractise?: (item: PracticeItem) => void
```

- [ ] **Step 4: Update the footer in `WriteSheet`**

Replace the `footer` prop JSX passed to `<DockedSheet>` with:

```typescript
footer={
  <div className="flex flex-col gap-2">
    {/* Primary: Practise this phrase (when handler provided) */}
    {onPractise && (
      <button
        type="button"
        data-testid="sheet-practise-btn"
        onClick={() => onPractise(item)}
        disabled={busyAction !== null}
        className={buttonStyles({
          variant: 'primary',
          size: 'md',
          fullWidth: true,
        })}
      >
        <Icon name="play-circle" className="w-4 h-4 mr-2" />
        {t('writeSheet.practise')}
      </button>
    )}

    {/* Secondary row: overflow only (Mark as written moved inside) */}
    <div className="flex items-center justify-end">
      <OverflowMenu
        isOpen={overflowOpen}
        onOpenChange={setOverflowOpen}
        onToggleWritten={handleToggle}
        onDelete={handleDelete}
        busy={busyAction !== null}
        isWritten={isWritten}
        primaryBusyKey={primaryBusyKey}
        primaryLabelKey={primaryLabelKey}
      />
    </div>
  </div>
}
```

- [ ] **Step 5: Update `OverflowMenu` to include Mark as written**

Replace the existing `OverflowMenu` component with:

```typescript
interface OverflowMenuProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onToggleWritten: () => void
  onDelete: () => void
  busy: boolean
  isWritten: boolean
  primaryLabelKey: string
  primaryBusyKey: string
}

function OverflowMenu({
  isOpen, onOpenChange, onToggleWritten, onDelete, busy, isWritten, primaryLabelKey, primaryBusyKey,
}: OverflowMenuProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    firstItemRef.current?.focus()
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onOpenChange(false) }
    }
    function handlePointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null
      if (containerRef.current && target && !containerRef.current.contains(target)) onOpenChange(false)
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('touchstart', handlePointer)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('touchstart', handlePointer)
    }
  }, [isOpen, onOpenChange])

  return (
    <div ref={containerRef} className="relative shrink-0">
      <IconButton
        icon="more"
        aria-label={t('writeSheet.moreActionsAria')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => onOpenChange(!isOpen)}
        disabled={busy}
        size="lg"
        data-testid="sheet-overflow"
      />
      {isOpen && (
        <div
          role="menu"
          aria-label={t('writeSheet.moreActionsAria')}
          className="
            absolute bottom-full right-0 mb-2 z-10
            min-w-[200px] py-1
            bg-surface-elevated border border-border rounded-lg
            shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]
            motion-safe:animate-[fadein_140ms_ease-out_both]
          "
        >
          {/* Mark as written / Move back */}
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            data-testid="sheet-toggle-written"
            onClick={() => { onOpenChange(false); onToggleWritten() }}
            disabled={busy}
            className="
              w-full flex items-center gap-3 px-3 py-2 text-left
              text-text-primary hover:bg-surface disabled:opacity-50
              transition-colors rounded-md text-sm font-medium
            "
          >
            <Icon name={isWritten ? 'rotate-ccw' : 'check'} className="w-4 h-4 shrink-0 text-text-tertiary" />
            {busy ? t(primaryBusyKey) : t(primaryLabelKey)}
          </button>

          <div className="my-1 border-t border-border-subtle" />

          {/* Delete */}
          <button
            type="button"
            role="menuitem"
            onClick={() => { onOpenChange(false); onDelete() }}
            disabled={busy}
            data-testid="sheet-delete"
            aria-label={t('writeSheet.deleteAria')}
            className="
              w-full flex items-center gap-3 px-3 py-2 text-left
              text-status-error hover:bg-error-bg/40 disabled:opacity-50
              transition-colors rounded-md text-sm font-medium
            "
          >
            <Icon name="trash" className="w-4 h-4 shrink-0" />
            {t('writeSheet.deleteLabel')}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Add translation key**

In `lib/i18n.ts` (or wherever translation keys are defined), add `writeSheet.practise`. Search for the existing `writeSheet.markWritten` key to find the right file and pattern, then add alongside it:

```
'writeSheet.practise': 'Practise this phrase',
```

- [ ] **Step 7: Run WriteSheet tests**

```bash
npm test -- __tests__/components/WriteSheet.test.tsx
```

Expected: all tests pass including the new lesson entry point tests.

- [ ] **Step 8: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add components/WriteSheet.tsx __tests__/components/WriteSheet.test.tsx
git commit -m "feat: WriteSheet — Practise as primary, Mark as written to overflow"
```

---

## Task 8: Wire LessonClient into WriteClient and WriteList

**Files:**
- Modify: `components/WriteList.tsx`
- Modify: `components/WriteClient.tsx`

- [ ] **Step 1: Thread `onPractise` through WriteList to WriteSheet**

In `components/WriteList.tsx`, find the `Props` interface and add:

```typescript
onPractise?: (item: PracticeItem) => void
```

Find where `<WriteSheet>` is rendered inside WriteList (search for `<WriteSheet`) and add the prop:

```typescript
onPractise={onPractise}
```

Find the `WriteList` function signature and pass it through:

```typescript
export function WriteList({ items, onDeleted, onPractise }: Props) {
```

- [ ] **Step 2: Mount LessonClient in WriteClient**

Replace `components/WriteClient.tsx` with:

```typescript
// components/WriteClient.tsx
//
// Client island for /write — the Study queue surface.
// When the user taps "Practise this phrase" in WriteSheet, LessonClient
// mounts in-place (same pattern as PracticeClient on the home surface).
// onExit unmounts LessonClient and returns to the study list.

'use client'
import { useState } from 'react'
import { WriteList } from '@/components/WriteList'
import { LessonClient } from '@/components/LessonClient'
import { MethodologyEyebrow, type Pillar } from '@/components/MethodologyEyebrow'
import { useTranslation } from '@/components/LanguageProvider'
import type { PracticeItem } from '@/lib/types'

interface Props {
  initialItems: PracticeItem[]
  lockedPillars?: ReadonlyArray<Pillar>
}

export function WriteClient({ initialItems, lockedPillars }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>(initialItems)
  const [lessonItem, setLessonItem] = useState<PracticeItem | null>(null)

  if (lessonItem) {
    return (
      <LessonClient
        phrase={{
          correction: lessonItem.correction ?? lessonItem.original,
          explanation: lessonItem.explanation,
          flashcard_front: lessonItem.flashcard_front,
          practice_item_id: lessonItem.id,
        }}
        onExit={() => setLessonItem(null)}
      />
    )
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl md:text-4xl font-medium text-text-primary">
          {t('write.title')}
        </h1>
        <MethodologyEyebrow active="study" lockedPillars={lockedPillars} />
      </header>
      <WriteList
        items={items}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
        onPractise={setLessonItem}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/WriteClient.tsx components/WriteList.tsx
git commit -m "feat: mount LessonClient in-place from WriteClient"
```

---

## Task 9: Update API route to accept lesson session type

**Files:**
- Modify: `app/api/practice-sessions/route.ts`

- [ ] **Step 1: Update the route**

In `app/api/practice-sessions/route.ts`, update the destructuring of the request body and the session insert:

```typescript
// Change this:
const { turns, targetLanguage } = await req.json() as {
  turns: TranscriptTurn[]
  targetLanguage: TargetLanguage
}

// To this:
const { turns, targetLanguage, session_type, lesson_phrase } = await req.json() as {
  turns: TranscriptTurn[]
  targetLanguage: TargetLanguage
  session_type?: 'voice_practice' | 'lesson'
  lesson_phrase?: {
    correction: string
    explanation: string
    flashcard_front: string | null
    practice_item_id: string
  }
}
```

Update the session insert to use the new fields:

```typescript
// Change:
session_type: 'voice_practice',

// To:
session_type: session_type ?? 'voice_practice',
...(lesson_phrase ? { lesson_phrase } : {}),
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/practice-sessions/route.ts
git commit -m "feat: practice-sessions route accepts lesson session_type and lesson_phrase"
```

---

## Task 10: Add mic-off icon if missing

**Files:**
- Modify: `components/Icon.tsx` (only if `mic-off` icon is not already defined)

- [ ] **Step 1: Check if mic-off exists**

```bash
grep -n "mic-off\|micOff" components/Icon.tsx
```

If the output contains `mic-off`, skip to Task 11. Otherwise continue.

- [ ] **Step 2: Add the mic-off icon**

Find the `mic` icon definition in `components/Icon.tsx` and add `mic-off` immediately after it:

```typescript
'mic-off': (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
),
```

- [ ] **Step 3: Also add play-circle if missing**

```bash
grep -n "play-circle\|playCircle" components/Icon.tsx
```

If not present, add after `mic-off`:

```typescript
'play-circle': (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
  </svg>
),
```

- [ ] **Step 4: Commit (if changes were made)**

```bash
git add components/Icon.tsx
git commit -m "feat: add mic-off and play-circle icons"
```

---

## Task 11: Smoke test end-to-end

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to the Study page**

Open http://localhost:3000/write. Tap any phrase row to open the WriteSheet.

Expected: WriteSheet opens with "Practise this phrase" as the primary (violet) button and a ⋮ overflow button.

- [ ] **Step 3: Verify overflow menu**

Tap ⋮.

Expected: "Mark as written" and "Delete" appear in the popover.

- [ ] **Step 4: Tap "Practise this phrase"**

Expected: `LessonClient` mounts with a loading screen, then connects to Gemini Live. The teacher begins explaining the phrase.

- [ ] **Step 5: Verify phase rail**

Expected: Phase rail shows "Explain" as active (violet node), Model / Drill / Free use as pending (outlined). Phrase pill shows the studied correction below.

- [ ] **Step 6: Let the lesson run briefly, then tap End**

Expected: Review screen shows the conversation turns. "Save and analyse" and "Discard" buttons present.

- [ ] **Step 7: Tap "Save and analyse"**

Expected: Loading spinner, then redirect to `/sessions/[id]` with the lesson transcript and annotations.

- [ ] **Step 8: Run final test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat: lesson mode — complete implementation"
```
