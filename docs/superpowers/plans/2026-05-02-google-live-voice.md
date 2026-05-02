# Google Live Voice Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AssemblyAI voice agent with the Gemini Multimodal Live API in a new branch, keeping the `VoiceAgent` interface and `VoiceWidget.tsx` unchanged.

**Architecture:** In-place rewrite of `lib/voice-agent.ts` — same exports, Gemini Live WebSocket under the hood. `/api/voice-token` returns `GOOGLE_API_KEY` directly (auth-gated) instead of minting an AssemblyAI short-lived token. Audio input drops from 24 kHz to 16 kHz; output stays at 24 kHz. `updateFocus` injects a text user-turn instead of `session.update`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Gemini Multimodal Live API (`gemini-3.1-flash-live-preview`), Web Audio API (PCM16), Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/voice-agent.ts` | Rewrite | Gemini Live WebSocket, same `VoiceAgent` interface + exports |
| `app/api/voice-token/route.ts` | Modify | Return `GOOGLE_API_KEY` instead of minting AssemblyAI token |
| `.env.local.example` | Modify | Add `GOOGLE_API_KEY`, `NEXT_PUBLIC_GOOGLE_VOICE` |
| `__tests__/api/voice-token.test.ts` | Modify | Update expectations for Google key response |
| `__tests__/lib/voice-agent.test.ts` | Modify | Add `buildFocusUpdateMessage` tests; existing `buildSystemPrompt` tests are unchanged |

---

## Task 1: Create the comparison branch

- [ ] **Step 1: Verify you are on `feat/voice-widget`**

```bash
git branch --show-current
```

Expected output: `feat/voice-widget`

- [ ] **Step 2: Create and switch to the new branch**

```bash
git checkout -b feat/google-live-voice
```

Expected output: `Switched to a new branch 'feat/google-live-voice'`

- [ ] **Step 3: Commit the empty branch marker**

```bash
git commit --allow-empty -m "chore: start google live voice comparison branch"
```

---

## Task 2: Update `/api/voice-token` — tests first

The route currently mints a short-lived token from AssemblyAI. Replace it to return `GOOGLE_API_KEY` directly (behind auth). No outbound fetch needed.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `__tests__/api/voice-token.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

import { GET } from '@/app/api/voice-token/route'
import { getAuthenticatedUser } from '@/lib/auth'

const mockGetUser = getAuthenticatedUser as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  process.env.GOOGLE_API_KEY = 'test-google-key'
})

describe('GET /api/voice-token', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns the Google API key as token when authenticated', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBe('test-google-key')
  })

  it('returns 500 when GOOGLE_API_KEY is not set', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    delete process.env.GOOGLE_API_KEY
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/api/voice-token.test.ts
```

Expected: 2 of 3 tests fail — the "returns the Google API key" test because the route still calls AssemblyAI, and "returns 500 when GOOGLE_API_KEY is not set" because the env var name is wrong.

- [ ] **Step 3: Rewrite the route**

Replace the entire contents of `app/api/voice-token/route.ts`:

```typescript
// app/api/voice-token/route.ts
import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { log } from '@/lib/logger'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    log.error('GOOGLE_API_KEY is not set')
    return NextResponse.json({ error: 'Token fetch failed' }, { status: 500 })
  }

  return NextResponse.json({ token: apiKey })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/api/voice-token.test.ts
```

Expected: all 3 pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/voice-token/route.ts __tests__/api/voice-token.test.ts
git commit -m "feat(voice): voice-token route returns Google API key"
```

---

## Task 3: Add `buildFocusUpdateMessage` — tests first

`buildFocusUpdateMessage` is a pure function that returns the text string injected as a user-turn when the user navigates between corrections mid-session. It lives in `lib/voice-agent.ts` alongside `buildSystemPrompt`.

- [ ] **Step 1: Write the failing tests**

Add the following describe block to `__tests__/lib/voice-agent.test.ts`, after the existing `buildSystemPrompt` describe block:

```typescript
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildFocusUpdateMessage } from '@/lib/voice-agent'
import type { FocusedCorrection } from '@/lib/voice-agent'
```

> Update the import line at the top of the file to add `buildFocusUpdateMessage`. Then add this block at the end of the file:

```typescript
describe('buildFocusUpdateMessage', () => {
  it('contains the original and correction', () => {
    const msg = buildFocusUpdateMessage({
      original: 'fui',
      correction: 'anduve',
      explanation: '"Andar" for movement through a space.',
    })
    expect(msg).toContain('fui')
    expect(msg).toContain('anduve')
  })

  it('falls back to original when correction is null', () => {
    const msg = buildFocusUpdateMessage({
      original: 'fui',
      correction: null,
      explanation: 'test',
    })
    expect(msg).toContain('fui')
    expect(msg).not.toContain('null')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/lib/voice-agent.test.ts
```

Expected: 2 new tests fail with "buildFocusUpdateMessage is not a function".

- [ ] **Step 3: Add `buildFocusUpdateMessage` to `lib/voice-agent.ts`**

Add this export directly after `buildSystemPrompt` in `lib/voice-agent.ts` (do not change any other code yet):

