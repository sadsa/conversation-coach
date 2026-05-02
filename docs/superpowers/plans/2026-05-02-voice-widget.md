# Voice Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent floating voice widget to every protected screen so the user can tap once and discuss their unwritten practice item corrections with an AI coach in Rioplatense Spanish (or Kiwi English).

**Architecture:** A global `<VoiceWidget>` client component mounted inside `ConditionalNav` fetches unwritten practice items on mount and manages a WebSocket connection to the AssemblyAI Voice Agent API (`wss://agents.assemblyai.com/v1/ws`). A server route `GET /api/voice-token` mints short-lived single-use tokens so the API key never reaches the browser. When the user taps ← / →, a `session.update` message is sent mid-conversation to swap the focused correction without dropping the call.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, AssemblyAI Voice Agent WebSocket API, Web Audio API + AudioWorklet (PCM16 at 24 kHz), Vitest + React Testing Library.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `public/pcm-processor.js` | AudioWorklet processor — converts Float32 mic input to PCM16, sends to main thread |
| Create | `app/api/voice-token/route.ts` | Mints short-lived AssemblyAI Voice Agent token, auth-gated |
| Modify | `components/Icon.tsx` | Add `mic` and `mic-off` icons |
| Modify | `lib/i18n.ts` | Add voice widget translation keys (both `en` and `es`) |
| Create | `lib/voice-agent.ts` | WebSocket wrapper + `buildSystemPrompt` helper |
| Create | `components/VoiceWidget.tsx` | Floating bubble → expanded pill UI |
| Modify | `components/ConditionalNav.tsx` | Mount `<VoiceWidget>` |
| Create | `__tests__/lib/voice-agent.test.ts` | Unit tests for `buildSystemPrompt` and WebSocket lifecycle |
| Create | `__tests__/components/VoiceWidget.test.tsx` | Component tests for all widget states |
| Modify | `__tests__/components/ConditionalNav.test.tsx` | Assert widget renders on protected routes |

---

## Task 1: Server token route

**Files:**
- Create: `app/api/voice-token/route.ts`
- Create: `__tests__/api/voice-token.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/voice-token.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

import { GET } from '@/app/api/voice-token/route'
import { getAuthenticatedUser } from '@/lib/auth'

const mockGetUser = getAuthenticatedUser as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  process.env.ASSEMBLYAI_API_KEY = 'test-api-key'
})

describe('GET /api/voice-token', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns a token when authenticated', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'temp-token-abc' }),
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBe('temp-token-abc')
  })

  it('returns 500 when AssemblyAI token fetch fails', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service unavailable'),
    })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/api/voice-token.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/voice-token/route'`

- [ ] **Step 3: Create the route**

```ts
// app/api/voice-token/route.ts
import { getAuthenticatedUser } from '@/lib/auth'
import { log } from '@/lib/logger'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const url = new URL('https://agents.assemblyai.com/v1/token')
  url.searchParams.set('expires_in_seconds', '300')
  url.searchParams.set('max_session_duration_seconds', '8640')

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${process.env.ASSEMBLYAI_API_KEY}` },
  })

  if (!response.ok) {
    log.error('Voice token fetch failed', { status: response.status })
    return new Response('Token fetch failed', { status: 500 })
  }

  const { token } = await response.json() as { token: string }
  return Response.json({ token })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/api/voice-token.test.ts
```

Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add app/api/voice-token/route.ts __tests__/api/voice-token.test.ts
git commit -m "feat(voice): add server-side voice token endpoint"
```

---

## Task 2: PCM audio processor worklet

**Files:**
- Create: `public/pcm-processor.js`

This file must be a plain JavaScript AudioWorklet processor served as a static file. No TypeScript, no imports.

- [ ] **Step 1: Create the worklet processor**

```js
// public/pcm-processor.js
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0]
    if (input) {
      const pcm16 = new Int16Array(input.length)
      for (let i = 0; i < input.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(input[i] * 32767)))
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer])
    }
    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
```

