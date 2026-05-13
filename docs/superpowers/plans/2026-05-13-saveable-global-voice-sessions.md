# Saveable Global Voice Sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user ends a global voice session, prompt them to save the conversation for analysis; on save navigate to the resulting `/sessions/[id]` page — identical to the practice flow.

**Architecture:** A new `useVoiceSave` hook wraps `useVoiceController`, adds turn collection (via a ref), session timing, and a `reviewState` machine. `ConditionalNav` calls `useVoiceSave` instead of `useVoiceController`. Mobile review uses `DockedSheet`; desktop review morphs `VoiceStrip` in place.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library, `framer-motion` (already installed), `DockedSheet` component (existing).

**Spec:** `docs/superpowers/specs/2026-05-13-saveable-global-voice-sessions-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/i18n.ts` | Modify | Add `voiceSave.*` translation keys |
| `components/VoiceController.tsx` | Modify | Accept `transcriptConfig` param; wire `onTranscript` + `transcription: true` into `connect()` |
| `components/VoiceSave.tsx` | **Create** | `useVoiceSave` hook + `VoiceReviewSheet` component |
| `components/VoiceStrip.tsx` | Modify | Add `reviewMode` prop; morph strip to 88px with save/discard/resume controls |
| `components/ConditionalNav.tsx` | Modify | Replace `useVoiceController` → `useVoiceSave`; render `VoiceReviewSheet` + pass `reviewMode` to `VoiceStrip` |
| `__tests__/useVoiceSave.test.tsx` | **Create** | Unit tests for the `useVoiceSave` state machine |

---

## Task 1: i18n keys

**Files:**
- Modify: `lib/i18n.ts`

- [ ] **Step 1: Add English keys after the last `voice.*` entry (line 494)**

In `lib/i18n.ts`, after `'voice.endLabel': 'End',` (line 494, before the closing `},` of the `en` block), add:

```typescript
    'voiceSave.heading': 'Save this conversation?',
    'voiceSave.save': 'Save & analyse',
    'voiceSave.discard': 'Discard',
    'voiceSave.resume': '↩ Resume conversation',
    'voiceSave.discardToast': 'Conversation discarded',
    'voiceSave.discardUndo': 'Undo',
    'voiceSave.errorSave': "Couldn't save — try again",
```

- [ ] **Step 2: Add Spanish keys after the last `voice.*` entry in the `es` block (line 967)**

In `lib/i18n.ts`, after `'voice.endLabel': 'Finalizar',` (line 967, before the closing `},` of the `es` block), add:

```typescript
    'voiceSave.heading': '¿Guardar esta conversación?',
    'voiceSave.save': 'Guardar y analizar',
    'voiceSave.discard': 'Descartar',
    'voiceSave.resume': '↩ Reanudar conversación',
    'voiceSave.discardToast': 'Conversación descartada',
    'voiceSave.discardUndo': 'Deshacer',
    'voiceSave.errorSave': 'No se pudo guardar, intenta de nuevo',
```

- [ ] **Step 3: Verify TypeScript is happy**

```bash
npm run build 2>&1 | head -20
```

Expected: no type errors related to i18n. (Build may fail for other reasons — only check that no new errors appear.)

- [ ] **Step 4: Commit**

```bash
git add lib/i18n.ts
git commit -m "feat(i18n): add voiceSave translation keys"
```

---

## Task 2: Extend `useVoiceController` with transcript config

**Files:**
- Modify: `components/VoiceController.tsx`

The hook currently calls `connect(targetLanguage, callbacks, routeContext, pageContext)`. We need it to optionally pass `onTranscript` in callbacks and `{ transcription: true }` in options (5th arg) when a `transcriptConfig` is provided.

`onTranscript` is already defined in `VoiceAgentCallbacks` in `lib/voice-agent.ts` and `ConnectOptions` already has `transcription?: boolean` — nothing in `voice-agent.ts` needs to change.

- [ ] **Step 1: Add the `TranscriptConfig` interface and update the hook signature**

At the top of `components/VoiceController.tsx`, after the existing `VoiceController` interface, add:

