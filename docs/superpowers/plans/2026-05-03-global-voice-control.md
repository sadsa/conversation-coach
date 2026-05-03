# Global Voice Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the voice coach from a `/write`-only floating FAB to a header-anchored global control that persists across in-app navigation, with a WhatsApp-style status strip during active sessions and a one-line route-aware hint on `/write` and `/sessions/[id]`.

**Architecture:** Lift the voice agent's lifecycle out of the route-scoped `VoiceWidget` and into a `useVoiceController` hook mounted at the layout level inside `ConditionalNav`. Split the UI into `VoiceTrigger` (rendered inside `AppHeader`) and `VoiceStrip` (rendered as a sibling of the header, animating in/out via `framer-motion` when a session is active). Drop the `/write`-only practice-items fetch — phase 1 voice gets generic system prompt + a single sentence describing route location. Session title is shared from `TranscriptClient` to the controller via a `window.__ccSessionTitle` global since the controller lives above the route.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, framer-motion (already in deps), Vitest + React Testing Library, existing Gemini Live WebSocket via `lib/voice-agent.ts`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `lib/voice-agent.ts` | Add `VoiceRouteContext` type. Extend `buildSystemPrompt` to append route hint. Make `items` optional in `connect()`. Accept optional `routeContext` parameter. |
| Modify | `__tests__/lib/voice-agent.test.ts` | Add tests for route-context branches in `buildSystemPrompt`. |
| Modify | `lib/i18n.ts` | Add `voice.coachTitle`, `voice.languagePill.esAR`, `voice.languagePill.enNZ`, `voice.startCoachmark`, `voice.regionAria`, `voice.connectedAnnouncement` for both `en` and `es`. |
| Modify | `app/globals.css` | Add `--voice-strip-height: 0px` on `:root`. |
| Modify | `app/layout.tsx` | `<main>`'s `marginTop` includes `--voice-strip-height`. |
| Create | `components/VoiceTrigger.tsx` | Header mic button. Three states: idle / connecting / hidden. |
| Create | `__tests__/components/VoiceTrigger.test.tsx` | State rendering + click handler tests. |
| Create | `components/VoiceStrip.tsx` | The 44px status strip. Owns the audio-flow indicator, mute, end. Writes `--voice-strip-height` on mount, clears on unmount. |
| Create | `__tests__/components/VoiceStrip.test.tsx` | Mount renders correct elements. CSS variable lifecycle. Mute/end handlers. |
| Create | `components/VoiceController.tsx` | `useVoiceController` hook. State machine, agent lifecycle, RMS refs, keyboard shortcuts. |
| Create | `__tests__/components/VoiceController.test.tsx` | State transitions, cleanup on unmount, keyboard handlers. |
| Modify | `components/AppHeader.tsx` | Accept optional `voice` prop. Render `<VoiceTrigger>` in right cluster. Hide section label while voice is active. |
| Modify | `components/ConditionalNav.tsx` | Mount `useVoiceController`. Pass handle to `AppHeader`. Render `<VoiceStrip>` between header and main. Drop the `/write`-only practice-items fetch. |
| Modify | `components/TranscriptClient.tsx` | Write `window.__ccSessionTitle` on mount; clear on unmount. |
| Create | `types/window.d.ts` | Ambient declaration for `window.__ccSessionTitle`. |
| Create | `components/VoiceCoachmark.tsx` | One-shot first-run cue over the trigger on mobile. Uses existing `cc:voice-trigger-coachmark:v1` localStorage key pattern. |
| Create | `__tests__/components/VoiceCoachmark.test.tsx` | First-run shows; subsequent runs hide. |
| Create | `__tests__/integration/voice-cross-route.test.tsx` | Active session survives navigation between `/write` and `/sessions/[id]`. |
| Delete | `components/VoiceWidget.tsx` | Replaced by trigger + strip + controller split. |
| Delete | `__tests__/components/VoiceWidget.test.tsx` | Tests rewritten against the new components. |

---

## Task 1: Add `VoiceRouteContext` and route-aware `buildSystemPrompt`

**Files:**
- Modify: `lib/voice-agent.ts`
- Modify: `__tests__/lib/voice-agent.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/lib/voice-agent.test.ts` (inside the existing `describe('buildSystemPrompt', ...)` block):

```ts
  it('appends a Write-list hint when routeContext.kind is "write"', () => {
    const prompt = buildSystemPrompt('es-AR', items, { kind: 'write' })
    expect(prompt).toContain('Write list')
    expect(prompt).toContain('saved corrections')
  })

  it('appends a session-review hint with the title when routeContext.kind is "session"', () => {
    const prompt = buildSystemPrompt('es-AR', items, {
      kind: 'session',
      sessionTitle: 'Café con Mati',
    })
    expect(prompt).toContain("'Café con Mati'")
    expect(prompt).toContain('repasando')
  })

  it('uses English session-review wording for en-NZ', () => {
    const prompt = buildSystemPrompt('en-NZ', items, {
      kind: 'session',
      sessionTitle: 'Coffee with Mati',
    })
    expect(prompt).toContain("'Coffee with Mati'")
    expect(prompt).toContain('reviewing')
  })

  it('does not append a hint when routeContext.kind is "other"', () => {
    const prompt = buildSystemPrompt('es-AR', items, { kind: 'other' })
    expect(prompt).not.toContain('Write list')
    expect(prompt).not.toContain('reviewing')
    expect(prompt).not.toContain('repasando')
  })

  it('tells the agent to greet open-endedly when items empty and route is "other"', () => {
    const prompt = buildSystemPrompt('es-AR', [], { kind: 'other' })
    expect(prompt).toContain('Greet them briefly and ask how you can help')
  })

  it('omits the items block entirely when items is an empty array', () => {
    const prompt = buildSystemPrompt('es-AR', [], { kind: 'other' })
    expect(prompt).not.toContain('corrections to review')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/lib/voice-agent.test.ts
```