- [ ] **Step 2: Verify the file is served by the dev server**

```bash
npm run dev &
curl -s http://localhost:3000/pcm-processor.js | head -5
```

Expected: first line is `class PCMProcessor extends AudioWorkletProcessor {`

Kill the dev server after verifying.

- [ ] **Step 3: Commit**

```bash
git add public/pcm-processor.js
git commit -m "feat(voice): add PCM16 AudioWorklet processor"
```

---

## Task 3: Add mic icons and i18n keys

**Files:**
- Modify: `components/Icon.tsx`
- Modify: `lib/i18n.ts`

- [ ] **Step 1: Add `mic` and `mic-off` to Icon.tsx**

In `components/Icon.tsx`, add these entries inside the `ICONS` object (after the existing `'thumbs-up'` entry, before the closing `} as const`):

```ts
  mic: <>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </>,
  'mic-off': <>
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
    <path d="M5 10v2a7 7 0 0 0 12 5" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </>,
```

- [ ] **Step 2: Add translation keys to `lib/i18n.ts`**

Inside the `en` block, add after the last existing key:

```ts
    // Voice widget
    'voice.startAria': 'Start voice conversation',
    'voice.endAria': 'End voice conversation',
    'voice.muteAria': 'Mute microphone',
    'voice.unmuteAria': 'Unmute microphone',
    'voice.prevAria': 'Previous correction',
    'voice.nextAria': 'Next correction',
    'voice.focus': '{n} of {total}',
    'voice.micPermission': 'Microphone access needed. Check browser settings.',
    'voice.sessionEnded': 'Voice session ended',
    'voice.connecting': 'Connecting…',
    'voice.reconnecting': 'Reconnecting…',
```

Inside the `es` block, add the same keys translated:

```ts
    // Voice widget
    'voice.startAria': 'Iniciar conversación de voz',
    'voice.endAria': 'Finalizar conversación de voz',
    'voice.muteAria': 'Silenciar micrófono',
    'voice.unmuteAria': 'Activar micrófono',
    'voice.prevAria': 'Corrección anterior',
    'voice.nextAria': 'Siguiente corrección',
    'voice.focus': '{n} de {total}',
    'voice.micPermission': 'Se necesita acceso al micrófono. Revisá la configuración del navegador.',
    'voice.sessionEnded': 'Sesión de voz finalizada',
    'voice.connecting': 'Conectando…',
    'voice.reconnecting': 'Reconectando…',
```

- [ ] **Step 3: Run existing i18n tests to confirm nothing broke**

```bash
npm test -- __tests__/lib/i18n.test.ts
```

Expected: all passing

- [ ] **Step 4: Commit**

```bash
git add components/Icon.tsx lib/i18n.ts
git commit -m "feat(voice): add mic icons and voice widget i18n keys"
```

---

## Task 4: Create `lib/voice-agent.ts`

**Files:**
- Create: `lib/voice-agent.ts`
- Create: `__tests__/lib/voice-agent.test.ts`

### Types

```ts
export interface FocusedCorrection {
  original: string
  correction: string | null
  explanation: string
}

export type VoiceAgentState = 'connecting' | 'active' | 'reconnecting' | 'ended'

export interface VoiceAgentCallbacks {
  onStateChange: (state: VoiceAgentState) => void
  onError: (message: string) => void
}

export interface VoiceAgent {
  updateFocus: (correction: FocusedCorrection, allItems: FocusedCorrection[], targetLanguage: string) => void
  setMuted: (muted: boolean) => void
  disconnect: () => void
}
```

- [ ] **Step 1: Write failing tests for `buildSystemPrompt`**