```typescript
export interface TranscriptConfig {
  onTurn: (role: 'user' | 'model', text: string) => void
}
```

Update `useVoiceController` to accept an optional param:

```typescript
export function useVoiceController(transcriptConfig?: TranscriptConfig): VoiceController {
```

- [ ] **Step 2: Wire `transcriptConfig` into `connect()` inside `start()`**

In the `start` callback (around line 92 where `connect()` is called), update the call to pass `onTranscript` in callbacks and `transcription: true` in options:

```typescript
      const agent = await connect(
        targetLanguage,
        {
          onStateChange: (s: VoiceAgentState) => { /* unchanged */ },
          onError: (message: string) => { /* unchanged */ },
          onUserAudio: (rms) => { userRmsRef.current = Math.max(userRmsRef.current, rms) },
          onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
          onTranscript: transcriptConfig?.onTurn,
        },
        routeContext,
        pageContext,
        transcriptConfig ? { transcription: true } : {},
      )
```

`transcriptConfig` is a stable ref-captured value (passed at hook init time); no extra deps needed in the `useCallback` dependency array since it never changes after mount. Add it to the dep array anyway for correctness: `[state, targetLanguage, pathname, showToast, transcriptConfig]`.

- [ ] **Step 3: Verify TypeScript**

```bash
npm run build 2>&1 | head -20
```

Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add components/VoiceController.tsx
git commit -m "feat(voice): add optional transcriptConfig to useVoiceController"
```

---

## Task 3: `useVoiceSave` hook

**Files:**
- Create: `components/VoiceSave.tsx` (hook only — component added in Task 4)
- Create: `__tests__/useVoiceSave.test.tsx`

This hook wraps `useVoiceController`, collects turns, measures session duration, and manages a `reviewState` machine.

### State machine

```
reviewState: 'idle' | 'review' | 'analysing' | 'error'

active/muted → idle  (end)
  ├─ has user turns → reviewState = 'review'
  └─ no user turns  → reviewState stays 'idle'

review → save()  → reviewState = 'analysing' → router.push('/sessions/[id]')
       → discard() → reviewState = 'idle', discardToast shown (5s undo)
       → resume()  → controller.start(), reviewState = 'idle'
                     (next end will re-trigger review with all turns)