Expected: FAIL on the new cases — `buildSystemPrompt` does not yet accept a third argument and unconditionally renders the items block.

- [ ] **Step 3: Add the type and update `buildSystemPrompt`**

In `lib/voice-agent.ts`, add the type below the existing `FocusedCorrection` interface:

```ts
export type VoiceRouteContext =
  | { kind: 'write' }
  | { kind: 'session'; sessionTitle: string }
  | { kind: 'other' }
```

Replace the existing `buildSystemPrompt` with:

```ts
export function buildSystemPrompt(
  targetLanguage: TargetLanguage,
  items: FocusedCorrection[],
  routeContext: VoiceRouteContext = { kind: 'other' }
): string {
  const isEsAR = targetLanguage === 'es-AR'

  const languageBlock = isEsAR
    ? `You are a Rioplatense Argentine Spanish coach.\nSpeak exclusively in Argentine Spanish with a Rioplatense accent.\nUse voseo verb forms and natural everyday Rioplatense vocabulary.`
    : `You are a New Zealand English coach.\nSpeak exclusively in New Zealand English with a Kiwi accent and idioms.`

  const itemsBlock = items.length === 0
    ? ''
    : `\n\nThe user has these corrections to review:\n${items
        .slice(0, 10)
        .map((item, i) => `${i + 1}. "${item.original}" → "${item.correction ?? item.original}" — ${item.explanation}`)
        .join('\n')}`

  const routeHint = (() => {
    if (routeContext.kind === 'write') {
      return `\n\nThe user is currently looking at their Write list — saved corrections they want to internalise.`
    }
    if (routeContext.kind === 'session') {
      return isEsAR
        ? `\n\nEl usuario está repasando la conversación titulada '${routeContext.sessionTitle}'.`
        : `\n\nThe user is currently reviewing the conversation titled '${routeContext.sessionTitle}'.`
    }
    return ''
  })()

  const openingGuidance = items.length === 0 && routeContext.kind === 'other'
    ? `\n\nThe user has not given you a specific topic. Greet them briefly and ask how you can help.`
    : `\n\nBe brief and direct. State the key point in one or two sentences, then stop and wait for the user to respond. Only elaborate if the user asks. Do not volunteer extra examples or tangents unprompted. Let the user guide which correction they want to discuss.`

  return `${languageBlock}${itemsBlock}${routeHint}${openingGuidance}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/lib/voice-agent.test.ts
```

Expected: PASS — all new cases plus the existing four.

- [ ] **Step 5: Commit**

```bash
git add lib/voice-agent.ts __tests__/lib/voice-agent.test.ts
git commit -m "feat(voice): route-aware system prompt"
```

---

## Task 2: Make `items` optional + accept `routeContext` in `connect()`

**Files:**
- Modify: `lib/voice-agent.ts`

- [ ] **Step 1: Update the `connect()` signature**

In `lib/voice-agent.ts`, change the signature and the call to `buildSystemPrompt`:

```ts
export async function connect(
  targetLanguage: TargetLanguage,
  items: FocusedCorrection[] = [],
  callbacks: VoiceAgentCallbacks,
  routeContext: VoiceRouteContext = { kind: 'other' }
): Promise<VoiceAgent> {
```

Inside the function, replace the existing `systemInstruction.parts[0].text` line:

```ts
          systemInstruction: {
            parts: [{ text: buildSystemPrompt(targetLanguage, items, routeContext) }],
          },
```

- [ ] **Step 2: Verify nothing broke**

```bash
npm test -- __tests__/lib/voice-agent.test.ts
npm run lint
```

Expected: PASS, lint clean.

- [ ] **Step 3: Commit**

```bash
git add lib/voice-agent.ts
git commit -m "feat(voice): accept routeContext in connect()"
```

---

## Task 3: Add new i18n keys

**Files:**
- Modify: `lib/i18n.ts`

- [ ] **Step 1: Add the keys**

In `lib/i18n.ts`, locate the `voice.*` cluster in the `en` block (around line 419) and append:

```ts
    'voice.coachTitle': 'Voice coach',
    'voice.languagePill.esAR': 'ES-AR',
    'voice.languagePill.enNZ': 'EN-NZ',
    'voice.startCoachmark': 'Ask the coach anything',
    'voice.regionAria': 'Voice coach session',
    'voice.connectedAnnouncement': 'Voice coach connected',
```

In the `es` block (around line 832) append:

```ts
    'voice.coachTitle': 'Coach de voz',
    'voice.languagePill.esAR': 'ES-AR',
    'voice.languagePill.enNZ': 'EN-NZ',
    'voice.startCoachmark': 'Pregúntale al coach',
    'voice.regionAria': 'Sesión con el coach de voz',
    'voice.connectedAnnouncement': 'Coach de voz conectado',
```

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/i18n.ts
git commit -m "i18n(voice): add global voice control keys"
```

---

## Task 4: CSS variable + layout margin scaffold

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

This task makes the layout READY for the strip but adds no visible UI. The variable defaults to `0px` so nothing shifts.

- [ ] **Step 1: Add the variable to `:root` in `globals.css`**

Inside the second `@layer base { :root { ... } }` block (around line 142, where `--header-height` is defined), append:

```css
    /* Filled by VoiceStrip on mount; 0px when no voice session is active.
       Keeps `<main>`'s top spacing in lockstep with the strip's slide. */
    --voice-strip-height: 0px;
```

- [ ] **Step 2: Update `<main>`'s margin in `app/layout.tsx`**

Replace the existing `style` prop on `<main>` (around line 119–122) with:

```tsx
              style={{
                marginTop: 'calc(var(--header-height) + var(--voice-strip-height) + env(safe-area-inset-top))',
                scrollMarginTop: 'calc(var(--header-height) + var(--voice-strip-height) + env(safe-area-inset-top))',
              }}
```

- [ ] **Step 3: Verify no visible change**

```bash
npm run dev
```

Open the app, confirm header and content positions are unchanged. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "chore(voice): scaffold strip-height CSS variable"
```

---

## Task 5: VoiceTrigger component

**Files:**
- Create: `components/VoiceTrigger.tsx`
- Create: `__tests__/components/VoiceTrigger.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// __tests__/components/VoiceTrigger.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoiceTrigger } from '@/components/VoiceTrigger'
import { LanguageProvider } from '@/components/LanguageProvider'

function wrap(ui: React.ReactNode) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      {ui}
    </LanguageProvider>
  )
}