```typescript
/** Returns the text injected as a user-turn when focus changes mid-session. */
export function buildFocusUpdateMessage(focused: FocusedCorrection): string {
  return `Now let's focus on: "${focused.original}" → "${focused.correction ?? focused.original}"`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/lib/voice-agent.test.ts
```

Expected: all 6 tests pass (4 existing `buildSystemPrompt` + 2 new).

- [ ] **Step 5: Commit**

```bash
git add lib/voice-agent.ts __tests__/lib/voice-agent.test.ts
git commit -m "feat(voice): add buildFocusUpdateMessage for Gemini focus updates"
```

---

## Task 4: Rewrite `connect()` for Gemini Live

Replace the `connect` function and the `WS_ENDPOINT` constant. `buildSystemPrompt` and `buildFocusUpdateMessage` stay exactly as they are.

> The `connect` function uses browser APIs (`AudioContext`, `WebSocket`, `navigator.mediaDevices`) that cannot be unit-tested. Manual smoke testing covers it — see Task 6.

- [ ] **Step 1: Replace `WS_ENDPOINT` and `connect` in `lib/voice-agent.ts`**

The final `lib/voice-agent.ts` should look exactly like this:

```typescript
// lib/voice-agent.ts

import type { TargetLanguage } from '@/lib/types'

export interface FocusedCorrection {
  original: string
  correction: string | null
  explanation: string
}

export type VoiceAgentState = 'connecting' | 'active' | 'ended'

export interface VoiceAgentCallbacks {
  onStateChange: (state: VoiceAgentState) => void
  onError: (message: string) => void
}

export interface VoiceAgent {
  updateFocus: (correction: FocusedCorrection, allItems: FocusedCorrection[], targetLanguage: TargetLanguage) => void
  setMuted: (muted: boolean) => void
  disconnect: () => void
}

const WS_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'

const DEFAULT_VOICE = 'Aoede'

/** Pure function — builds the system prompt injected on connect. Unchanged from AssemblyAI version. */
export function buildSystemPrompt(
  targetLanguage: TargetLanguage,
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

Be brief and direct. State the key point in one or two sentences, then stop and wait for the user to respond. Only elaborate if the user asks. Do not volunteer extra examples or tangents unprompted.`
}

/** Returns the text injected as a user-turn when focus changes mid-session. */
export function buildFocusUpdateMessage(focused: FocusedCorrection): string {
  return `Now let's focus on: "${focused.original}" → "${focused.correction ?? focused.original}"`
}

/**
 * Opens a real-time voice session with the Gemini Multimodal Live API.
 * Fetches the Google API key from /api/voice-token, opens a WebSocket,
 * streams PCM16 mic audio at 16 kHz, and plays back PCM16 agent audio at 24 kHz.
 *
 * Returns a handle for mid-conversation updates, mute, and disconnect.
 */