```

- [ ] **Step 1: Write the failing tests first**

Create `__tests__/useVoiceSave.test.tsx`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock useVoiceController so we can control its state in tests
const mockStart = vi.fn()
const mockEnd = vi.fn()
const mockToggleMute = vi.fn()
let mockControllerState = 'idle'
let capturedTranscriptConfig: { onTurn: (role: 'user' | 'model', text: string) => void } | undefined

vi.mock('@/components/VoiceController', () => ({
  useVoiceController: (transcriptConfig?: { onTurn: (role: 'user' | 'model', text: string) => void }) => {
    capturedTranscriptConfig = transcriptConfig
    return {
      state: mockControllerState as 'idle' | 'connecting' | 'active' | 'muted',
      toast: null,
      toastKey: 0,
      indicatorRef: { current: null },
      mobileIndicatorRef: { current: null },
      audioTickCallbacksRef: { current: new Set() },
      start: mockStart,
      toggleMute: mockToggleMute,
      end: mockEnd,
    }
  },
}))

// Mock router
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

// Mock fetch for /api/practice-sessions
global.fetch = vi.fn()

import { useVoiceSave } from '@/components/VoiceSave'

describe('useVoiceSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockControllerState = 'idle'
  })

  it('passes transcriptConfig to useVoiceController', () => {
    renderHook(() => useVoiceSave())
    expect(capturedTranscriptConfig).toBeDefined()
    expect(typeof capturedTranscriptConfig?.onTurn).toBe('function')
  })

  it('reviewState is idle on mount', () => {
    const { result } = renderHook(() => useVoiceSave())
    expect(result.current.reviewState).toBe('idle')
  })

  it('opens review when session ends with user turns', () => {
    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())

    // Simulate a user turn arriving
    act(() => {
      capturedTranscriptConfig?.onTurn('user', 'Hola')
    })

    // Session ends — controller state goes idle
    mockControllerState = 'idle'
    rerender()

    expect(result.current.reviewState).toBe('review')
  })

  it('does NOT open review when session ends with no user turns', () => {
    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())

    // Only a model turn — no user speech
    act(() => {
      capturedTranscriptConfig?.onTurn('model', 'Hola, ¿cómo estás?')
    })

    mockControllerState = 'idle'
    rerender()

    expect(result.current.reviewState).toBe('idle')
  })

  it('discard() sets reviewState to idle and shows discardToast', () => {
    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())
    act(() => { capturedTranscriptConfig?.onTurn('user', 'Hola') })
    mockControllerState = 'idle'
    rerender()
    expect(result.current.reviewState).toBe('review')

    act(() => { result.current.discard() })
    expect(result.current.reviewState).toBe('idle')
    expect(result.current.discardToast).not.toBeNull()
  })

  it('undoDiscard() restores reviewState to review', () => {
    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())
    act(() => { capturedTranscriptConfig?.onTurn('user', 'Hola') })
    mockControllerState = 'idle'
    rerender()
    act(() => { result.current.discard() })
    act(() => { result.current.undoDiscard() })

    expect(result.current.reviewState).toBe('review')
    expect(result.current.discardToast).toBeNull()
  })

  it('resume() calls controller.start() and sets reviewState to idle', () => {
    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())
    act(() => { capturedTranscriptConfig?.onTurn('user', 'Hola') })
    mockControllerState = 'idle'
    rerender()

    act(() => { result.current.resume() })

    expect(mockStart).toHaveBeenCalledTimes(1)
    expect(result.current.reviewState).toBe('idle')
  })

  it('save() POSTs to /api/practice-sessions and navigates', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ session_id: 'abc-123' }),
    })

    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())
    act(() => { capturedTranscriptConfig?.onTurn('user', 'Hola') })
    mockControllerState = 'idle'
    rerender()

    await act(async () => { await result.current.save() })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/practice-sessions',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mockPush).toHaveBeenCalledWith('/sessions/abc-123')
  })

  it('save() sets reviewState to error on fetch failure', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false })

    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())
    act(() => { capturedTranscriptConfig?.onTurn('user', 'Hola') })
    mockControllerState = 'idle'
    rerender()

    await act(async () => { await result.current.save() })

    expect(result.current.reviewState).toBe('error')
  })
})
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
npm test -- __tests__/useVoiceSave.test.tsx
```

Expected: all tests fail with "Cannot find module '@/components/VoiceSave'".

- [ ] **Step 3: Implement `useVoiceSave`**

Create `components/VoiceSave.tsx` with the hook (component scaffold to be added in Task 4):

