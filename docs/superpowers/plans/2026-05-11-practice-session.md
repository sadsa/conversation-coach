# Practice Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/practice` page where users have a deliberate 5-minute Spanish conversation with Gemini, then receive Claude annotations on their speech turns via the existing session review UI.

**Architecture:** `voice-agent.ts` gains an optional `transcription` flag that enables Gemini Live input/output transcription; a new `PracticeClient` component (mounted only on `/practice`, not globally) drives the session state machine, collects transcript turns, and submits them to a new synchronous `POST /api/practice-sessions` route that creates a session, runs Claude analysis, and returns a `session_id` for redirect. The existing `/sessions/[id]` review UI works without modification.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (`@supabase/supabase-js`), Gemini Live WebSocket API, Anthropic SDK (`analyseUserTurns`), Vitest + React Testing Library.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260511000000_add_session_type.sql` | Create | Add `session_type` column to `sessions` |
| `lib/types.ts` | Modify | Add `TranscriptTurn` interface |
| `lib/i18n.ts` | Modify | Add `nav.practice` + all `practice.*` strings (en + es) |
| `lib/voice-agent.ts` | Modify | Add `ConnectOptions`, `onTranscript` callback, transcription message parsing, `buildPracticeSystemPrompt()` |
| `components/nav-tabs.tsx` | Modify | Add Practice tab between Home and Write |
| `components/AppHeader.tsx` | Modify | Add `/practice` to `sectionKeyFor`; hide `VoiceTrigger` on `/practice` |
| `components/VoiceTrigger.tsx` | No change | Already hides correctly based on voice state |
| `app/practice/page.tsx` | Create | Thin RSC: auth check + render `<PracticeClient>` |
| `components/PracticeClient.tsx` | Create | Client island — full practice session state machine |
| `app/api/practice-sessions/route.ts` | Create | POST: validate → session → segments → Claude → annotations → ready |
| `__tests__/lib/voice-agent.test.ts` | Modify | Add tests for `buildPracticeSystemPrompt` + transcription option shape |
| `__tests__/api/practice-sessions.test.ts` | Create | Unit tests for POST route |

---

## Task 1: DB Migration — add `session_type`

**Files:**
- Create: `supabase/migrations/20260511000000_add_session_type.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260511000000_add_session_type.sql
ALTER TABLE sessions
  ADD COLUMN session_type text NOT NULL DEFAULT 'upload'
  CHECK (session_type IN ('upload', 'voice_practice'));
```

- [ ] **Step 2: Apply locally**

```bash
supabase db push
```

Expected: migration applies cleanly, no errors. All existing rows get `session_type = 'upload'` via the `DEFAULT`.

- [ ] **Step 3: Verify**

```bash
supabase db query --linked "SELECT session_type, count(*) FROM sessions GROUP BY session_type;"
```

Expected: one row showing `upload | <count>`. If your local DB is empty, that's fine — confirm no error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260511000000_add_session_type.sql
git commit -m "feat(db): add session_type column to sessions"
```

---

## Task 2: Types + i18n

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/i18n.ts`

- [ ] **Step 1: Add `TranscriptTurn` to `lib/types.ts`**

Add after the `TranscriptSegment` interface (after line 48):

```ts
/** A single completed turn collected from a Gemini Live practice session. */
export interface TranscriptTurn {
  role: 'user' | 'model'
  text: string
  wallMs: number  // Date.now() when the turn completed — used for segment timestamps
}
```

- [ ] **Step 2: Add practice strings to `lib/i18n.ts` — English section**

In the `en: { ... }` block, add a `// Practice` section. Find the navigation section and add below it (before `// Sessions` or wherever fits alphabetically):

```ts
    // Practice
    'nav.practice': 'Practice',
    'practice.description': 'Speak Spanish for up to 5 minutes. Your mistakes will be reviewed afterwards.',
    'practice.timeLimit': 'Up to 5 minutes',
    'practice.start': 'Start session',
    'practice.end': 'End session',
    'practice.warningToast': '1 minute left',
    'practice.analysing': 'Reviewing your conversation…',
    'practice.errorConnect': "Couldn't connect — check your connection",
    'practice.errorMic': 'Microphone access required',
    'practice.errorNoSpeech': 'No speech detected',
    'practice.errorAnalysis': 'Review failed',
    'practice.tryAgain': 'Try again',
    'practice.navAway': 'Your conversation is being reviewed. Leave anyway?',
    'practice.timerAria': 'Session timer: {time}',
```

- [ ] **Step 3: Add practice strings to `lib/i18n.ts` — Spanish section**

In the `es: { ... }` block, add matching entries:

```ts
    // Practice
    'nav.practice': 'Práctica',
    'practice.description': 'Hablá español hasta 5 minutos. Tus errores se revisan después.',
    'practice.timeLimit': 'Hasta 5 minutos',
    'practice.start': 'Iniciar sesión',
    'practice.end': 'Terminar sesión',
    'practice.warningToast': '1 minuto restante',
    'practice.analysing': 'Revisando tu conversación…',
    'practice.errorConnect': 'No se pudo conectar — revisá tu conexión',
    'practice.errorMic': 'Se necesita acceso al micrófono',
    'practice.errorNoSpeech': 'No se detectó ninguna voz',
    'practice.errorAnalysis': 'Error en la revisión',
    'practice.tryAgain': 'Intentar de nuevo',
    'practice.navAway': 'Tu conversación se está revisando. ¿Salir de todos modos?',
    'practice.timerAria': 'Temporizador: {time}',
```

- [ ] **Step 4: Run i18n tests**

```bash
npm test -- __tests__/lib/i18n.test.ts
```

Expected: all pass (no new test needed — the test covers key lookup; any typo in the key name will surface as a `key` returned instead of a translation).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/i18n.ts
git commit -m "feat(practice): add TranscriptTurn type and i18n strings"
```

---

## Task 3: `voice-agent.ts` — transcription support + practice prompt

**Files:**
- Modify: `lib/voice-agent.ts`

- [ ] **Step 1: Add `ConnectOptions` interface and extend `VoiceAgentCallbacks`**

Add after the `VoiceAgentCallbacks` interface definition (around line 13):

```ts
export interface ConnectOptions {
  /** When true, enables Gemini Live input + output transcription callbacks. */
  transcription?: boolean
}
```

Add `onTranscript` to `VoiceAgentCallbacks`:

```ts
export interface VoiceAgentCallbacks {
  onStateChange: (state: VoiceAgentState) => void
  onError: (message: string) => void
  onUserAudio?: (rms: number) => void
  onAgentAudio?: (rms: number) => void
  onTranscript?: (role: 'user' | 'model', text: string) => void
}
```

- [ ] **Step 2: Add `buildPracticeSystemPrompt`**

Add this function after `buildSystemPrompt()` (before the `connect` export):

```ts
/** System prompt for practice sessions — Gemini acts as a conversation partner, not a coach. */
export function buildPracticeSystemPrompt(targetLanguage: TargetLanguage): string {
  if (targetLanguage === 'en-NZ') {
    return `You are a friendly native New Zealand English speaker having a casual conversation with a language learner.
Keep your responses natural and concise — 1–3 sentences per turn so the learner gets plenty of speaking time.
Do NOT correct the learner's English mid-conversation. Do NOT give grammar explanations or coaching tips.
Respond only in English. React naturally to what the learner says — ask follow-up questions, share opinions, keep the conversation flowing.
If the learner seems to struggle, respond naturally as any conversationalist would — do not switch to a teaching mode.`
  }
  // Default: es-AR Rioplatense
  return `Sos un hablante nativo de español rioplatense teniendo una charla cotidiana con alguien que está aprendiendo el idioma.
Respondé de forma natural y breve — 1 a 3 oraciones por turno para que el otro tenga bastante tiempo para hablar.
NO corrijas los errores del aprendiz durante la conversación. NO des explicaciones de gramática ni consejos de coaching.
Respondé únicamente en español. Reaccioná de forma natural — hacé preguntas de seguimiento, compartí opiniones, mantené la charla fluyendo.
Usá el voseo y el vocabulario típico del Río de la Plata (ché, dale, bárbaro, etc.) de manera natural, no exagerada.`
}
```

- [ ] **Step 3: Update `connect` signature to accept `ConnectOptions`**

Change the function signature from:

```ts
export async function connect(
  targetLanguage: TargetLanguage,
  callbacks: VoiceAgentCallbacks,
  routeContext: VoiceRouteContext = { kind: 'other' },
  pageContext?: VoicePageContext
): Promise<VoiceAgent> {
```

to:

```ts
export async function connect(
  targetLanguage: TargetLanguage,
  callbacks: VoiceAgentCallbacks,
  routeContext: VoiceRouteContext = { kind: 'other' },
  pageContext?: VoicePageContext,
  options: ConnectOptions = {},
): Promise<VoiceAgent> {
```

- [ ] **Step 4: Add transcript buffer vars inside `connect`**

Add just before the `ws.addEventListener('open', ...)` call:

```ts
  let userTranscriptBuffer = ''
  let modelTranscriptBuffer = ''
```

- [ ] **Step 5: Add transcription config to the Gemini setup message**

In the `ws.addEventListener('open', ...)` handler, update the setup message to conditionally include transcription config. Replace the existing `ws.send(JSON.stringify({ setup: { ... } }))` with:

```ts
  ws.addEventListener('open', () => {
    callbacks.onStateChange('connecting')
    const setupMsg: Record<string, unknown> = {
      setup: {
        model: 'models/gemini-3.1-flash-live-preview',
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          ...(options.transcription ? {
            inputTranscription: { enabled: true },
            outputTranscription: { enabled: true },
          } : {}),
        },
        systemInstruction: {
          parts: [{ text: buildSystemPrompt(targetLanguage, routeContext, pageContext) }],
        },
      },
    }
    ws.send(JSON.stringify(setupMsg))
  })
```

- [ ] **Step 6: Parse transcription messages in the WebSocket message handler**

In `ws.addEventListener('message', ...)`, after the existing `setupComplete` check and the `serverContent` block, add transcription handling. The updated message handler should extend the existing type cast and add:

```ts
    // Input transcription — user's speech (top-level message, not in serverContent)
    const inputTranscription = (msg as { inputTranscription?: { text?: string; finished?: boolean } }).inputTranscription
    if (options.transcription && inputTranscription?.text) {
      userTranscriptBuffer += inputTranscription.text
      if (inputTranscription.finished) {
        if (userTranscriptBuffer.trim()) {
          callbacks.onTranscript?.('user', userTranscriptBuffer.trim())
        }
        userTranscriptBuffer = ''
      }
    }

    // Output transcription — model's speech (inside serverContent)
    const outputTranscription = (msg as { serverContent?: { outputTranscription?: { text?: string } } }).serverContent?.outputTranscription
    if (options.transcription && outputTranscription?.text) {
      modelTranscriptBuffer += outputTranscription.text
    }

    // turnComplete — model's turn is done; flush model transcript buffer
    const turnComplete = (msg as { serverContent?: { turnComplete?: boolean } }).serverContent?.turnComplete
    if (options.transcription && turnComplete && modelTranscriptBuffer.trim()) {
      callbacks.onTranscript?.('model', modelTranscriptBuffer.trim())
      modelTranscriptBuffer = ''
    }
```

Place this block after the `serverContent?.interrupted` check and the `serverContent?.modelTurn?.parts` block, before the `error` check.

- [ ] **Step 7: Run voice-agent tests**

```bash
npm test -- __tests__/lib/voice-agent.test.ts
```

Expected: all existing tests pass (we only added to the API, didn't change existing behaviour).

- [ ] **Step 8: Commit**

```bash
git add lib/voice-agent.ts
git commit -m "feat(voice-agent): add transcription support + buildPracticeSystemPrompt"
```

---

## Task 4: Tests for `voice-agent.ts` additions

**Files:**
- Modify: `__tests__/lib/voice-agent.test.ts`

- [ ] **Step 1: Add `buildPracticeSystemPrompt` tests**

Add a new `describe('buildPracticeSystemPrompt')` block at the end of the file:

```ts
import { buildSystemPrompt, buildPracticeSystemPrompt } from '@/lib/voice-agent'

// ... existing tests ...

describe('buildPracticeSystemPrompt', () => {
  it('instructs Gemini to use Rioplatense register for es-AR', () => {
    const prompt = buildPracticeSystemPrompt('es-AR')
    expect(prompt).toContain('rioplatense')
    expect(prompt).toContain('voseo')
    expect(prompt).not.toContain('coach')
    expect(prompt).not.toContain('corrij')  // no mid-conversation correction
  })

  it('instructs Gemini to use NZ English for en-NZ', () => {
    const prompt = buildPracticeSystemPrompt('en-NZ')
    expect(prompt).toContain('New Zealand')
    expect(prompt).not.toContain('correct')  // no mid-conversation correction
  })

  it('does not mention coaching or corrections', () => {
    const esPrompt = buildPracticeSystemPrompt('es-AR')
    const enPrompt = buildPracticeSystemPrompt('en-NZ')
    // Both should tell Gemini NOT to correct the learner
    expect(esPrompt).toContain('NO corrij')
    expect(enPrompt).toContain('Do NOT correct')
  })
})
```

- [ ] **Step 2: Run the new tests**

```bash
npm test -- __tests__/lib/voice-agent.test.ts
```

Expected: all tests pass including the new block.

- [ ] **Step 3: Commit**

```bash
git add __tests__/lib/voice-agent.test.ts
git commit -m "test(voice-agent): add buildPracticeSystemPrompt tests"
```

---

## Task 5: Navigation — Practice tab + header

**Files:**
- Modify: `components/nav-tabs.tsx`
- Modify: `components/AppHeader.tsx`

- [ ] **Step 1: Add Practice tab to `NAV_TABS`**

In `components/nav-tabs.tsx`, insert a new tab object between the Home entry (href `'/'`) and the Write entry (href `'/write'`). Use a person-speaking / chat-bubble with soundwaves icon:

```ts
  {
    href: '/practice',
    labelKey: 'nav.practice',
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
        className="w-5 h-5 flex-shrink-0" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M9 10h.01M12 10h.01M15 10h.01" strokeWidth={2} strokeLinecap="round" />
      </svg>
    ),
    iconLg: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
        className="w-6 h-6" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M9 10h.01M12 10h.01M15 10h.01" strokeWidth={2} strokeLinecap="round" />
      </svg>
    ),
  },