```ts
// __tests__/lib/voice-agent.test.ts
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/voice-agent'
import type { FocusedCorrection } from '@/lib/voice-agent'

const items: FocusedCorrection[] = [
  { original: 'fui', correction: 'anduve', explanation: '"Andar" for movement through a space.' },
  { original: 'tengo calor', correction: 'hace calor', explanation: 'Impersonal weather expression.' },
]

describe('buildSystemPrompt', () => {
  it('includes Rioplatense instructions for es-AR', () => {
    const prompt = buildSystemPrompt('es-AR', items, items[0])
    expect(prompt).toContain('Rioplatense')
    expect(prompt).toContain('voseo')
    expect(prompt).toContain('Argentine Spanish')
  })

  it('includes Kiwi instructions for en-NZ', () => {
    const prompt = buildSystemPrompt('en-NZ', items, items[0])
    expect(prompt).toContain('New Zealand')
    expect(prompt).toContain('Kiwi')
  })

  it('lists up to 10 items', () => {
    const manyItems: FocusedCorrection[] = Array.from({ length: 15 }, (_, i) => ({
      original: `word${i}`,
      correction: `fix${i}`,
      explanation: `Reason ${i}.`,
    }))
    const prompt = buildSystemPrompt('es-AR', manyItems, manyItems[0])
    expect(prompt).toContain('word9')
    expect(prompt).not.toContain('word10')
  })

  it('highlights the focused correction', () => {
    const prompt = buildSystemPrompt('es-AR', items, items[1])
    expect(prompt).toContain('Currently discussing')
    expect(prompt).toContain('tengo calor')
    expect(prompt).toContain('hace calor')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/lib/voice-agent.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/voice-agent'`

- [ ] **Step 3: Implement `lib/voice-agent.ts`**

```ts
// lib/voice-agent.ts

export interface FocusedCorrection {
  original: string
  correction: string | null
  explanation: string
}

export type VoiceAgentState = 'connecting' | 'active' | 'reconnecting' | 'ended'

export interface VoiceAgentCallbacks {
  onStateChange: (state: VoiceAgentState) => void
  onError: (message: string) => void
}

export interface VoiceAgent {
  updateFocus: (correction: FocusedCorrection, allItems: FocusedCorrection[], targetLanguage: string) => void
  setMuted: (muted: boolean) => void
  disconnect: () => void
}

const WS_ENDPOINT = 'wss://agents.assemblyai.com/v1/ws'

/** Pure function — builds the system prompt injected on connect and on focus change. */
export function buildSystemPrompt(
  targetLanguage: string,
  items: FocusedCorrection[],
  focused: FocusedCorrection
): string {
  const isEsAR = targetLanguage === 'es-AR'

  const languageBlock = isEsAR
    ? `You are a Rioplatense Argentine Spanish coach.\nSpeak exclusively in Argentine Spanish with a Rioplatense accent.\nUse voseo verb forms and natural everyday Rioplatense vocabulary.`
    : `You are a New Zealand English coach.\nSpeak exclusively in New Zealand English with a Kiwi accent and idioms.`

  const itemList = items
    .slice(0, 10)
    .map((item, i) => `${i + 1}. "${item.original}" → "${item.correction ?? item.original}" — ${item.explanation}`)
    .join('\n')

  const region = isEsAR ? 'Argentine' : 'New Zealand'
  const register = isEsAR ? 'Rioplatense' : 'Kiwi'

  return `${languageBlock}

The user has these corrections to review:
${itemList}

Currently discussing: "${focused.original}" → "${focused.correction ?? focused.original}"
${focused.explanation}