```typescript
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useVoiceController, type VoiceController, type TranscriptConfig } from '@/components/VoiceController'
import { useTranslation } from '@/components/LanguageProvider'
import type { TranscriptTurn, TargetLanguage } from '@/lib/types'

export type ReviewState = 'idle' | 'review' | 'analysing' | 'error'

export interface VoiceSaveController extends VoiceController {
  reviewState: ReviewState
  durationSecs: number
  save: () => Promise<void>
  discard: () => void
  undoDiscard: () => void
  resume: () => void
  discardToast: { key: number } | null
}

export function useVoiceSave(): VoiceSaveController {
  const router = useRouter()
  const { targetLanguage } = useTranslation()
  const [reviewState, setReviewState] = useState<ReviewState>('idle')
  const [durationSecs, setDurationSecs] = useState(0)
  const [discardToast, setDiscardToast] = useState<{ key: number } | null>(null)

  const turnsRef = useRef<TranscriptTurn[]>([])
  const frozenTurnsRef = useRef<TranscriptTurn[]>([])
  const startedAtMsRef = useRef<number | null>(null)
  const prevControllerStateRef = useRef<VoiceController['state']>('idle')
  const discardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (discardTimerRef.current) clearTimeout(discardTimerRef.current)
    }
  }, [])

  const transcriptConfig: TranscriptConfig = {
    onTurn: useCallback((role: 'user' | 'model', text: string) => {
      turnsRef.current.push({ role, text, wallMs: Date.now() })
    }, []),
  }

  const controller = useVoiceController(transcriptConfig)

  // Detect session start (set startedAtMs when state goes active)
  useEffect(() => {
    const prev = prevControllerStateRef.current
    const curr = controller.state
    prevControllerStateRef.current = curr

    if (curr === 'active' && prev !== 'active' && prev !== 'muted') {
      startedAtMsRef.current = Date.now()
    }

    if ((prev === 'active' || prev === 'muted') && curr === 'idle') {
      const turns = turnsRef.current
      const hasUserTurns = turns.some(t => t.role === 'user')
      if (hasUserTurns) {
        frozenTurnsRef.current = [...turns]
        const elapsed = startedAtMsRef.current
          ? Math.round((Date.now() - startedAtMsRef.current) / 1000)
          : 0
        setDurationSecs(elapsed)
        setReviewState('review')
      }
      turnsRef.current = []
      startedAtMsRef.current = null
    }
  }, [controller.state])

  const save = useCallback(async () => {
    setReviewState('analysing')
    try {
      const res = await fetch('/api/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns: frozenTurnsRef.current, targetLanguage }),
      })
      if (!res.ok) throw new Error('Save failed')
      const { session_id } = await res.json() as { session_id: string }
      if (isMountedRef.current) router.push(`/sessions/${session_id}`)
    } catch {
      if (isMountedRef.current) setReviewState('error')
    }
  }, [targetLanguage, router])

  const discard = useCallback(() => {
    if (discardTimerRef.current) clearTimeout(discardTimerRef.current)
    setDiscardToast({ key: Date.now() })
    setReviewState('idle')
    discardTimerRef.current = setTimeout(() => {
      discardTimerRef.current = null
      frozenTurnsRef.current = []
      if (isMountedRef.current) setDiscardToast(null)
    }, 5000)
  }, [])

  const undoDiscard = useCallback(() => {
    if (discardTimerRef.current) {
      clearTimeout(discardTimerRef.current)
      discardTimerRef.current = null
    }
    setDiscardToast(null)
    setReviewState('review')
  }, [])

  const resume = useCallback(() => {
    turnsRef.current = [...frozenTurnsRef.current]
    setReviewState('idle')
    controller.start()
  }, [controller])

  return {
    ...controller,
    reviewState,
    durationSecs,
    save,
    discard,
    undoDiscard,
    resume,
    discardToast,
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- __tests__/useVoiceSave.test.tsx
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/VoiceSave.tsx __tests__/useVoiceSave.test.tsx
git commit -m "feat(voice): add useVoiceSave hook with review state machine"
```

---

## Task 4: `VoiceReviewSheet` component (mobile)

**Files:**
- Modify: `components/VoiceSave.tsx` (add component at the bottom)

The sheet is `DockedSheet`-based, mobile-only (`md:hidden` on the outer wrapper). No swipe-to-dismiss — swipe gestures are disabled to prevent accidentally losing turns.

- [ ] **Step 1: Add imports and component to `VoiceSave.tsx`**

Add these imports at the top of `components/VoiceSave.tsx`:

```typescript
import { DockedSheet } from '@/components/DockedSheet'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
```

Then add this component after `useVoiceSave`:

```typescript
interface VoiceReviewSheetProps {
  open: boolean
  durationSecs: number
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  onResume: () => void
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function VoiceReviewSheet({
  open,
  durationSecs,
  saving,
  onSave,
  onDiscard,
  onResume,
}: VoiceReviewSheetProps) {
  const { t } = useTranslation()

  return (
    <div className="md:hidden">
      <DockedSheet
        isOpen={open}
        ariaLabel={t('voiceSave.heading')}
        onClose={onDiscard}
        headerLead={
          <span className="text-base font-semibold text-foreground">
            {t('voiceSave.heading')}
          </span>
        }
        footer={
          <div className="px-5 pb-5 pt-2 flex flex-col gap-3">
            <div className="flex gap-3">
              <Button
                onClick={onSave}
                disabled={saving}
                size="md"
                className="flex-1"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Icon name="spinner" className="w-4 h-4" />
                    {t('practice.analysing')}
                  </span>
                ) : (
                  t('voiceSave.save')
                )}
              </Button>
              <Button
                onClick={onDiscard}
                disabled={saving}
                variant="secondary"
                size="md"
                className="flex-1"
              >
                {t('voiceSave.discard')}
              </Button>
            </div>
            <button
              type="button"
              onClick={onResume}
              disabled={saving}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors mx-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded disabled:opacity-50"
            >
              {t('voiceSave.resume')}
            </button>
          </div>
        }
      >
        <div className="px-5 pb-2">
          <p className="text-xs text-text-tertiary tabular-nums">
            {formatDuration(durationSecs)}
          </p>
        </div>
      </DockedSheet>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npm run build 2>&1 | head -20
```

Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add components/VoiceSave.tsx
git commit -m "feat(voice): add VoiceReviewSheet (mobile DockedSheet)"
```

---

## Task 5: `VoiceStrip` review mode (desktop)

**Files:**
- Modify: `components/VoiceStrip.tsx`

When `reviewMode` is provided, the strip morphs from 44px → 88px and renders save/discard/resume controls. `--voice-strip-height` CSS variable is updated to match so `<main>` reflows in lockstep.

- [ ] **Step 1: Add `ReviewMode` interface and new props to `VoiceStrip`**

At the top of `components/VoiceStrip.tsx`, add the interface and update `Props`:

```typescript
export interface ReviewMode {
  durationSecs: number
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  onResume: () => void
}

interface Props {
  muted: boolean
  audioTickCallbacksRef: React.MutableRefObject<Set<VoiceTickCallback>>
  onMute: () => void
  onEnd: () => void
  exiting?: boolean
  reviewMode?: ReviewMode
}
```

- [ ] **Step 2: Add `formatDuration` helper**

After the imports in `VoiceStrip.tsx`, add:

```typescript
function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
```

- [ ] **Step 3: Update the `useEffect` that writes `--voice-strip-height`**

Replace the existing `useEffect` that sets `--voice-strip-height` with one that also responds to `reviewMode`:

```typescript
  useEffect(() => {
    if (!window.matchMedia('(min-width: 768px)').matches) return
    const height = reviewMode ? '5.5rem' : '2.75rem'
    document.documentElement.style.setProperty('--voice-strip-height', height)
    return () => {
      document.documentElement.style.removeProperty('--voice-strip-height')
    }
  }, [reviewMode])
```

- [ ] **Step 4: Update the strip's outer `<div>` to animate height**

Replace the static `h-11` on the strip's outer div with a dynamic height and transition. The strip currently looks like:

```tsx
<div
  role="region"
  aria-label={t('voice.regionAria')}
  aria-keyshortcuts="Escape Space"
  className={`
    ${exiting ? 'voice-strip-exit' : 'voice-strip-anim'}
    hidden md:block
    fixed left-0 right-0 z-30
    h-11
    bg-surface border-b border-border-subtle
  `}
  style={{
    top: 'calc(var(--header-height) + env(safe-area-inset-top))',
  }}
>
```

Change to:

```tsx
<div
  role="region"
  aria-label={t('voice.regionAria')}
  aria-keyshortcuts={reviewMode ? undefined : 'Escape Space'}
  className={`
    ${exiting ? 'voice-strip-exit' : 'voice-strip-anim'}
    hidden md:block
    fixed left-0 right-0 z-30
    bg-surface border-b border-border-subtle
    overflow-hidden
  `}
  style={{
    top: 'calc(var(--header-height) + env(safe-area-inset-top))',
    height: reviewMode ? '5.5rem' : '2.75rem',
    transition: 'height 320ms cubic-bezier(0.16, 1, 0.3, 1)',
  }}