```

- [ ] **Step 2: Add `/practice` to `sectionKeyFor` in `AppHeader.tsx`**

In `function sectionKeyFor(pathname: string | null)`, add:

```ts
  if (pathname.startsWith('/practice')) return 'nav.practice'
```

After the existing `/write` and `/settings` checks.

- [ ] **Step 3: Hide `VoiceTrigger` on `/practice` in `AppHeader.tsx`**

In `AppHeader`, the `VoiceTrigger` is rendered inside the right cluster. Wrap it so it does not render on `/practice`:

```tsx
{!pathname?.startsWith('/practice') && (
  <VoiceTrigger state={voice.state} onStart={voice.onStart} />
)}
```

`pathname` is already available in `AppHeader` from `usePathname()`.

- [ ] **Step 4: Verify nav renders 4 tabs**

```bash
npm run lint
```

Expected: no errors. The bottom nav and drawer will pick up the new tab automatically since they both iterate `NAV_TABS`.

- [ ] **Step 5: Commit**

```bash
git add components/nav-tabs.tsx components/AppHeader.tsx
git commit -m "feat(nav): add Practice tab; hide voice trigger on /practice"
```

---

## Task 6: `app/practice/page.tsx` + `PracticeClient` — idle + connecting states

**Files:**
- Create: `app/practice/page.tsx`
- Create: `components/PracticeClient.tsx`

- [ ] **Step 1: Create the RSC page**

```ts
// app/practice/page.tsx
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { PracticeClient } from '@/components/PracticeClient'