Be conversational. Ask the user questions, give examples from everyday ${region} speech, and help them understand why the correction matters in natural ${register} usage.`
}

/**
 * Opens a real-time voice session with the AssemblyAI Voice Agent API.
 * Fetches a short-lived token from /api/voice-token, opens a WebSocket,
 * streams PCM16 mic audio, and plays back PCM16 agent audio.
 *
 * Returns a handle for mid-conversation updates, mute, and disconnect.
 */
export async function connect(
  targetLanguage: string,
  items: FocusedCorrection[],
  focused: FocusedCorrection,
  callbacks: VoiceAgentCallbacks
): Promise<VoiceAgent> {
  // 1. Mint a short-lived token from our server route.
  const tokenRes = await fetch('/api/voice-token')
  if (!tokenRes.ok) throw new Error('Failed to get voice token')
  const { token } = await tokenRes.json() as { token: string }

  // 2. Set up AudioContext at 24 kHz (avoids resampling) and mic stream.
  const audioCtx = new AudioContext({ sampleRate: 24000 })
  await audioCtx.audioWorklet.addModule('/pcm-processor.js')

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, sampleRate: 24000 },
  })
  const [audioTrack] = stream.getAudioTracks()

  const source = audioCtx.createMediaStreamSource(stream)
  const worklet = new AudioWorkletNode(audioCtx, 'pcm-processor')
  source.connect(worklet)
  // Connect worklet to destination so AudioContext stays alive (no audible output
  // from the mic path — the worklet captures only, not plays back).
  worklet.connect(audioCtx.destination)

  // 3. Open WebSocket.
  const wsUrl = new URL(WS_ENDPOINT)
  wsUrl.searchParams.set('token', token)
  const ws = new WebSocket(wsUrl.toString())
  ws.binaryType = 'arraybuffer'

  let ready = false
  let playbackTime = audioCtx.currentTime

  // Stream mic audio once the session is ready.
  worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (!ready || ws.readyState !== WebSocket.OPEN) return
    const bytes = new Uint8Array(e.data)
    const b64 = btoa(String.fromCharCode(...bytes))
    ws.send(JSON.stringify({ type: 'input.audio', audio: b64 }))
  }

  ws.addEventListener('open', () => {
    callbacks.onStateChange('connecting')
    ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        system_prompt: buildSystemPrompt(targetLanguage, items, focused),
        output: { voice: 'ivy' },
      },
    }))
  })

  ws.addEventListener('message', (event: MessageEvent) => {
    const msg = JSON.parse(event.data as string) as Record<string, unknown>

    if (msg.type === 'session.ready') {
      ready = true
      callbacks.onStateChange('active')
    } else if (msg.type === 'reply.audio') {
      // Decode base64 PCM16 and schedule playback.
      const raw = atob(msg.data as string)
      const pcm16 = new Int16Array(raw.length / 2)
      for (let i = 0; i < pcm16.length; i++) {
        pcm16[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)
      }
      const float32 = new Float32Array(pcm16.length)
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768
      }
      const buffer = audioCtx.createBuffer(1, float32.length, 24000)
      buffer.getChannelData(0).set(float32)
      const src = audioCtx.createBufferSource()
      src.buffer = buffer
      src.connect(audioCtx.destination)
      const now = audioCtx.currentTime
      playbackTime = Math.max(playbackTime, now)
      src.start(playbackTime)
      playbackTime += buffer.duration
    } else if (msg.type === 'reply.done' && msg.status === 'interrupted') {
      playbackTime = audioCtx.currentTime
    } else if (msg.type === 'session.error' || msg.type === 'error') {
      callbacks.onError((msg.message ?? 'Voice session error') as string)
    }
  })

  ws.addEventListener('close', () => {
    ready = false
    callbacks.onStateChange('ended')
    audioCtx.close()
    stream.getTracks().forEach(t => t.stop())
  })

  ws.addEventListener('error', () => {
    callbacks.onError('Connection error')
  })

  // 4. Return the agent handle.
  return {
    updateFocus(correction, allItems, lang) {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          system_prompt: buildSystemPrompt(lang, allItems, correction),
        },
      }))
    },
    setMuted(muted) {
      audioTrack.enabled = !muted
    },
    disconnect() {
      ws.close()
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/lib/voice-agent.test.ts
```

Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add lib/voice-agent.ts __tests__/lib/voice-agent.test.ts
git commit -m "feat(voice): add voice-agent WebSocket wrapper and system prompt builder"
```

---

## Task 5: Create `components/VoiceWidget.tsx`

**Files:**
- Create: `components/VoiceWidget.tsx`
- Create: `__tests__/components/VoiceWidget.test.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
// __tests__/components/VoiceWidget.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VoiceWidget } from '@/components/VoiceWidget'
import { LanguageProvider } from '@/components/LanguageProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import type { PracticeItem } from '@/lib/types'

vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(),
  buildSystemPrompt: vi.fn(() => 'mocked prompt'),
}))

vi.mock('@/components/Toast', () => ({
  Toast: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}))

const mockConnect = (await import('@/lib/voice-agent')).connect as ReturnType<typeof vi.fn>

function makeItem(overrides: Partial<PracticeItem> = {}): PracticeItem {
  return {
    id: 'item-1',
    session_id: 'sess-1',
    annotation_id: 'ann-1',
    type: 'grammar',
    original: 'fui',
    correction: 'anduve',
    explanation: '"Andar" for movement through a space.',
    sub_category: 'verb-conjugation',
    reviewed: false,
    written_down: false,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    flashcard_front: null,
    flashcard_back: null,
    flashcard_note: null,
    importance_score: 3,
    importance_note: null,
    segment_text: null,
    start_char: null,
    end_char: null,
    session_title: 'Test session',
    ...overrides,
  }
}

function wrap(items: PracticeItem[] = [makeItem()]) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <ThemeProvider>
        <VoiceWidget initialItems={items} />
      </ThemeProvider>
    </LanguageProvider>
  )
}

describe('VoiceWidget', () => {
  beforeEach(() => vi.resetAllMocks())

  it('renders nothing when there are no unwritten items', () => {
    const { container } = wrap([])
    expect(container.firstChild).toBeNull()
  })

  it('renders the idle mic bubble when items exist', () => {
    wrap()
    expect(screen.getByRole('button', { name: /start voice conversation/i })).toBeInTheDocument()
  })

  it('calls connect when the mic button is tapped', async () => {
    mockConnect.mockResolvedValue({
      updateFocus: vi.fn(),
      setMuted: vi.fn(),
      disconnect: vi.fn(),
    })
    wrap()
    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce())
  })

  it('shows expanded controls when session is active', async () => {
    let capturedCallbacks: Parameters<typeof mockConnect>[3]
    mockConnect.mockImplementation((_lang, _items, _focused, callbacks) => {
      capturedCallbacks = callbacks
      return Promise.resolve({
        updateFocus: vi.fn(),
        setMuted: vi.fn(),
        disconnect: vi.fn(),
      })
    })

    wrap()
    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))

    await waitFor(() => {
      capturedCallbacks!.onStateChange('active')
    })

    expect(screen.getByRole('button', { name: /end voice conversation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument()
  })

  it('calls updateFocus when next is tapped with two items', async () => {
    const updateFocus = vi.fn()
    let capturedCallbacks: Parameters<typeof mockConnect>[3]
    mockConnect.mockImplementation((_lang, _items, _focused, callbacks) => {
      capturedCallbacks = callbacks
      return Promise.resolve({ updateFocus, setMuted: vi.fn(), disconnect: vi.fn() })
    })

    const items = [makeItem({ id: 'item-1' }), makeItem({ id: 'item-2', original: 'tengo calor', correction: 'hace calor' })]
    wrap(items)
    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))
    await waitFor(() => { capturedCallbacks!.onStateChange('active') })

    fireEvent.click(screen.getByRole('button', { name: /next correction/i }))
    expect(updateFocus).toHaveBeenCalledWith(
      expect.objectContaining({ original: 'tengo calor' }),
      expect.any(Array),
      'es-AR'
    )
  })

  it('calls setMuted when mute button is tapped', async () => {
    const setMuted = vi.fn()
    let capturedCallbacks: Parameters<typeof mockConnect>[3]
    mockConnect.mockImplementation((_lang, _items, _focused, callbacks) => {
      capturedCallbacks = callbacks
      return Promise.resolve({ updateFocus: vi.fn(), setMuted, disconnect: vi.fn() })
    })

    wrap()
    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))
    await waitFor(() => { capturedCallbacks!.onStateChange('active') })

    fireEvent.click(screen.getByRole('button', { name: /mute microphone/i }))
    expect(setMuted).toHaveBeenCalledWith(true)
  })

  it('calls disconnect and collapses when end is tapped', async () => {
    const disconnect = vi.fn()
    let capturedCallbacks: Parameters<typeof mockConnect>[3]
    mockConnect.mockImplementation((_lang, _items, _focused, callbacks) => {
      capturedCallbacks = callbacks
      return Promise.resolve({ updateFocus: vi.fn(), setMuted: vi.fn(), disconnect })
    })

    wrap()
    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))
    await waitFor(() => { capturedCallbacks!.onStateChange('active') })

    fireEvent.click(screen.getByRole('button', { name: /end voice conversation/i }))
    expect(disconnect).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/components/VoiceWidget.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/VoiceWidget'`