>
```

- [ ] **Step 5: Add the review row inside the strip**

After the existing toolbar `<div role="toolbar" ...>` (keep that div unchanged — it handles the active controls), add the review row:

```tsx
      {/* Review row — fades in after the strip has expanded */}
      {reviewMode && (
        <div
          className="h-full max-w-2xl mx-auto px-4 md:px-10 flex items-center gap-4"
          style={{ animation: 'fadeIn 180ms ease-out 180ms both' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {/* t() not available here — use the key directly since we import useTranslation above */}
              {t('voiceSave.heading')}
            </p>
            <p className="text-xs text-text-tertiary tabular-nums mt-0.5">
              {formatDuration(reviewMode.durationSecs)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={reviewMode.onResume}
              disabled={reviewMode.saving}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors px-2 py-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50"
            >
              {t('voiceSave.resume')}
            </button>
            <button
              type="button"
              onClick={reviewMode.onDiscard}
              disabled={reviewMode.saving}
              className="h-8 px-3 rounded-full text-xs font-medium text-text-secondary bg-surface-elevated hover:bg-border-subtle transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50"
            >
              {t('voiceSave.discard')}
            </button>
            <button
              type="button"
              onClick={reviewMode.onSave}
              disabled={reviewMode.saving}
              className="h-8 px-3 rounded-full text-xs font-semibold text-on-accent bg-accent-primary hover:bg-accent-primary-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary disabled:opacity-50 flex items-center gap-1.5"
            >
              {reviewMode.saving ? (
                <>
                  <Icon name="spinner" className="w-3 h-3" />
                  {t('practice.analysing')}
                </>
              ) : (
                t('voiceSave.save')
              )}
            </button>
          </div>
        </div>
      )}
```

Add the `fadeIn` keyframe to `app/globals.css` (or inline — but globals is cleaner):

In `app/globals.css`, in the keyframes section, add:

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

Also hide the active toolbar when in review mode — update the toolbar div's className to add conditional hidden:

```tsx
<div
  role="toolbar"
  aria-label={t('voice.toolbarAria')}
  className={`h-full max-w-2xl mx-auto px-4 md:px-10 flex items-center gap-2 ${reviewMode ? 'hidden' : ''}`}
>
```

- [ ] **Step 6: Verify TypeScript**

```bash
npm run build 2>&1 | head -20
```

Expected: no new type errors. Also confirm `Icon` is already imported in `VoiceStrip.tsx` — if not, add `import { Icon } from '@/components/Icon'`.

- [ ] **Step 7: Commit**

```bash
git add components/VoiceStrip.tsx app/globals.css
git commit -m "feat(voice): add reviewMode to VoiceStrip for desktop save prompt"
```

---

## Task 6: Wire `ConditionalNav`

**Files:**
- Modify: `components/ConditionalNav.tsx`

Replace `useVoiceController` with `useVoiceSave`, render `VoiceReviewSheet` (mobile), pass `reviewMode` to `VoiceStrip` (desktop), and show the discard undo toast.

- [ ] **Step 1: Update imports**

In `components/ConditionalNav.tsx`, replace:

```typescript
import { useVoiceController } from '@/components/VoiceController'
```

with:

```typescript
import { useVoiceSave, VoiceReviewSheet } from '@/components/VoiceSave'
```

- [ ] **Step 2: Replace hook call**

Replace:

```typescript
  const voice = useVoiceController()
```

with:

```typescript
  const voice = useVoiceSave()
```

- [ ] **Step 3: Update `voiceActive` to exclude review/analysing states**

The strip's delayed-unmount logic should keep the strip mounted while in `review` or `analysing` — the strip is the review UI on desktop. Update:

```typescript
  const voiceActive =
    voice.state === 'active' ||
    voice.state === 'muted' ||
    voice.reviewState === 'review' ||
    voice.reviewState === 'analysing'
```

- [ ] **Step 4: Pass `reviewMode` to `VoiceStrip`**

Update the `VoiceStrip` render:

```tsx
      {showStrip && (
        <VoiceStrip
          muted={voice.state === 'muted'}
          audioTickCallbacksRef={voice.audioTickCallbacksRef}
          onMute={voice.toggleMute}
          onEnd={voice.end}
          exiting={stripExiting}
          reviewMode={
            voice.reviewState === 'review' || voice.reviewState === 'analysing'
              ? {
                  durationSecs: voice.durationSecs,
                  saving: voice.reviewState === 'analysing',
                  onSave: voice.save,
                  onDiscard: voice.discard,
                  onResume: voice.resume,
                }
              : undefined
          }
        />
      )}
```

- [ ] **Step 5: Render `VoiceReviewSheet` (mobile)**

Add inside the `ConditionalNav` return, after the `VoiceStrip` block:

```tsx
      <VoiceReviewSheet
        open={voice.reviewState === 'review' || voice.reviewState === 'analysing'}
        durationSecs={voice.durationSecs}
        saving={voice.reviewState === 'analysing'}
        onSave={voice.save}
        onDiscard={voice.discard}
        onResume={voice.resume}
      />
```

- [ ] **Step 6: Add discard undo toast**

After the existing voice error toast block, add:

```tsx
      {voice.discardToast && (
        <Toast
          message={t('voiceSave.discardToast')}
          toastKey={voice.discardToast.key}
          action={{ label: t('voiceSave.discardUndo'), onClick: voice.undoDiscard }}
        />
      )}
```

- [ ] **Step 7: Add save error toast**

When `voice.reviewState === 'error'`, surface a retryable toast. Add state tracking to trigger it — the simplest approach is to watch `reviewState` in a `useEffect` inside `ConditionalNav`:

```typescript
  // Show toast when save fails
  useEffect(() => {
    if (voice.reviewState === 'error') {
      // The sheet/strip stays open; toast provides a retry shortcut
    }
  }, [voice.reviewState])
```

Actually — the `error` state leaves the sheet open with buttons re-enabled (per spec). Add a toast from `useVoiceSave` directly instead. In `useVoiceSave`'s `save()` catch block, call `showToast` — but `showToast` is internal to `useVoiceController`. Instead, use the existing `VoiceToast` mechanism: return an `errorToast` field from `useVoiceSave`:

Add to `useVoiceSave`'s state:

```typescript
  const [saveError, setSaveError] = useState(false)
```

In `save()`'s catch block:

```typescript
    } catch {
      if (isMountedRef.current) {
        setReviewState('error')
        setSaveError(true)
      }
    }
```

Add to the return value:

```typescript
    saveError,
    clearSaveError: () => setSaveError(false),
```

And add to `VoiceSaveController`:

```typescript
  saveError: boolean
  clearSaveError: () => void
```

Then in `ConditionalNav`, after the discard toast:

```tsx
      {voice.saveError && (
        <Toast
          message={t('voiceSave.errorSave')}
          toastKey={voice.reviewState === 'error' ? 1 : 0}
          action={{ label: t('voice.tryAgain'), onClick: voice.save }}
        />
      )}
```

- [ ] **Step 8: Verify TypeScript and run full test suite**

```bash
npm run build 2>&1 | head -30
npm test
```

Expected: build succeeds (or only pre-existing errors), all tests pass.

- [ ] **Step 9: Commit**

```bash
git add components/ConditionalNav.tsx
git commit -m "feat(voice): wire useVoiceSave into ConditionalNav"
```

---

## Task 7: Manual smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test mobile flow**

Open the app in a browser at a narrow viewport (375px) or use DevTools mobile emulation.

1. Navigate to any page (e.g. `/write` or a session).
2. Tap the voice chip in the header — session should connect.
3. Say something in Spanish — at least one user turn.
4. Tap the × to end the session.
5. Verify: `VoiceWaveMode` exits (slides down), then the DockedSheet rises with "Save this conversation?" heading and a duration.
6. Tap **Discard** — sheet closes, undo toast appears for 5 seconds.
7. Repeat steps 2–4, then tap **↩ Resume conversation** — sheet closes, voice reconnects.
8. End again, tap **Save & analyse** — "Analysing…" spinner, then navigate to `/sessions/[id]`.

- [ ] **Step 3: Test desktop flow**

Open the app at ≥768px viewport.

1. Start a voice session via the chip.
2. Speak a turn.
3. Click **End** in the strip.
4. Verify: the strip grows from 44px to 88px with the review controls.
5. Click **Save & analyse** — strip shows spinner, then navigate to `/sessions/[id]`.

- [ ] **Step 4: Test empty session edge case**

1. Start a voice session.
2. End immediately without speaking.
3. Verify: no review prompt appears; voice ends cleanly.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(voice): saveable global voice sessions"
```