describe('VoiceTrigger', () => {
  it('renders a mic button when state is idle', () => {
    wrap(<VoiceTrigger state="idle" onStart={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /iniciar conversación de voz/i })
    expect(btn).toBeInTheDocument()
    expect(btn).not.toBeDisabled()
    expect(btn).not.toHaveAttribute('aria-busy', 'true')
  })

  it('renders a busy spinner when state is connecting', () => {
    wrap(<VoiceTrigger state="connecting" onStart={vi.fn()} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('renders nothing when state is active', () => {
    const { container } = wrap(<VoiceTrigger state="active" onStart={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when state is muted', () => {
    const { container } = wrap(<VoiceTrigger state="muted" onStart={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('calls onStart when clicked in idle state', () => {
    const onStart = vi.fn()
    wrap(<VoiceTrigger state="idle" onStart={onStart} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('does not call onStart when clicked in connecting state', () => {
    const onStart = vi.fn()
    wrap(<VoiceTrigger state="connecting" onStart={onStart} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onStart).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/components/VoiceTrigger.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/VoiceTrigger'`.

- [ ] **Step 3: Implement `VoiceTrigger`**

```tsx
// components/VoiceTrigger.tsx
//
// Header-anchored mic button that opens a voice session. Sibling to the
// theme toggle in AppHeader's right cluster. Hides itself entirely while a
// session is active — the VoiceStrip below the header is the affordance
// during a session; having both creates a "two mic buttons" problem.
'use client'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'

export type VoiceTriggerState = 'idle' | 'connecting' | 'active' | 'muted'

interface Props {
  state: VoiceTriggerState
  onStart: () => void
}

export function VoiceTrigger({ state, onStart }: Props) {
  const { t } = useTranslation()

  if (state === 'active' || state === 'muted') return null

  const isConnecting = state === 'connecting'

  return (
    <button
      type="button"
      onClick={isConnecting ? undefined : onStart}
      aria-label={t('voice.startAria')}
      aria-busy={isConnecting || undefined}
      disabled={isConnecting}
      className="
        w-11 h-11 -mr-1 flex items-center justify-center flex-shrink-0 group
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
        rounded-full
      "
    >
      <span
        className="
          w-8 h-8 rounded-full border border-border-subtle bg-surface
          flex items-center justify-center text-accent-primary
          group-hover:border-border transition-colors
          group-disabled:opacity-60
        "
      >
        <Icon
          name={isConnecting ? 'spinner' : 'mic'}
          className="w-4 h-4"
        />
      </span>
    </button>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/components/VoiceTrigger.test.tsx
```

Expected: PASS — all six cases.

- [ ] **Step 5: Commit**

```bash
git add components/VoiceTrigger.tsx __tests__/components/VoiceTrigger.test.tsx
git commit -m "feat(voice): VoiceTrigger header button"
```

---

## Task 6: VoiceStrip component

**Files:**
- Create: `components/VoiceStrip.tsx`
- Create: `__tests__/components/VoiceStrip.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// __tests__/components/VoiceStrip.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { VoiceStrip } from '@/components/VoiceStrip'
import { LanguageProvider } from '@/components/LanguageProvider'
import { createRef } from 'react'

beforeEach(cleanup)

function wrap(ui: React.ReactNode) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      {ui}
    </LanguageProvider>
  )
}

describe('VoiceStrip', () => {
  it('renders the dot, title, language pill, mute and end controls', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(
      <VoiceStrip
        muted={false}
        indicatorRef={ref}
        onMute={vi.fn()}
        onEnd={vi.fn()}
      />
    )
    expect(screen.getByText(/coach de voz/i)).toBeInTheDocument()
    expect(screen.getByText('ES-AR')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /silenciar micrófono/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /finalizar conversación/i })).toBeInTheDocument()
  })

  it('renders EN-NZ pill for en-NZ users', () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <LanguageProvider initialTargetLanguage="en-NZ">
        <VoiceStrip muted={false} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />
      </LanguageProvider>
    )
    expect(screen.getByText('EN-NZ')).toBeInTheDocument()
  })

  it('writes --voice-strip-height on mount and clears it on unmount', () => {
    const ref = createRef<HTMLDivElement>()
    const { unmount } = wrap(
      <VoiceStrip muted={false} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />
    )
    expect(document.documentElement.style.getPropertyValue('--voice-strip-height')).toBe('2.75rem')
    unmount()
    expect(document.documentElement.style.getPropertyValue('--voice-strip-height')).toBe('')
  })

  it('shows mic-off icon and aria-pressed=true when muted', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(
      <VoiceStrip muted={true} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />
    )
    const muteBtn = screen.getByRole('button', { name: /activar micrófono/i })
    expect(muteBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onMute / onEnd', () => {
    const ref = createRef<HTMLDivElement>()
    const onMute = vi.fn()
    const onEnd = vi.fn()
    wrap(<VoiceStrip muted={false} indicatorRef={ref} onMute={onMute} onEnd={onEnd} />)
    fireEvent.click(screen.getByRole('button', { name: /silenciar/i }))
    fireEvent.click(screen.getByRole('button', { name: /finalizar/i }))
    expect(onMute).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('renders an aria-live region announcing connection on mount', () => {
    const ref = createRef<HTMLDivElement>()
    wrap(<VoiceStrip muted={false} indicatorRef={ref} onMute={vi.fn()} onEnd={vi.fn()} />)
    const live = screen.getByText(/coach de voz conectado/i)
    expect(live).toHaveAttribute('aria-live', 'polite')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/components/VoiceStrip.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/VoiceStrip'`.

- [ ] **Step 3: Implement `VoiceStrip`**

```tsx
// components/VoiceStrip.tsx
//
// 44px status strip rendered between AppHeader and <main> while a voice
// session is active. Owns the audio-flow indicator (driven by RMS refs in
// VoiceController via `indicatorRef`), the language pill, mute, and end.
//
// Surface side-effect: on mount the strip writes `--voice-strip-height` so
// `<main>`'s top margin grows in lockstep with the strip's appearance.
// Cleared on unmount. The strip itself is fixed below the header via CSS
// rather than affecting layout flow — `<main>` learns about its presence
// purely through the CSS variable.
'use client'
import { useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  muted: boolean
  indicatorRef: React.RefObject<HTMLDivElement | null>
  onMute: () => void
  onEnd: () => void
}

export function VoiceStrip({ muted, indicatorRef, onMute, onEnd }: Props) {
  const { t, targetLanguage } = useTranslation()
  const pillKey = targetLanguage === 'en-NZ' ? 'voice.languagePill.enNZ' : 'voice.languagePill.esAR'

  useEffect(() => {
    document.documentElement.style.setProperty('--voice-strip-height', '2.75rem')
    return () => {
      document.documentElement.style.removeProperty('--voice-strip-height')
    }
  }, [])

  return (
    <div
      role="region"
      aria-label={t('voice.regionAria')}
      className="
        fixed left-0 right-0 z-30
        h-11
        border-b border-border-subtle
      "
      style={{
        top: 'calc(var(--header-height) + env(safe-area-inset-top))',
        background:
          'color-mix(in oklch, var(--color-surface-elevated) 92%, var(--color-accent-primary) 8%)',
      }}
    >
      <div
        role="toolbar"
        aria-label={t('voice.toolbarAria')}
        className="h-full max-w-2xl mx-auto px-4 md:px-10 flex items-center gap-2"
      >
        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <div ref={indicatorRef} className="voice-indicator" data-speaker="idle" data-muted={muted ? 'true' : 'false'} />
        </div>

        <span className="text-xs font-medium text-text-primary whitespace-nowrap">
          {t('voice.coachTitle')}
        </span>

        <span
          className="
            text-[10px] font-medium uppercase tracking-wider
            text-on-accent-chip bg-accent-chip
            border border-accent-chip-border/40
            px-2 py-0.5 rounded-full whitespace-nowrap
          "
        >
          {t(pillKey)}
        </span>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onMute}
          aria-label={muted ? t('voice.unmuteAria') : t('voice.muteAria')}
          aria-pressed={muted}
          className="
            w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            text-text-secondary hover:text-text-primary
            aria-pressed:bg-error-surface aria-pressed:text-on-error-surface
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
        >
          <Icon name={muted ? 'mic-off' : 'mic'} className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onEnd}
          aria-label={t('voice.endAria')}
          className="
            w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            text-text-secondary hover:text-text-primary
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
        >
          <Icon name="close" className="w-4 h-4" />
        </button>
      </div>

      <span aria-live="polite" className="sr-only">
        {t('voice.connectedAnnouncement')}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/components/VoiceStrip.test.tsx
```

Expected: PASS — all six cases.

- [ ] **Step 5: Commit**

```bash
git add components/VoiceStrip.tsx __tests__/components/VoiceStrip.test.tsx
git commit -m "feat(voice): VoiceStrip status bar"
```

---

## Task 7: VoiceController hook

**Files:**
- Create: `components/VoiceController.tsx`
- Create: `__tests__/components/VoiceController.test.tsx`
- Create: `types/window.d.ts`

- [ ] **Step 1: Add the ambient declaration**

```ts
// types/window.d.ts
//
// Session title bridge between TranscriptClient (route-scoped) and
// VoiceController (lifted above the route in ConditionalNav). The
// controller reads this lazily inside `start()` so it can include the
// session title in the agent's route hint without prop-drilling.
//
// Cleared on TranscriptClient unmount so navigating away from a session
// never leaves a stale title behind.
declare global {
  interface Window {
    __ccSessionTitle?: string
  }
}

export {}
```

Verify the file is picked up by the existing TS config:

```bash
npx tsc --noEmit
```

Expected: PASS (the file is included by the project's `tsconfig.json` `include: ["**/*.ts", "**/*.tsx"]` glob).

- [ ] **Step 2: Write the failing tests**

```tsx
// __tests__/components/VoiceController.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/components/LanguageProvider'
import { useVoiceController } from '@/components/VoiceController'

vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(),
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/write',
}))

const mockConnect = (await import('@/lib/voice-agent')).connect as ReturnType<typeof vi.fn>

;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}) as unknown as MediaQueryList

function wrapper({ children }: { children: React.ReactNode }) {
  return <LanguageProvider initialTargetLanguage="es-AR">{children}</LanguageProvider>
}

describe('useVoiceController', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    delete (window as unknown as { __ccSessionTitle?: string }).__ccSessionTitle
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    expect(result.current.state).toBe('idle')
  })

  it('transitions idle → connecting → active', async () => {
    let cb: Parameters<typeof mockConnect>[2]
    mockConnect.mockImplementation((_l, _i, callbacks) => {
      cb = callbacks
      return Promise.resolve({ setMuted: vi.fn(), disconnect: vi.fn() })
    })
    const { result } = renderHook(() => useVoiceController(), { wrapper })

    await act(async () => { result.current.start() })
    expect(result.current.state).toBe('connecting')

    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce())
    act(() => { cb!.onStateChange('active') })
    expect(result.current.state).toBe('active')
  })

  it('passes routeContext "write" when pathname starts with /write', async () => {
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    expect(mockConnect).toHaveBeenCalledWith(
      'es-AR',
      [],
      expect.any(Object),
      { kind: 'write' }
    )
  })

  it('disconnects on unmount', async () => {
    const disconnect = vi.fn()
    let cb: Parameters<typeof mockConnect>[2]
    mockConnect.mockImplementation((_l, _i, callbacks) => {
      cb = callbacks
      return Promise.resolve({ setMuted: vi.fn(), disconnect })
    })
    const { result, unmount } = renderHook(() => useVoiceController(), { wrapper })

    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())
    act(() => { cb!.onStateChange('active') })

    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('returns to idle when permission is denied', async () => {
    mockConnect.mockRejectedValue(new Error('Permission denied by user'))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.toast).toMatch(/micrófono/i)
  })

  it('mutes and unmutes', async () => {
    const setMuted = vi.fn()
    let cb: Parameters<typeof mockConnect>[2]
    mockConnect.mockImplementation((_l, _i, callbacks) => {
      cb = callbacks
      return Promise.resolve({ setMuted, disconnect: vi.fn() })
    })
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())
    act(() => { cb!.onStateChange('active') })

    act(() => { result.current.toggleMute() })
    expect(result.current.state).toBe('muted')
    expect(setMuted).toHaveBeenCalledWith(true)

    act(() => { result.current.toggleMute() })
    expect(result.current.state).toBe('active')
    expect(setMuted).toHaveBeenLastCalledWith(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test -- __tests__/components/VoiceController.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/VoiceController'`.

- [ ] **Step 4: Implement the controller hook**

```tsx
// components/VoiceController.tsx
//
// Lives above the route inside ConditionalNav. Owns the WebSocket / mic /
// AudioContext via VoiceAgent so the session survives in-app navigation.
//
// State machine: idle → connecting → active ↔ muted → idle.
// Cleanup: a single useEffect cleanup disconnects the agent if
// ConditionalNav unmounts (sign-out, entering an auth-public route).
//
// Page-context hint is computed at start() time, not on every render. Once
// connected, the agent's mental model of "where you are" doesn't whiplash
// when the user navigates mid-session.
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { connect } from '@/lib/voice-agent'
import type { VoiceAgent, VoiceAgentState, VoiceRouteContext } from '@/lib/voice-agent'

const RMS_DECAY = 0.85
const RMS_FLOOR = 0.004
const SCALE_GAIN = 5
const SCALE_MAX = 0.45

export type VoiceControllerState = 'idle' | 'connecting' | 'active' | 'muted'

export interface VoiceController {
  state: VoiceControllerState
  toast: string | null
  indicatorRef: React.RefObject<HTMLDivElement | null>
  start: () => void
  toggleMute: () => void
  end: () => void
}

function deriveRouteContext(pathname: string | null): VoiceRouteContext {
  if (!pathname) return { kind: 'other' }
  if (pathname.startsWith('/write')) return { kind: 'write' }
  if (pathname.startsWith('/sessions/')) {
    const sessionTitle = typeof window !== 'undefined' ? window.__ccSessionTitle : undefined
    if (sessionTitle) return { kind: 'session', sessionTitle }
  }
  return { kind: 'other' }
}

export function useVoiceController(): VoiceController {
  const { t, targetLanguage } = useTranslation()
  const pathname = usePathname()
  const [state, setState] = useState<VoiceControllerState>('idle')
  const [toast, setToast] = useState<string | null>(null)

  const agentRef = useRef<VoiceAgent | null>(null)
  const userRmsRef = useRef(0)
  const agentRmsRef = useRef(0)
  const indicatorRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 4000)
  }, [])

  const start = useCallback(async () => {
    if (state !== 'idle') return
    setState('connecting')

    try {
      const agent = await connect(
        targetLanguage,
        [],
        {
          onStateChange: (s: VoiceAgentState) => {
            if (s === 'active') setState('active')
            else if (s === 'ended') {
              setState('idle')
              agentRef.current = null
            }
          },
          onError: (message: string) => {
            setState('idle')
            agentRef.current = null
            if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
              showToast(t('voice.micPermission'))
            } else {
              showToast(t('voice.sessionEnded'))
            }
          },
          onUserAudio: (rms) => { userRmsRef.current = Math.max(userRmsRef.current, rms) },
          onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
        },
        deriveRouteContext(pathname)
      )
      agentRef.current = agent
    } catch (err) {
      setState('idle')
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
        showToast(t('voice.micPermission'))
      } else {
        showToast(t('voice.sessionEnded'))
      }
    }
  }, [state, targetLanguage, pathname, t, showToast])

  const end = useCallback(() => {
    agentRef.current?.disconnect()
  }, [])

  const toggleMute = useCallback(() => {
    if (!agentRef.current) return
    if (state === 'muted') {
      agentRef.current.setMuted(false)
      setState('active')
    } else if (state === 'active') {
      agentRef.current.setMuted(true)
      setState('muted')
    }
  }, [state])

  // Keyboard shortcuts — only mounted while in an active session.
  useEffect(() => {
    if (state !== 'active' && state !== 'muted') return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        end()
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        toggleMute()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, end, toggleMute])

  // Audio-flow indicator drive loop. Reads RMS refs, decays them, writes
  // transform + data-speaker straight to the DOM so we don't trigger React
  // re-renders at frame rate.
  useEffect(() => {
    if (state !== 'active' && state !== 'muted') {
      userRmsRef.current = 0
      agentRmsRef.current = 0
      return
    }
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function tick() {
      const u = userRmsRef.current
      const a = agentRmsRef.current
      userRmsRef.current = u * RMS_DECAY
      agentRmsRef.current = a * RMS_DECAY

      const el = indicatorRef.current
      if (el) {
        let speaker: 'idle' | 'user' | 'agent' = 'idle'
        if (state !== 'muted') {
          if (a > u && a > RMS_FLOOR) speaker = 'agent'
          else if (u > RMS_FLOOR) speaker = 'user'
        }
        el.dataset.speaker = speaker
        el.dataset.muted = state === 'muted' ? 'true' : 'false'

        if (!reducedMotion) {
          const peak = Math.max(u, a)
          const scale = 1 + Math.min(SCALE_MAX, peak * SCALE_GAIN)
          el.style.transform = `scale(${scale.toFixed(3)})`
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [state])

  // Disconnect the agent and clear any pending toast on unmount so a
  // ConditionalNav unmount (sign-out, auth-public route) doesn't leak the
  // WebSocket or fire setState on an unmounted component.
  useEffect(() => {
    return () => {
      agentRef.current?.disconnect()
      agentRef.current = null
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  return { state, toast, indicatorRef, start, toggleMute, end }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- __tests__/components/VoiceController.test.tsx
```

Expected: PASS — six cases.

- [ ] **Step 6: Commit**

```bash
git add components/VoiceController.tsx __tests__/components/VoiceController.test.tsx types/window.d.ts
git commit -m "feat(voice): useVoiceController hook"
```

---

## Task 8: Wire the trigger into AppHeader

**Files:**
- Modify: `components/AppHeader.tsx`
- Modify: `__tests__/components/AppHeader.test.tsx` (if it exists; check first)

- [ ] **Step 1: Check for an existing AppHeader test**

```bash
ls __tests__/components/AppHeader.test.tsx 2>/dev/null || echo "no existing test"
```

If the test exists, modify it; if not, create one in step 4.

- [ ] **Step 2: Update `AppHeader` to accept and render the trigger**

In `components/AppHeader.tsx`:

Add the import:

```tsx
import { VoiceTrigger, type VoiceTriggerState } from '@/components/VoiceTrigger'
```

Update the `AppHeaderProps` interface:

```tsx
interface AppHeaderProps {
  isOpen: boolean
  onOpen: () => void
  voice?: {
    state: VoiceTriggerState
    onStart: () => void
  }
}
```

Update the component signature:

```tsx
export function AppHeader({ isOpen, onOpen, voice }: AppHeaderProps) {
```

Inside the component, derive whether the section label should be hidden during an active session:

```tsx
  const voiceActive = voice?.state === 'active' || voice?.state === 'muted'
  const showSectionLabel = !!sectionLabel && !voiceActive
```

Replace the `{sectionLabel && (...)}` block with:

```tsx
            {showSectionLabel && (
              <span className="ml-1 text-sm font-medium text-text-primary truncate">
                {sectionLabel}
              </span>
            )}
```

In the right-cluster, insert the trigger immediately before the existing theme-toggle button:

```tsx
          <div className="flex items-center gap-1 -mr-1">
            {voice && <VoiceTrigger state={voice.state} onStart={voice.onStart} />}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="w-11 h-11 -mr-2 flex items-center justify-center flex-shrink-0 group"
            >
              {/* … existing inner span / svg unchanged … */}
            </button>
          </div>
```

Wrap the existing theme-toggle button in that new `<div className="flex items-center gap-1 -mr-1">` so the two buttons sit as siblings. Remove the `-mr-2` from the theme-toggle button (the wrapper div carries the spacing now), but keep the inner 32×32 visual circle.

- [ ] **Step 3: Smoke check**

```bash
npm run build
```

Expected: PASS. The trigger doesn't render yet because `ConditionalNav` doesn't pass the `voice` prop (Task 10).

- [ ] **Step 4: Add component test**

```tsx
// __tests__/components/AppHeader.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppHeader } from '@/components/AppHeader'
import { LanguageProvider } from '@/components/LanguageProvider'
import { ThemeProvider } from '@/components/ThemeProvider'

vi.mock('next/navigation', () => ({
  usePathname: () => '/write',
}))

function wrap(ui: React.ReactNode) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <ThemeProvider>{ui}</ThemeProvider>
    </LanguageProvider>
  )
}

describe('AppHeader', () => {
  it('renders the section label when no voice prop is supplied', () => {
    wrap(<AppHeader isOpen={false} onOpen={vi.fn()} />)
    expect(screen.getByText(/anotar/i)).toBeInTheDocument()
  })

  it('renders the voice trigger when voice prop is supplied with idle state', () => {
    wrap(<AppHeader isOpen={false} onOpen={vi.fn()} voice={{ state: 'idle', onStart: vi.fn() }} />)
    expect(screen.getByRole('button', { name: /iniciar conversación de voz/i })).toBeInTheDocument()
  })

  it('hides the section label when voice is active', () => {
    wrap(<AppHeader isOpen={false} onOpen={vi.fn()} voice={{ state: 'active', onStart: vi.fn() }} />)
    expect(screen.queryByText(/anotar/i)).not.toBeInTheDocument()
  })
})
```

> Note: `nav.write` resolves to "Anotar" in `es-AR` and "Write" in `en-NZ` (verified in `lib/i18n.ts`).

- [ ] **Step 5: Run tests**

```bash
npm test -- __tests__/components/AppHeader.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/AppHeader.tsx __tests__/components/AppHeader.test.tsx
git commit -m "feat(voice): wire VoiceTrigger into AppHeader"
```

---

## Task 9: TranscriptClient publishes session title

**Files:**
- Modify: `components/TranscriptClient.tsx`

- [ ] **Step 1: Add the effect**

In `components/TranscriptClient.tsx`, immediately after the existing `const [title, setTitle] = useState(initialDetail.session.title)` (around line 25), add:

```tsx
  // Bridge the session title up to the global voice controller, which
  // lives above the route in ConditionalNav. The controller reads this
  // lazily inside `start()` so a voice session opened on this page
  // includes the session title in its route hint without prop-drilling.
  useEffect(() => {
    window.__ccSessionTitle = title
    return () => {
      delete window.__ccSessionTitle
    }
  }, [title])
```

Verify `useEffect` is already imported at the top of the file. It is, so no import change needed.

- [ ] **Step 2: Smoke check**

```bash
npm run build
```

Expected: PASS. `window.__ccSessionTitle` typechecks against `types/window.d.ts`.

- [ ] **Step 3: Commit**

```bash
git add components/TranscriptClient.tsx
git commit -m "feat(voice): publish session title for voice hint"
```

---

## Task 10: Wire ConditionalNav + delete VoiceWidget

**Files:**
- Modify: `components/ConditionalNav.tsx`
- Delete: `components/VoiceWidget.tsx`
- Delete: `__tests__/components/VoiceWidget.test.tsx`

- [ ] **Step 1: Replace `ConditionalNav.tsx` contents**

```tsx
// components/ConditionalNav.tsx
'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { NavDrawer } from '@/components/NavDrawer'
import { BottomNav } from '@/components/BottomNav'
import { VoiceStrip } from '@/components/VoiceStrip'
import { useVoiceController } from '@/components/VoiceController'
import { Toast } from '@/components/Toast'

const HIDDEN_ON = ['/login', '/access-denied', '/onboarding', '/auth']

export function ConditionalNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const voice = useVoiceController()

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  const voiceActive = voice.state === 'active' || voice.state === 'muted'

  return (
    <>
      <AppHeader
        isOpen={isOpen}
        onOpen={() => setIsOpen(true)}
        voice={{ state: voice.state, onStart: voice.start }}
      />
      <NavDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <BottomNav />
      {voiceActive && (
        <VoiceStrip
          muted={voice.state === 'muted'}
          indicatorRef={voice.indicatorRef}
          onMute={voice.toggleMute}
          onEnd={voice.end}
        />
      )}
      {voice.toast && <Toast message={voice.toast} toastKey={Date.now()} />}
    </>
  )
}
```

- [ ] **Step 2: Delete the obsolete files**

```bash
git rm components/VoiceWidget.tsx __tests__/components/VoiceWidget.test.tsx
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test
npm run lint
npm run build
```

Expected: PASS / PASS / PASS. Watch for any test importing `@/components/VoiceWidget` — there should be none after Step 2 since the only direct importer was `ConditionalNav`.

- [ ] **Step 4: Manual smoke test**

```bash
npm run dev
```

Verify on `localhost:3000`:
- Header on `/write` shows the mic button next to the theme toggle.
- Tapping mic transitions trigger to `aria-busy` for a beat, then the strip slides down between header and content. Section label disappears.
- Page content shifts down by 44px in lockstep with the strip's appearance.
- Mute button toggles. End button retracts the strip and returns the trigger.
- Navigating to `/sessions/<id>` while a session is active does NOT disconnect — the strip stays up.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add components/ConditionalNav.tsx
git commit -m "feat(voice): mount controller above route, drop FAB"
```

---

## Task 11: First-run coachmark

**Files:**
- Create: `components/VoiceCoachmark.tsx`
- Create: `__tests__/components/VoiceCoachmark.test.tsx`
- Modify: `components/ConditionalNav.tsx` (mount the coachmark)

- [ ] **Step 1: Write the failing tests**

```tsx
// __tests__/components/VoiceCoachmark.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoiceCoachmark } from '@/components/VoiceCoachmark'
import { LanguageProvider } from '@/components/LanguageProvider'

const STORAGE_KEY = 'cc:voice-trigger-coachmark:v1'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true })

function wrap(ui: React.ReactNode) {
  return render(<LanguageProvider initialTargetLanguage="es-AR">{ui}</LanguageProvider>)
}

describe('VoiceCoachmark', () => {
  beforeEach(() => { localStorageMock.clear() })

  it('renders on first run', () => {
    wrap(<VoiceCoachmark visible={true} />)
    expect(screen.getByText(/pregúntale al coach/i)).toBeInTheDocument()
  })

  it('does not render when already dismissed in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '1')
    const { container } = wrap(<VoiceCoachmark visible={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render when visible=false', () => {
    const { container } = wrap(<VoiceCoachmark visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('dismisses on click and writes the localStorage flag', () => {
    wrap(<VoiceCoachmark visible={true} />)
    const dismiss = screen.getByRole('button', { name: /cerrar/i })
    fireEvent.click(dismiss)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/components/VoiceCoachmark.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/VoiceCoachmark'`.

- [ ] **Step 3: Implement the coachmark**

```tsx
// components/VoiceCoachmark.tsx
//
// One-shot first-run cue over the header mic button. Mobile-only (md:hidden)
// because on desktop the trigger sits next to the theme toggle in plain
// view. Mirrors the localStorage one-shot pattern of UploadCoachmark.
'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'

const STORAGE_KEY = 'cc:voice-trigger-coachmark:v1'

interface Props {
  visible: boolean
}

export function VoiceCoachmark({ visible }: Props) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }

  if (!visible || dismissed) return null

  return (
    <div
      className="
        md:hidden fixed top-[calc(var(--header-height)+env(safe-area-inset-top)+8px)]
        right-12 z-40
        bg-surface-elevated border border-border rounded-2xl
        px-3 py-2 flex items-center gap-2
        shadow-md
      "
      role="dialog"
      aria-label={t('voice.startCoachmark')}
    >
      <span className="text-xs font-medium text-text-primary whitespace-nowrap">
        {t('voice.startCoachmark')}
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('common.close') /* falls back to "Cerrar" if missing */ || 'Cerrar'}
        className="w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-text-primary"
      >
        <Icon name="close" className="w-3 h-3" />
      </button>
    </div>
  )
}
```

If `common.close` doesn't exist in `lib/i18n.ts`, hard-code the aria-label as `"Cerrar"` for `es` and `"Dismiss"` for `en` and add the translation key in this same task — but check first:

```bash
grep -n "common.close" lib/i18n.ts || echo "key missing"
```

If missing, add to both blocks:

```ts
    'common.close': 'Dismiss',  // en
    'common.close': 'Cerrar',   // es
```

And replace the aria-label fallback with the bare `t('common.close')`.

- [ ] **Step 4: Mount the coachmark in `ConditionalNav`**

In `components/ConditionalNav.tsx`, add the import:

```tsx
import { VoiceCoachmark } from '@/components/VoiceCoachmark'
```

Inside the JSX, immediately before `<NavDrawer ...>`:

```tsx
      <VoiceCoachmark visible={voice.state === 'idle'} />
```

- [ ] **Step 5: Run tests**

```bash
npm test -- __tests__/components/VoiceCoachmark.test.tsx
npm run build
```

Expected: PASS / PASS.

- [ ] **Step 6: Commit**

```bash
git add components/VoiceCoachmark.tsx components/ConditionalNav.tsx __tests__/components/VoiceCoachmark.test.tsx lib/i18n.ts
git commit -m "feat(voice): first-run coachmark on mic trigger"
```

---

## Task 12: Cross-route persistence integration test

**Files:**
- Create: `__tests__/integration/voice-cross-route.test.tsx`

- [ ] **Step 1: Write the integration test**

```tsx
// __tests__/integration/voice-cross-route.test.tsx
//
// The whole point of lifting voice into ConditionalNav was that the
// session survives in-app navigation. Lock that behaviour with an
// integration test: mount ConditionalNav, mock usePathname so we can flip
// it like a router would, start a session, change the pathname, and
// assert that disconnect was NOT called.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/components/LanguageProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ConditionalNav } from '@/components/ConditionalNav'

const pathnameRef = { current: '/write' }
vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

const disconnect = vi.fn()
const setMuted = vi.fn()
let stateChange: ((s: 'connecting' | 'active' | 'ended') => void) | null = null

vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(async (_l, _i, callbacks) => {
    stateChange = callbacks.onStateChange
    return { setMuted, disconnect }
  }),
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}))

;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}) as unknown as MediaQueryList

function wrap() {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <ThemeProvider>
        <ConditionalNav />
      </ThemeProvider>
    </LanguageProvider>
  )
}

describe('voice session persistence across routes', () => {
  beforeEach(() => {
    pathnameRef.current = '/write'
    disconnect.mockClear()
    setMuted.mockClear()
    stateChange = null
  })

  it('does not disconnect when the route changes mid-session', async () => {
    const { rerender } = wrap()

    fireEvent.click(screen.getByRole('button', { name: /iniciar conversación de voz/i }))
    await waitFor(() => expect(stateChange).not.toBeNull())
    act(() => { stateChange!('active') })

    expect(screen.getByRole('region', { name: /sesión con el coach/i })).toBeInTheDocument()
    expect(disconnect).not.toHaveBeenCalled()

    pathnameRef.current = '/sessions/abc-123'
    rerender(
      <LanguageProvider initialTargetLanguage="es-AR">
        <ThemeProvider><ConditionalNav /></ThemeProvider>
      </LanguageProvider>
    )

    expect(screen.getByRole('region', { name: /sesión con el coach/i })).toBeInTheDocument()
    expect(disconnect).not.toHaveBeenCalled()
  })

  it('disconnects when ConditionalNav unmounts (sign-out)', async () => {
    const { unmount } = wrap()

    fireEvent.click(screen.getByRole('button', { name: /iniciar conversación de voz/i }))
    await waitFor(() => expect(stateChange).not.toBeNull())
    act(() => { stateChange!('active') })

    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the integration test**

```bash
npm test -- __tests__/integration/voice-cross-route.test.tsx
```

Expected: PASS — both cases.

- [ ] **Step 3: Run the full test suite once more**

```bash
npm test
npm run lint
npm run build
```

Expected: PASS / PASS / PASS.

- [ ] **Step 4: Commit**

```bash
git add __tests__/integration/voice-cross-route.test.tsx
git commit -m "test(voice): integration cover cross-route persistence"
```

---

## Task 13: Final manual QA pass

This task is a checklist, not code. Run it on the dev server before declaring the feature shipped.

- [ ] **Light theme + dark theme** — toggle theme on `/write`. Mic icon stays visible and accent-tinted. Strip surface keeps the 8% accent mix in both themes.

- [ ] **Mobile narrow (320×568)** — verify:
  - Header doesn't overflow with menu + section label + mic + theme toggle.
  - Coachmark renders on first authenticated load and dismisses cleanly.
  - Strip contents fit (dot, title, pill, spacer, mute, end). Title may truncate; pill should not.

- [ ] **Reduced motion** — toggle the OS setting (or DevTools emulation). Strip mounts/unmounts instantly. Audio-flow dot stops scaling but the colour still changes.

- [ ] **Mic permission denied** — block mic permission in DevTools, click the trigger. State returns to idle, toast shows `voice.micPermission`.

- [ ] **Cross-route smoke** — start session on `/`. Navigate to `/write`, then to `/sessions/<id>` (any session). Session stays alive on each transition. End on `/sessions/<id>`. Strip retracts, content shifts back up by 44px.

- [ ] **Sign-out cleanup** — start a session, sign out via the nav drawer. WebSocket closes (check the Network tab); no errors in the console.

- [ ] **iOS PWA standalone** — install to home screen. Verify safe-area insets respected: status-bar tint matches header-strip surface; bottom nav clearance correct.

If anything fails, file the issue against this plan and fix before merging.

---

## Self-review notes

- Each spec section has a corresponding task: route hint (1, 2), CSS layout (4), trigger (5), strip (6), controller (7), header wiring (8), session-title bridge (9), main wiring (10), discoverability (11), tests (1, 5, 6, 7, 8, 11, 12).
- All types and method names are consistent across tasks (`VoiceTriggerState`, `VoiceController`, `VoiceRouteContext`, `useVoiceController`, etc.).
- Manual QA in Task 13 covers everything that can't be unit-tested (visual fidelity, OS-level reduced motion, iOS PWA insets).