- [ ] **Step 3: Implement `components/VoiceWidget.tsx`**

```tsx
// components/VoiceWidget.tsx
'use client'
import { useState, useRef, useCallback } from 'react'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'
import { useTranslation } from '@/components/LanguageProvider'
import { connect } from '@/lib/voice-agent'
import type { VoiceAgent, VoiceAgentState, FocusedCorrection } from '@/lib/voice-agent'
import type { PracticeItem } from '@/lib/types'

interface Props {
  /** Unwritten practice items. Widget hides entirely when empty. */
  initialItems: PracticeItem[]
}

type WidgetState = 'idle' | 'connecting' | 'active' | 'muted' | 'reconnecting'

function toFocusedCorrection(item: PracticeItem): FocusedCorrection {
  return {
    original: item.original,
    correction: item.correction,
    explanation: item.explanation,
  }
}

export function VoiceWidget({ initialItems }: Props) {
  const { t, targetLanguage } = useTranslation()
  const [widgetState, setWidgetState] = useState<WidgetState>('idle')
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const agentRef = useRef<VoiceAgent | null>(null)
  const toastKeyRef = useRef(0)

  const items = initialItems
  const focusedItem = items[focusedIndex] ?? items[0]

  const showToast = useCallback((message: string) => {
    toastKeyRef.current += 1
    setToast(message)
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handleStart = useCallback(async () => {
    if (widgetState !== 'idle' || !focusedItem) return
    setWidgetState('connecting')

    try {
      const agent = await connect(
        targetLanguage,
        items.map(toFocusedCorrection),
        toFocusedCorrection(focusedItem),
        {
          onStateChange: (state: VoiceAgentState) => {
            if (state === 'active') setWidgetState('active')
            else if (state === 'reconnecting') setWidgetState('reconnecting')
            else if (state === 'ended') {
              setWidgetState('idle')
              agentRef.current = null
            }
          },
          onError: (message: string) => {
            setWidgetState('idle')
            agentRef.current = null
            if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
              showToast(t('voice.micPermission'))
            } else {
              showToast(t('voice.sessionEnded'))
            }
          },
        }
      )
      agentRef.current = agent
    } catch {
      setWidgetState('idle')
      showToast(t('voice.micPermission'))
    }
  }, [widgetState, focusedItem, items, targetLanguage, t, showToast])

  const handleEnd = useCallback(() => {
    agentRef.current?.disconnect()
    agentRef.current = null
    setWidgetState('idle')
  }, [])

  const handleMute = useCallback(() => {
    if (!agentRef.current) return
    if (widgetState === 'muted') {
      agentRef.current.setMuted(false)
      setWidgetState('active')
    } else {
      agentRef.current.setMuted(true)
      setWidgetState('muted')
    }
  }, [widgetState])

  const handlePrev = useCallback(() => {
    if (!agentRef.current || focusedIndex === 0) return
    const nextIndex = focusedIndex - 1
    setFocusedIndex(nextIndex)
    const nextItem = items[nextIndex]
    if (nextItem) {
      agentRef.current.updateFocus(
        toFocusedCorrection(nextItem),
        items.map(toFocusedCorrection),
        targetLanguage
      )
    }
  }, [focusedIndex, items, targetLanguage])

  const handleNext = useCallback(() => {
    if (!agentRef.current || focusedIndex === items.length - 1) return
    const nextIndex = focusedIndex + 1
    setFocusedIndex(nextIndex)
    const nextItem = items[nextIndex]
    if (nextItem) {
      agentRef.current.updateFocus(
        toFocusedCorrection(nextItem),
        items.map(toFocusedCorrection),
        targetLanguage
      )
    }
  }, [focusedIndex, items, targetLanguage])

  // Hide entirely when nothing to discuss.
  if (items.length === 0) return null

  const isActive = widgetState === 'active' || widgetState === 'muted' || widgetState === 'reconnecting'
  const isMuted = widgetState === 'muted'
  const isConnecting = widgetState === 'connecting'

  return (
    <>
      {/* Idle: floating mic bubble, bottom-left above bottom nav */}
      {!isActive && !isConnecting && (
        <button
          type="button"
          onClick={handleStart}
          aria-label={t('voice.startAria')}
          className="
            fixed left-4 z-40
            w-12 h-12 rounded-full
            bg-accent-primary text-white shadow-lg
            flex items-center justify-content:center
            hover:bg-accent-primary-hover active:scale-95
            transition-transform
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 12px)' }}
        >
          <span className="m-auto">
            <Icon name="mic" className="w-5 h-5" />
          </span>
        </button>
      )}

      {/* Connecting spinner in same position */}
      {isConnecting && (
        <div
          className="fixed left-4 z-40 w-12 h-12 rounded-full bg-accent-primary text-white shadow-lg flex items-center justify-center"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 12px)' }}
          aria-label={t('voice.connecting')}
        >
          <Icon name="spinner" className="w-5 h-5" />
        </div>
      )}

      {/* Active: context label + control pill, centred above bottom nav */}
      {isActive && focusedItem && (
        <div
          className="fixed left-0 right-0 z-40 flex flex-col items-center gap-2 px-3"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom) + 10px)' }}
        >
          {/* Context label */}
          <div className="bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-xs text-text-secondary max-w-xs truncate">
            <span className="text-accent-primary font-medium mr-2 tabular-nums">
              {t('voice.focus', { n: focusedIndex + 1, total: items.length })}
            </span>
            <s className="text-status-error">{focusedItem.original}</s>
            <span className="mx-1 text-text-tertiary">→</span>
            <span className="text-text-primary">{focusedItem.correction ?? focusedItem.original}</span>
          </div>

          {/* Control pill */}
          <div className="
            bg-[rgba(15,23,42,0.88)] backdrop-blur-md
            border border-white/10 rounded-full
            px-5 py-2.5
            flex items-center gap-5
            shadow-xl
          ">
            {/* Prev */}
            <button
              type="button"
              onClick={handlePrev}
              disabled={focusedIndex === 0}
              aria-label={t('voice.prevAria')}
              className="text-white/70 hover:text-white disabled:opacity-30 transition-opacity"
            >
              <Icon name="chevron-left" className="w-5 h-5" />
            </button>

            {/* Next */}
            <button
              type="button"
              onClick={handleNext}
              disabled={focusedIndex === items.length - 1}
              aria-label={t('voice.nextAria')}
              className="text-white/70 hover:text-white disabled:opacity-30 transition-opacity"
            >
              <Icon name="chevron-right" className="w-5 h-5" />
            </button>

            {/* Mic / active indicator (larger, centred) */}
            <div
              className={`
                w-11 h-11 rounded-full flex items-center justify-center shadow-md
                ${isMuted ? 'bg-red-500 shadow-red-500/25' : 'bg-accent-primary shadow-accent-primary/25'}
              `}
            >
              <Icon name={isMuted ? 'mic-off' : 'mic'} className="w-5 h-5 text-white" />
            </div>

            {/* Mute toggle */}
            <button
              type="button"
              onClick={handleMute}
              aria-label={isMuted ? t('voice.unmuteAria') : t('voice.muteAria')}
              aria-pressed={isMuted}
              className="text-white/70 hover:text-white transition-opacity"
            >
              <Icon name={isMuted ? 'mic' : 'mic-off'} className="w-5 h-5" />
            </button>

            {/* End */}
            <button
              type="button"
              onClick={handleEnd}
              aria-label={t('voice.endAria')}
              className="text-white/70 hover:text-white transition-opacity"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} toastKey={toastKeyRef.current} />}
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/components/VoiceWidget.test.tsx
```