export default async function PracticePage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  return <PracticeClient targetLanguage={user.targetLanguage} />
}
```

Note: `getAuthenticatedUser()` returns `{ id, email, targetLanguage }` — verify the field name matches what `lib/auth.ts` actually returns. If the field is named differently (e.g. `target_language`), use that.

- [ ] **Step 2: Verify the auth return shape**

```bash
grep -n "targetLanguage\|target_language\|return {" /Users/entelect-jbiddick/Projects/conversation-coach/lib/auth.ts | head -15
```

Adjust the field name in `page.tsx` if needed.

- [ ] **Step 3: Create `PracticeClient` with idle + connecting states**

```tsx
// components/PracticeClient.tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { connect } from '@/lib/voice-agent'
import { buildPracticeSystemPrompt } from '@/lib/voice-agent'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'
import { Modal } from '@/components/Modal'
import type { TargetLanguage } from '@/lib/types'
import type { TranscriptTurn } from '@/lib/types'
import type { VoiceAgent } from '@/lib/voice-agent'

type PracticeState = 'idle' | 'connecting' | 'active' | 'warning' | 'ending' | 'analysing' | 'error'

interface Props {
  targetLanguage: TargetLanguage
}

const WARN_SECONDS = 240  // 4 minutes
const END_SECONDS = 300   // 5 minutes

