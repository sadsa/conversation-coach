// lib/voice-agent.ts

import type { TargetLanguage } from '@/lib/types'

export interface FocusedCorrection {
  original: string
  correction: string | null
  explanation: string
}

export type VoiceRouteContext =
  | { kind: 'write' }
  | { kind: 'session'; sessionTitle: string }
  | { kind: 'other' }

export type VoiceAgentState = 'connecting' | 'active' | 'ended'

export interface VoiceAgentCallbacks {
  onStateChange: (state: VoiceAgentState) => void
  onError: (message: string) => void
  /** Mic-side RMS (0..1) per outgoing audio frame. Optional — for "you are speaking" indicator. */
  onUserAudio?: (rms: number) => void
  /** Agent-side RMS (0..1) emitted at the moment the chunk actually plays. Optional — for "agent is speaking" indicator. */
  onAgentAudio?: (rms: number) => void
}

/** Compute normalised RMS (0..1) over a PCM16 sample buffer. */
function pcm16Rms(samples: Int16Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] / 32768
    sum += s * s
  }
  return Math.sqrt(sum / samples.length)
}

/**
 * Plays a short two-note "ready to listen" chime through the existing
 * AudioContext. C5 → G5 (perfect fifth rising), sine, ~180ms total. Calm and
 * encouraging — meant to land at the moment the user can start speaking, not
 * to feel like a notification.
 *
 * Synthesised on the fly so we ship no audio asset. Each note has a smooth
 * attack/release envelope to avoid the click that bare `start`/`stop` cause.
 */
function playStartTone(ctx: AudioContext) {
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = 0.18
  master.connect(ctx.destination)

  function note(freq: number, startOffset: number, duration: number) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const gain = ctx.createGain()
    const start = now + startOffset
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(1, start + 0.014)
    gain.gain.linearRampToValueAtTime(0, start + duration)
    osc.connect(gain)
    gain.connect(master)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  note(523.25, 0, 0.1)     // C5
  note(783.99, 0.06, 0.14)  // G5
}

export interface VoiceAgent {
  setMuted: (muted: boolean) => void
  disconnect: () => void
}

const WS_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'

const DEFAULT_VOICE = 'Aoede'

/** Pure function — builds the system prompt injected on connect. */
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

  // Track every scheduled agent audio source so we can hard-stop playback
  // when the user changes focus mid-response (otherwise the new turn's audio
  // overlaps the tail of the old one). Sources self-remove on `ended`.
  const activeAgentSources = new Set<AudioBufferSourceNode>()

  function stopAgentPlayback() {
    activeAgentSources.forEach(src => {
      try { src.stop() } catch { /* already stopped — fine */ }
    })
    activeAgentSources.clear()
    playbackTime = safeCtx.currentTime
    // Snap the indicator back to silence so the UI doesn't keep pulsing
    // green for a beat after we cut the audio.
    callbacks.onAgentAudio?.(0)
  }

  // Decode + schedule a PCM16 chunk from the agent at 24 kHz, and emit RMS
  // at the moment that chunk actually starts playing (so the indicator is in
  // sync with what the user hears, not when the bytes arrived).
  function scheduleAgentPcm(pcm16: Int16Array) {
    const float32 = new Float32Array(pcm16.length)
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768
    const buffer = safeCtx.createBuffer(1, float32.length, 24000)
    buffer.getChannelData(0).set(float32)
    const src = safeCtx.createBufferSource()
    src.buffer = buffer
    src.connect(safeCtx.destination)
    src.onended = () => { activeAgentSources.delete(src) }
    const now = safeCtx.currentTime
    playbackTime = Math.max(playbackTime, now)
    const startAt = playbackTime
    activeAgentSources.add(src)
    src.start(startAt)
    playbackTime += buffer.duration

    if (callbacks.onAgentAudio) {
      const rms = pcm16Rms(pcm16)
      const delayMs = Math.max(0, (startAt - now) * 1000)
      // Pulse on at playback start, decay back to silence after the chunk ends.
      // The widget's own decay loop smooths the trailing edge.
      window.setTimeout(() => callbacks.onAgentAudio?.(rms), delayMs)
    }
  }

  // Stream mic audio once the session is ready.
  worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (!ready || ws.readyState !== WebSocket.OPEN) return
    const bytes = new Uint8Array(e.data)
    // Emit RMS from the same PCM16 buffer so the indicator is driven by the
    // exact bytes being sent. When muted, audioTrack.enabled = false silences
    // the worklet output, so RMS naturally reads ~0.
    if (callbacks.onUserAudio) {
      const samples = new Int16Array(e.data.slice(0))
      callbacks.onUserAudio(pcm16Rms(samples))
    }
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const b64 = btoa(binary)
    ws.send(
      JSON.stringify({
        realtime_input: {
          audio: { data: b64, mimeType: 'audio/pcm;rate=16000' },
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
            parts: [{ text: buildSystemPrompt(targetLanguage, items) }],
          },
        },
      })
    )
  })

  ws.addEventListener('message', (event: MessageEvent) => {
    // Gemini sends ALL frames as binary — control messages (JSON) and audio (raw PCM16).
    // Try UTF-8 decode + JSON parse first; treat as audio only if that fails.
    let msg: Record<string, unknown> | null = null
    if (event.data instanceof ArrayBuffer) {
      try {
        msg = JSON.parse(new TextDecoder().decode(event.data)) as Record<string, unknown>
      } catch {
        // Not JSON — raw PCM16 audio chunk.
        const pcm16 = new Int16Array(event.data)
        scheduleAgentPcm(pcm16)
        return
      }
    } else {
      msg = JSON.parse(event.data as string) as Record<string, unknown>
    }

    if ('setupComplete' in msg) {
      ready = true
      // Audible "ready to listen" cue. Played BEFORE the state change so the
      // tone reaches the speakers at roughly the same instant the UI flips
      // active. Wrapped in try/catch so an audio glitch (e.g. context
      // suspended on background tab) never blocks the session going live.
      try {
        playStartTone(safeCtx)
      } catch {
        /* non-fatal — the session is up, the chime is a nice-to-have */
      }
      callbacks.onStateChange('active')
      return
    }

    const serverContent = (msg as { serverContent?: {
      interrupted?: boolean
      modelTurn?: { parts: Array<{ inlineData?: { mimeType: string; data: string } }> }
    } }).serverContent

    if (serverContent?.interrupted) {
      // Server confirms the previous turn was cut short. Drop any chunks
      // we'd already scheduled locally so the agent's tail can't bleed into
      // the new response.
      stopAgentPlayback()
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
        scheduleAgentPcm(pcm16)
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
    setMuted(muted) {
      audioTrack.enabled = !muted
    },
    disconnect() {
      if (ws.readyState !== WebSocket.CLOSED) ws.close()
    },
  }
}