Expected: 7 passing

- [ ] **Step 5: Commit**

```bash
git add components/VoiceWidget.tsx __tests__/components/VoiceWidget.test.tsx
git commit -m "feat(voice): add VoiceWidget component with idle/active/muted states"
```

---

## Task 6: Wire VoiceWidget into ConditionalNav

**Files:**
- Modify: `components/ConditionalNav.tsx`
- Modify: `__tests__/components/ConditionalNav.test.tsx`

- [ ] **Step 1: Update ConditionalNav to render VoiceWidget**

Replace the contents of `components/ConditionalNav.tsx` with:

```tsx
// components/ConditionalNav.tsx
'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { NavDrawer } from '@/components/NavDrawer'
import { BottomNav } from '@/components/BottomNav'
import { VoiceWidget } from '@/components/VoiceWidget'
import type { PracticeItem } from '@/lib/types'

const HIDDEN_ON = ['/login', '/access-denied', '/onboarding', '/auth']

export function ConditionalNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [voiceItems, setVoiceItems] = useState<PracticeItem[]>([])

  // Fetch unwritten practice items for the voice widget once on mount.
  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.ok ? r.json() : [])
      .then((items: PracticeItem[]) => {
        setVoiceItems(items.filter(i => !i.written_down))
      })
      .catch(() => {/* widget stays hidden */})
  }, [])

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  return (
    <>
      <AppHeader isOpen={isOpen} onOpen={() => setIsOpen(true)} />
      <NavDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <BottomNav />
      <VoiceWidget initialItems={voiceItems} />
    </>
  )
}
```