export function PracticeClient({ targetLanguage }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const [practiceState, setPracticeState] = useState<PracticeState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [showNavAwayModal, setShowNavAwayModal] = useState(false)
  const [analysisError, setAnalysisError] = useState(false)

  const agentRef = useRef<VoiceAgent | null>(null)
  const turnsRef = useRef<TranscriptTurn[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      agentRef.current?.disconnect()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Block voice coach trigger while practice is active
  useEffect(() => {
    if (practiceState !== 'idle') {
      document.body.dataset.practiceActive = 'true'
    } else {
      delete document.body.dataset.practiceActive
    }
    return () => { delete document.body.dataset.practiceActive }
  }, [practiceState])

  // Warn on browser navigation during analysing
  useEffect(() => {
    if (practiceState !== 'analysing') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [practiceState])

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const startTimer = useCallback(() => {
    let count = 0
    timerRef.current = setInterval(() => {
      count++
      if (!isMountedRef.current) return
      setElapsed(count)
      if (count === WARN_SECONDS) {
        setPracticeState('warning')
        setToast(t('practice.warningToast'))
      }
      if (count >= END_SECONDS) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        endSession()
      }
    }, 1000)
  }, [t])  // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async () => {
    if (practiceState !== 'idle') return
    setPracticeState('connecting')
    turnsRef.current = []
    try {
      const agent = await connect(
        targetLanguage,
        {
          onStateChange: (s) => {
            if (!isMountedRef.current) return
            if (s === 'active') {
              setPracticeState('active')
              startTimer()
            } else if (s === 'ended') {
              if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
              agentRef.current = null
            }
          },
          onError: (msg) => {
            if (!isMountedRef.current) return
            const isMicError = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
            setToast(isMicError ? t('practice.errorMic') : t('practice.errorConnect'))
            setPracticeState('idle')
          },
          onTranscript: (role, text) => {
            if (!isMountedRef.current) return
            turnsRef.current.push({ role, text, wallMs: Date.now() })
          },
        },
        { kind: 'other' },
        undefined,
        { transcription: true },
      )
      agentRef.current = agent
    } catch (err) {
      if (!isMountedRef.current) return
      const isPermission = err instanceof DOMException && err.name === 'NotAllowedError'
      setToast(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
      setPracticeState('idle')
    }
  }, [practiceState, targetLanguage, t, startTimer])

  // Placeholder — endSession and submitTurns are added in Task 7
  const endSession = useCallback(() => {}, [])

  if (practiceState === 'idle') {
    return (
      <main id="main-content" className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-6 text-center">
        <div className="flex flex-col gap-2 max-w-sm">
          <h1 className="text-xl font-semibold text-foreground">{t('nav.practice')}</h1>
          <p className="text-text-secondary text-sm">{t('practice.description')}</p>
          <p className="text-text-tertiary text-xs">{t('practice.timeLimit')}</p>
        </div>
        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
        <Button onClick={start}>{t('practice.start')}</Button>
      </main>
    )
  }

  if (practiceState === 'connecting') {
    return (
      <main id="main-content" className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-4">
        <Icon name="spinner" className="w-8 h-8 text-accent-primary" />
      </main>
    )
  }

  // Active, warning, ending states rendered in Task 7
  return null
}
```

- [ ] **Step 4: Check that `Toast`, `Button`, `Modal`, and `Icon` are importable**

```bash
grep -rn "export function Toast\|export function Button\|export function Modal\|export.*Icon" components/Toast.tsx components/Button.tsx components/Modal.tsx components/Icon.tsx 2>/dev/null | head -10
```

Confirm each component exports what the import path expects. Adjust import style if needed (e.g. named vs. default export).

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Fix any TypeScript errors before proceeding.

- [ ] **Step 6: Commit**

```bash
git add app/practice/page.tsx components/PracticeClient.tsx
git commit -m "feat(practice): add page RSC and PracticeClient idle+connecting states"
```

---

## Task 7: `PracticeClient` — active + timer + warning + ending + analysing + error

**Files:**
- Modify: `components/PracticeClient.tsx`

This task replaces the placeholder `endSession` and `return null` in `PracticeClient` with the full state machine.

- [ ] **Step 1: Add `submitTurns` function**

Inside `PracticeClient`, add before the `start` callback:

```ts
  const submitTurns = useCallback(async (turns: TranscriptTurn[]) => {
    const userTurns = turns.filter(t => t.role === 'user')
    if (userTurns.length === 0) {
      setToast(t('practice.errorNoSpeech'))
      setPracticeState('idle')
      return
    }

    setPracticeState('analysing')
    setAnalysisError(false)

    try {
      const res = await fetch('/api/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns, targetLanguage }),
      })
      if (!res.ok) throw new Error('Analysis failed')
      const { session_id } = await res.json() as { session_id: string }
      if (isMountedRef.current) router.push(`/sessions/${session_id}`)
    } catch {
      if (isMountedRef.current) {
        setAnalysisError(true)
        setPracticeState('error')
      }
    }
  }, [t, targetLanguage, router])
```

- [ ] **Step 2: Replace the placeholder `endSession` with the real implementation**

Replace the `const endSession = useCallback(() => {}, [])` line with:

```ts
  const endSession = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    agentRef.current?.disconnect()
    agentRef.current = null
    const frozenTurns = [...turnsRef.current]
    submitTurns(frozenTurns)
  }, [submitTurns])