export async function connect(
  targetLanguage: TargetLanguage,
  items: FocusedCorrection[],
  focused: FocusedCorrection,
  callbacks: VoiceAgentCallbacks
): Promise<VoiceAgent> {
  // 1. Get Google API key from our auth-gated server route.
  const tokenRes = await fetch('/api/voice-token')
  if (!tokenRes.ok) throw new Error('Failed to get voice token')
  const { token } = (await tokenRes.json()) as { token: string }

  // 2. Set up AudioContext at 16 kHz (Gemini Live input requirement) and mic stream.
  let audioCtx: AudioContext | undefined
  let stream: MediaStream | undefined

  try {
    audioCtx = new AudioContext({ sampleRate: 16000 })
    await audioCtx.audioWorklet.addModule('/pcm-processor.js')
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, sampleRate: 16000 },
    })
  } catch (err) {
    stream?.getTracks().forEach(t => t.stop())
    await audioCtx?.close()
    throw err
  }

  const safeCtx = audioCtx as AudioContext
  const safeStream = stream as MediaStream
  const [audioTrack] = safeStream.getAudioTracks()

  const source = safeCtx.createMediaStreamSource(safeStream)
  const worklet = new AudioWorkletNode(safeCtx, 'pcm-processor')
  source.connect(worklet)
  // Connect to destination to keep AudioContext active in background tabs.
  worklet.connect(safeCtx.destination)

  // 3. Open WebSocket — API key in query param.
  const wsUrl = new URL(WS_ENDPOINT)
  wsUrl.searchParams.set('key', token)
  const ws = new WebSocket(wsUrl.toString())
  ws.binaryType = 'arraybuffer'

  let ready = false
  let playbackTime = safeCtx.currentTime
  const voiceName = process.env.NEXT_PUBLIC_GOOGLE_VOICE ?? DEFAULT_VOICE

  // Stream mic audio once the session is ready.
  worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (!ready || ws.readyState !== WebSocket.OPEN) return
    const bytes = new Uint8Array(e.data)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const b64 = btoa(binary)
    ws.send(
      JSON.stringify({
        realtime_input: {
          media_chunks: [{ mime_type: 'audio/pcm;rate=16000', data: b64 }],
        },
      })
    )
  }

  ws.addEventListener('open', () => {
    callbacks.onStateChange('connecting')
    ws.send(
      JSON.stringify({
        setup: {
          model: 'models/gemini-3.1-flash-live-preview',
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
          systemInstruction: {
            parts: [{ text: buildSystemPrompt(targetLanguage, items, focused) }],
          },
        },
      })
    )
  })

  ws.addEventListener('message', (event: MessageEvent) => {
    const msg = JSON.parse(event.data as string) as Record<string, unknown>

    if ('setupComplete' in msg) {
      ready = true
      callbacks.onStateChange('active')
      return
    }

    const serverContent = (msg as { serverContent?: {
      interrupted?: boolean
      modelTurn?: { parts: Array<{ inlineData?: { mimeType: string; data: string } }> }
    } }).serverContent

    if (serverContent?.interrupted) {
      playbackTime = safeCtx.currentTime
      return
    }

    if (serverContent?.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (!part.inlineData?.data) continue
        // Decode base64 PCM16 and schedule playback at 24 kHz.
        const raw = atob(part.inlineData.data)
        const pcm16 = new Int16Array(raw.length / 2)
        for (let i = 0; i < pcm16.length; i++) {
          pcm16[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)
        }
        const float32 = new Float32Array(pcm16.length)
        for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768
        const buffer = safeCtx.createBuffer(1, float32.length, 24000)
        buffer.getChannelData(0).set(float32)
        const src = safeCtx.createBufferSource()
        src.buffer = buffer
        src.connect(safeCtx.destination)
        const now = safeCtx.currentTime
        playbackTime = Math.max(playbackTime, now)
        src.start(playbackTime)
        playbackTime += buffer.duration
      }
    }

    const error = (msg as { error?: { message?: string } }).error
    if (error) {
      callbacks.onError(error.message ?? 'Voice session error')
    }
  })

  ws.addEventListener('close', () => {
    ready = false
    callbacks.onStateChange('ended')
    safeCtx.close()
    safeStream.getTracks().forEach(t => t.stop())
  })

  ws.addEventListener('error', () => {
    callbacks.onError('Connection error')
  })

  // 4. Return the agent handle.
  return {
    updateFocus(correction) {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(
        JSON.stringify({
          clientContent: {
            turns: [
              {
                role: 'user',
                parts: [{ text: buildFocusUpdateMessage(correction) }],
              },
            ],
            turnComplete: true,
          },
        })
      )
    },
    setMuted(muted) {
      audioTrack.enabled = !muted
    },
    disconnect() {
      if (ws.readyState !== WebSocket.CLOSED) ws.close()
    },
  }
}
```

- [ ] **Step 2: Run the full test suite to confirm nothing regressed**

```bash
npm test -- __tests__/lib/voice-agent.test.ts __tests__/api/voice-token.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/voice-agent.ts
git commit -m "feat(voice): rewrite connect() for Gemini Multimodal Live API"
```

---

## Task 5: Update environment variable template

- [ ] **Step 1: Add Google keys to `.env.local.example`**

Add the following block after the `ASSEMBLYAI_API_KEY=` line:

```env
GOOGLE_API_KEY=
# Optional: Gemini Live prebuilt voice name (default: Aoede). See AI Studio for available voices.
NEXT_PUBLIC_GOOGLE_VOICE=Aoede
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "chore: add GOOGLE_API_KEY and NEXT_PUBLIC_GOOGLE_VOICE to env template"
```

---

## Task 6: Manual smoke test checklist

No automated test can cover the full WebSocket session. Run these manually with `GOOGLE_API_KEY` set in `.env.local`.

- [ ] Add `GOOGLE_API_KEY` to your local `.env.local`
- [ ] Run `npm run dev`
- [ ] Navigate to `/write` — confirm VoiceWidget mic bubble appears (requires at least one unwritten practice item)
- [ ] Tap the mic — confirm widget transitions: idle → connecting → active
- [ ] Speak in Spanish — confirm the agent responds in Argentine Spanish (voseo, Rioplatense register)
- [ ] Navigate prev/next between corrections — confirm agent acknowledges the new item naturally
- [ ] Tap mute — confirm mic indicator changes; agent stops receiving audio
- [ ] Tap unmute — confirm agent resumes
- [ ] Tap end (×) — confirm widget returns to idle, no audio leaks
- [ ] Test error path: disconnect network mid-session — confirm toast appears, widget returns to idle
- [ ] Set `NEXT_PUBLIC_GOOGLE_VOICE=Charon` in `.env.local`, restart, repeat — confirm different voice timbre

---

## Comparison Notes (fill in during testing)

| Criterion | AssemblyAI (`feat/voice-widget`) | Google Live (`feat/google-live-voice`) |
|-----------|----------------------------------|----------------------------------------|
| Argentine Spanish naturalness | | |
| Rioplatense register (voseo) | | |
| NZ English naturalness | | |
| Perceived latency | | |
| Focus switch quality | | |
| Error recovery | | |

When Google Live wins: squash-merge `feat/google-live-voice` into `feat/voice-widget`, delete the comparison branch.