- [ ] **Step 2: Add a test asserting the widget renders on protected routes**

In `__tests__/components/ConditionalNav.test.tsx`, add the following mocks at the top (alongside the existing mocks):

```ts
vi.mock('@/components/VoiceWidget', () => ({
  VoiceWidget: ({ initialItems }: { initialItems: unknown[] }) => (
    initialItems.length > 0 ? <div data-testid="voice-widget" /> : null
  ),
}))
```

Then add this test to the existing `describe` block:

```ts
  it('renders VoiceWidget on "/"', async () => {
    mockPathname.mockReturnValue('/')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'p1', written_down: false, original: 'fui', correction: 'anduve' },
      ]),
    })
    wrap()
    await waitFor(() => {
      expect(screen.getByTestId('voice-widget')).toBeInTheDocument()
    })
  })
```

Add `waitFor` to the import at the top of the test file:
```ts
import { render, screen, waitFor } from '@testing-library/react'
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test -- __tests__/components/ConditionalNav.test.tsx
```

Expected: all passing (including the new test)

- [ ] **Step 4: Run all tests to confirm nothing is broken**

```bash
npm test
```

Expected: all passing

- [ ] **Step 5: Commit**

```bash
git add components/ConditionalNav.tsx __tests__/components/ConditionalNav.test.tsx
git commit -m "feat(voice): wire VoiceWidget into ConditionalNav"
```

---

## Self-Review Notes

- `buildSystemPrompt` is a pure exported function — fully unit-testable without mocks
- `voice-agent.ts` browser APIs (AudioContext, getUserMedia, WebSocket) are only exercised in the real browser; unit tests cover the pure logic only and the component tests mock the module entirely
- `VoiceWidget` receives `initialItems` as a prop — makes it testable without a live API fetch
- `ConditionalNav` fetches items client-side on mount; this is a best-effort fetch (error swallowed) so the widget simply stays hidden on failure — no error surface needed
- The `session.update` mid-conversation update is used for focus switching based on AssemblyAI's documented protocol; if the API changes this message type, only `lib/voice-agent.ts` needs updating