```

- [ ] **Step 3: Add the active/warning/ending/analysing/error render branches**

Replace the `return null` at the bottom of `PracticeClient` with:

```tsx
  if (practiceState === 'analysing') {
    return (
      <main id="main-content" className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-4 text-center">
        <Icon name="spinner" className="w-8 h-8 text-accent-primary" />
        <p className="text-text-secondary text-sm">{t('practice.analysing')}</p>
        {showNavAwayModal && (
          <Modal
            title={t('practice.analysing')}
            onClose={() => setShowNavAwayModal(false)}
          >
            <p className="text-sm text-text-secondary mb-4">{t('practice.navAway')}</p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={() => setShowNavAwayModal(false)}>
                {t('common.cancel') /* verify this key exists */}
              </Button>
              <Button onClick={() => router.push('/')}>{t('common.close')}</Button>
            </div>
          </Modal>
        )}
      </main>
    )
  }

  if (practiceState === 'error') {
    return (
      <main id="main-content" className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-4 text-center">
        <p className="text-text-secondary text-sm">{t('practice.errorAnalysis')}</p>
        <Button onClick={() => submitTurns([...turnsRef.current])}>{t('practice.tryAgain')}</Button>
      </main>
    )
  }

  // active + warning states share the same UI; warning just shows the toast
  return (
    <main id="main-content" className="flex flex-col items-center min-h-[70vh] px-6 pt-12 gap-8">
      <div
        className="text-4xl font-mono tabular-nums text-foreground"
        aria-label={t('practice.timerAria', { time: formatTime(elapsed) })}
        aria-live="off"
      >
        {formatTime(elapsed)}
      </div>

      {/* Mic activity indicator — reuse existing waveform icon as a placeholder;
          a real animated indicator can be wired to onUserAudio RMS in a follow-up. */}
      <div className="flex items-center gap-1">
        <Icon name="waveform" className="w-6 h-6 text-accent-primary" />
      </div>

      <Button variant="secondary" onClick={endSession}>
        {t('practice.end')}
      </Button>

      {toast && (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      )}
    </main>
  )
```

- [ ] **Step 4: Verify the `Modal` component's prop interface**

```bash
grep -n "interface.*Props\|onClose\|title" /Users/entelect-jbiddick/Projects/conversation-coach/components/Modal.tsx | head -10
```

Adjust the `<Modal>` usage if the prop names differ (e.g. `onDismiss` instead of `onClose`).

- [ ] **Step 5: Verify `Button` supports a `variant` prop**

```bash
grep -n "variant\|secondary" /Users/entelect-jbiddick/Projects/conversation-coach/components/Button.tsx | head -10
```

Adjust variant name if it differs in this codebase.

- [ ] **Step 6: Run lint**

```bash
npm run lint
```

Fix any TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add components/PracticeClient.tsx
git commit -m "feat(practice): add full session state machine to PracticeClient"
```

---

## Task 8: `POST /api/practice-sessions`

**Files:**
- Create: `app/api/practice-sessions/route.ts`

- [ ] **Step 1: Write the failing test first** (see Task 9) — write the route after.

Skip to Task 9 now to write the tests, then return here to implement against them.

---

## Task 9: Tests for `POST /api/practice-sessions`

**Files:**
- Create: `__tests__/api/practice-sessions.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// __tests__/api/practice-sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/claude', () => ({ analyseUserTurns: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyseUserTurns } from '@/lib/claude'

const mockUser = { id: 'user-123', email: 'test@example.com', targetLanguage: 'es-AR' }

const sampleTurns = [
  { role: 'model', text: '¿De qué querés hablar hoy?', wallMs: 1000 },
  { role: 'user', text: 'Quiero hablar de mi trabajo.', wallMs: 3000 },
  { role: 'model', text: 'Bueno, contame.', wallMs: 4500 },
  { role: 'user', text: 'Soy programador.', wallMs: 6000 },
]

function makeDb(overrides: Record<string, unknown> = {}) {
  const singleMock = vi.fn().mockResolvedValue({ data: { id: 'session-abc' }, error: null })
  const eqSessionMock = vi.fn().mockReturnValue({ single: singleMock })
  const insertSessionMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: singleMock }) })
  const insertSegmentsMock = vi.fn().mockResolvedValue({ data: [
    { id: 'seg-1', speaker: 'B', position: 0 },
    { id: 'seg-2', speaker: 'A', position: 1 },
    { id: 'seg-3', speaker: 'B', position: 2 },
    { id: 'seg-4', speaker: 'A', position: 3 },
  ], error: null })
  const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'sessions') return {
      insert: insertSessionMock,
      update: updateMock,
    }
    if (table === 'transcript_segments') return { insert: insertSegmentsMock }
    if (table === 'annotations') return { insert: insertAnnotationsMock }
    return {}
  })

  return {
    db: { from: fromMock } as unknown as ReturnType<typeof createServerClient>,
    insertSessionMock,
    insertSegmentsMock,
    insertAnnotationsMock,
    updateMock,
    singleMock,
    ...overrides,
  }
}

describe('POST /api/practice-sessions', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(mockUser as any)
    vi.mocked(analyseUserTurns).mockResolvedValue({
      title: 'Trabajo de programador',
      annotations: [{
        segment_id: 'seg-2',
        type: 'grammar',
        sub_category: 'verb-conjugation',
        original: 'Quiero',
        start_char: 0,
        end_char: 6,
        correction: 'Quiero',
        explanation: 'Correct in this context.',
        flashcard_front: null,
        flashcard_back: null,
        flashcard_note: null,
        importance_score: 2,
        importance_note: null,
      }],
    })
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: sampleTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when no user turns present', async () => {
    const { db } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const modelOnlyTurns = [{ role: 'model', text: 'Hola', wallMs: 1000 }]
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: modelOnlyTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates session with session_type voice_practice and status analysing', async () => {
    const { db, insertSessionMock } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: sampleTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(insertSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session_type: 'voice_practice',
        status: 'analysing',
        user_id: 'user-123',
        user_speaker_labels: ['A'],
      })
    )
  })

  it('inserts segments with correct speaker mapping', async () => {
    const { db, insertSegmentsMock } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: sampleTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    const insertedSegments = vi.mocked(insertSegmentsMock).mock.calls[0][0] as Array<{ speaker: string; text: string }>
    expect(insertedSegments[0]).toMatchObject({ speaker: 'B', text: '¿De qué querés hablar hoy?' })
    expect(insertedSegments[1]).toMatchObject({ speaker: 'A', text: 'Quiero hablar de mi trabajo.' })
  })

  it('calls analyseUserTurns with only user-speaker segments', async () => {
    const { db } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: sampleTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    const [userTurnsArg] = vi.mocked(analyseUserTurns).mock.calls[0]
    expect(userTurnsArg.every((t: { text: string }) =>
      ['Quiero hablar de mi trabajo.', 'Soy programador.'].includes(t.text)
    )).toBe(true)
    expect(userTurnsArg).toHaveLength(2)
  })

  it('returns session_id on success', async () => {
    const { db } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: sampleTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('session_id', 'session-abc')
  })
})
```

- [ ] **Step 2: Run — expect failures (route not created yet)**

```bash
npm test -- __tests__/api/practice-sessions.test.ts
```

Expected: FAIL — module `@/app/api/practice-sessions/route` not found.

---

## Task 8 (continued): Implement `POST /api/practice-sessions`

**Files:**
- Create: `app/api/practice-sessions/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/practice-sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyseUserTurns } from '@/lib/claude'
import { log } from '@/lib/logger'
import { SUB_CATEGORIES, SUB_CATEGORY_TYPE_MAP } from '@/lib/types'
import type { TranscriptTurn, TargetLanguage } from '@/lib/types'

function formatSessionTitle(date: Date): string {
  return `Practice — ${date.getDate()} ${date.toLocaleString('en', { month: 'short' })}`
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { turns, targetLanguage } = await req.json() as {
    turns: TranscriptTurn[]
    targetLanguage: TargetLanguage
  }

  const userTurns = turns.filter(t => t.role === 'user')
  if (userTurns.length === 0) {
    return NextResponse.json({ error: 'No user speech detected' }, { status: 400 })
  }

  const db = createServerClient()

  // Create session row
  const { data: session, error: sessionError } = await db
    .from('sessions')
    .insert({
      title: formatSessionTitle(new Date()),
      status: 'analysing',
      session_type: 'voice_practice',
      user_id: user.id,
      user_speaker_labels: ['A'],
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    log.error('Failed to create practice session', { error: sessionError?.message })
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  const sessionId = session.id

  try {
    // Build segments from turns with wall-clock timestamps
    const sessionStartMs = turns[0].wallMs
    const segmentRows = turns.map((turn, i) => ({
      session_id: sessionId,
      speaker: turn.role === 'user' ? 'A' : 'B',
      text: turn.text,
      start_ms: turn.wallMs - sessionStartMs,
      end_ms: turns[i + 1]
        ? turns[i + 1].wallMs - sessionStartMs
        : (turn.wallMs - sessionStartMs) + 3000,
      position: i,
      paragraph_breaks: [],
    }))

    const { data: insertedSegments, error: segError } = await db
      .from('transcript_segments')
      .insert(segmentRows)
      .select('id, speaker, position')

    if (segError || !insertedSegments) {
      throw new Error(`Segment insert failed: ${segError?.message}`)
    }

    // Map user-speaker segment IDs for Claude
    const userSegments = insertedSegments.filter(s => s.speaker === 'A')
    const userSegmentIdByPosition = new Map(
      userSegments.map(s => [s.position, s.id])
    )

    const claudeTurns = turns
      .map((turn, i) => ({ role: turn.role, text: turn.text, position: i }))
      .filter(t => t.role === 'user')
      .map(t => ({ id: userSegmentIdByPosition.get(t.position)!, text: t.text }))

    log.info('Practice session Claude analysis started', { sessionId, turnCount: claudeTurns.length })

    const { title, annotations } = await analyseUserTurns(claudeTurns, null, sessionId, targetLanguage)

    // Build segment text map for offset validation
    const segmentTextById = new Map(claudeTurns.map(t => [t.id, t.text]))

    const correctedAnnotations = annotations.map(a => {
      let corrected = { ...a }
      const segText = segmentTextById.get(a.segment_id)
      if (segText && segText.slice(corrected.start_char, corrected.end_char) !== corrected.original) {
        const idx = segText.indexOf(corrected.original)
        if (idx !== -1) {
          corrected = { ...corrected, start_char: idx, end_char: idx + corrected.original.length }
        }
      }
      const rawSubCat = corrected.sub_category
      const isValidKey = typeof rawSubCat === 'string' && (SUB_CATEGORIES as readonly string[]).includes(rawSubCat)
      const expectedType = isValidKey ? SUB_CATEGORY_TYPE_MAP[rawSubCat as keyof typeof SUB_CATEGORY_TYPE_MAP] : undefined
      const subCategory = (isValidKey && (expectedType === undefined || expectedType === corrected.type))
        ? rawSubCat
        : 'other'
      return { ...corrected, sub_category: subCategory }
    })

    if (correctedAnnotations.length > 0) {
      const { error: annError } = await db.from('annotations').insert(
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
          flashcard_front: a.flashcard_front ?? null,
          flashcard_back: a.flashcard_back ?? null,
          flashcard_note: a.flashcard_note ?? null,
          importance_score: a.importance_score ?? null,
          importance_note: null,
        }))
      )
      if (annError) throw new Error(`Annotation insert failed: ${annError.message}`)
    }

    await db.from('sessions').update({ status: 'ready', title }).eq('id', sessionId)
    log.info('Practice session analysis complete', { sessionId, annotationCount: correctedAnnotations.length })

    return NextResponse.json({ session_id: sessionId }, { status: 201 })

  } catch (err) {
    log.error('Practice session analysis failed', { sessionId, err })
    await db.from('sessions').update({ status: 'error', error_stage: 'analysing' }).eq('id', sessionId)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- __tests__/api/practice-sessions.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 3: Run all tests to check for regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/practice-sessions/route.ts __tests__/api/practice-sessions.test.ts
git commit -m "feat(practice): add POST /api/practice-sessions route with tests"
```

---

## Task 10: End-to-end smoke test + cleanup

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Navigate to `/practice`**

Confirm: page renders with description text and "Start session" button. Voice coach trigger (waveform chip) is hidden in the header.

- [ ] **Step 3: Verify nav**

Confirm: bottom nav shows 4 tabs (Recordings / Practice / Write / Settings). NavDrawer shows Practice. Active tab highlights correctly.

- [ ] **Step 4: Test a connection attempt**

Click "Start session". Confirm: browser mic permission prompt appears. If denied — toast "Microphone access required" and returns to idle. If allowed — connecting spinner then active state with timer.

- [ ] **Step 5: Test the 4-minute warning**

The timer runs in real time — for dev testing, temporarily lower `WARN_SECONDS` to `5` and `END_SECONDS` to `10` in `PracticeClient.tsx`, run a session, confirm the warning toast fires, confirm auto-end triggers `analysing` state. Restore original values before committing.

- [ ] **Step 6: Verify session appears in the sessions list**

After a completed practice session, navigate to `/`. Confirm the Practice session appears in the session list with a "Practice — DD Mon" title and status `ready`. Click through to `/sessions/[id]` and confirm the transcript renders correctly (user and model turns both visible; only user turns have annotation highlights if Claude found any).

- [ ] **Step 7: Run lint + full test suite**

```bash
npm run lint && npm test
```

Expected: no errors, all tests pass.

- [ ] **Step 8: Final commit**

```bash
git add -p   # stage any dev-test value revert
git commit -m "chore: restore WARN/END_SECONDS to 240/300"
```

---

## Self-Review Checklist

- **Spec coverage:**
  - [x] `voice-agent.ts` transcription support (Task 3)
  - [x] `buildPracticeSystemPrompt` (Task 3)
  - [x] `/practice` page RSC (Task 6)
  - [x] `PracticeClient` full state machine (Tasks 6–7)
  - [x] 4-min warning, 5-min auto-end (Task 7)
  - [x] `POST /api/practice-sessions` (Task 8)
  - [x] DB migration (Task 1)
  - [x] Navigation (Task 5)
  - [x] `VoiceTrigger` hidden on `/practice` (Task 5)
  - [x] Zero user turns → 400 / toast (Task 8, test in Task 9)
  - [x] `beforeunload` during analysing (Task 7)
  - [x] Error state + Try Again (Task 7)
  - [x] Segments use wall-clock timestamps (Task 8)
  - [x] `user_speaker_labels: ['A']` on session (Task 8)
  - [x] `paragraph_breaks: []` on all segments (Task 8)

- **Known verification steps:**
  - `getAuthenticatedUser()` return shape must be confirmed in Task 6 Step 2
  - Gemini Live transcription message shape (`inputTranscription`, `outputTranscription`, `turnComplete`) should be verified by inspecting actual WebSocket frames during a test session — the plan uses the expected shape per API docs but this is a preview API
  - `Modal` and `Button` prop interfaces must be confirmed in Task 7 Steps 4–5
