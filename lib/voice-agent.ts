// lib/voice-agent.ts

import type { TargetLanguage } from '@/lib/types'

export type VoiceAgentState = 'connecting' | 'active' | 'ended'

export interface VoiceAgentCallbacks {
  onStateChange: (state: VoiceAgentState) => void
  onError: (message: string) => void
  onUserAudio?: (rms: number) => void
  onAgentAudio?: (rms: number) => void
  onTranscript?: (role: 'user' | 'model', text: string) => void
}

export interface ConnectOptions {
  /** When true, enables Gemini Live input + output transcription callbacks. */
  transcription?: boolean
  /** Override the system prompt sent to Gemini on connect. */
  systemPrompt?: string
  /** Override the prebuilt voice name (defaults to NEXT_PUBLIC_GOOGLE_VOICE
   *  or DEFAULT_VOICE). Used by the call-mode persona to match voice to vibe. */
  voiceName?: string
  /** When set, the agent speaks FIRST with its persona opener. Implementation:
   *  after `setupComplete`, we send the literal trigger text "__START_CALL__"
   *  via `clientContent`. The persona system prompt instructs the model to
   *  reply with the opener on receiving this trigger. clientContent text
   *  input does NOT pass through STT, so the trigger never appears as a
   *  user transcript bubble.
   *
   *  Pass the opener text here so the agent waits to be told to speak. If
   *  omitted, the agent waits for the user to speak first (existing behaviour). */
  openingLine?: string
}

/** Trigger token sent via clientContent to cue the agent's first turn.
 *  Kept here so the persona system prompt builder can reference the same
 *  constant. */
export const CALL_OPENING_TRIGGER = '__START_CALL__'

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
function playStartTone(ctx: AudioContext, dest: AudioNode) {
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = 0.18
  master.connect(dest)

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

/**
 * iOS Safari WebKit bug (#230902 / #231421): once `getUserMedia` activates
 * the mic, the AVAudioSession category becomes `PlayAndRecord` with output
 * routed to the receiver (earpiece), not the loudspeaker. ALL output via
 * `AudioContext.destination` plays through the earpiece — quietly — until
 * the mic is released. Desktop Safari and Android Chrome do not share this
 * bug; their audio session keeps media output on the main speaker
 * independently of mic capture.
 *
 * Workaround: pipe agent playback through a `MediaStreamAudioDestinationNode`
 * fed into a hidden `<audio playsInline autoplay>` element. Media element
 * playback runs in a different audio session category that keeps using the
 * loudspeaker, even with a live mic. Documented fix in Twilio / LiveKit /
 * Daily.co. iOS-only — non-iOS keeps the simpler `ctx.destination` path.
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true
  // iPadOS 13+ reports as Mac; disambiguate via touch support.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export interface VoiceAgent {
  setMuted: (muted: boolean) => void
  /** Flush any buffered transcript text immediately (call before disconnect to capture final turn). */
  flush: () => void
  disconnect: () => void
}

const WS_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'

const DEFAULT_VOICE = 'Aoede'

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

/**
 * Opens a real-time voice session with the Gemini Multimodal Live API.
 * Fetches the Google API key from /api/voice-token, opens a WebSocket,
 * streams PCM16 mic audio at 16 kHz, and plays back PCM16 agent audio at 24 kHz.
 *
 * Returns a handle for mute and disconnect.
 */
export async function connect(
  targetLanguage: TargetLanguage,
  callbacks: VoiceAgentCallbacks,
  options: ConnectOptions = {},
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
  // (The worklet emits no output samples, so this is silent — see pcm-processor.js.)
  worklet.connect(safeCtx.destination)

  // Set up the agent-playback sink. On iOS we must NOT play via
  // `safeCtx.destination` (earpiece routing — see isIOS comment above);
  // bridge through a MediaStream + <audio> element instead.
  let agentSink: AudioNode = safeCtx.destination
  let bridgeAudioEl: HTMLAudioElement | null = null
  if (isIOS() && typeof document !== 'undefined') {
    const dest = safeCtx.createMediaStreamDestination()
    const el = document.createElement('audio')
    el.autoplay = true
    el.setAttribute('playsinline', '')
    el.style.display = 'none'
    el.srcObject = dest.stream
    document.body.appendChild(el)
    // play() may reject if user gesture context is lost; non-fatal — autoplay
    // attribute will retry, and the WebSocket connect itself ran inside the
    // user gesture that opened the session.
    el.play().catch(() => { /* non-fatal */ })
    agentSink = dest
    bridgeAudioEl = el
  }

  // 3. Open WebSocket — API key in query param.
  const wsUrl = new URL(WS_ENDPOINT)
  wsUrl.searchParams.set('key', token)
  const ws = new WebSocket(wsUrl.toString())
  ws.binaryType = 'arraybuffer'

  let ready = false
  let setupTimeout: ReturnType<typeof setTimeout> | null = null
  let playbackTime = safeCtx.currentTime
  const voiceName = options.voiceName ?? process.env.NEXT_PUBLIC_GOOGLE_VOICE ?? DEFAULT_VOICE

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
    src.connect(agentSink)
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

  let userTranscriptBuffer = ''
  let modelTranscriptBuffer = ''
  // Tracks whether the user buffer was already emitted for the current turn.
  // Set to true the first time we see model output so the user bubble appears
  // before the agent starts speaking, not after it finishes.
  let userFlushedForTurn = false

  ws.addEventListener('open', () => {
    callbacks.onStateChange('connecting')
    const setupMsg: Record<string, unknown> = {
      setup: {
        // Native-audio model — recommended for emotional tone + multilingual
        // switching per Google's docs. The native-audio family already adapts
        // its delivery to the conversational vibe, so we don't need a separate
        // affective-dialog flag (which only exists on Vertex anyway, not on
        // this AI Studio v1alpha endpoint).
        //
        // CAREFUL: the AI Studio model name is NOT the same as Vertex's. Vertex
        // calls it `gemini-live-2.5-flash-native-audio`; AI Studio v1alpha
        // exposes `gemini-2.5-flash-native-audio-{latest,preview-...}`. Using
        // the wrong name causes the WebSocket to silently close before
        // setupComplete — looks like a hang.
        model: 'models/gemini-2.5-flash-native-audio-latest',
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: options.systemPrompt ?? buildPracticeSystemPrompt(targetLanguage) }],
        },
        ...(options.transcription ? {
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        } : {}),
      },
    }
    ws.send(JSON.stringify(setupMsg))
    // Fail fast if the server accepts the WebSocket but never responds with
    // setupComplete. Without this, an unrecognised setup field (or any
    // server-side hiccup) leaves the user staring at the connecting/ringing
    // screen indefinitely. 15s is generous for a healthy connection.
    setupTimeout = setTimeout(() => {
      if (!ready) {
        callbacks.onError('Setup timed out')
        try { ws.close() } catch { /* already closed */ }
      }
    }, 15000)
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
      if (setupTimeout) { clearTimeout(setupTimeout); setupTimeout = null }
      // Audible "ready to listen" cue. Played BEFORE the state change so the
      // tone reaches the speakers at roughly the same instant the UI flips
      // active. Wrapped in try/catch so an audio glitch (e.g. context
      // suspended on background tab) never blocks the session going live.
      try {
        playStartTone(safeCtx, agentSink)
      } catch {
        /* non-fatal — the session is up, the chime is a nice-to-have */
      }
      // Persona/call mode: send the opening trigger so the agent speaks FIRST.
      // clientContent text input bypasses STT (no inputTranscription) so the
      // trigger never appears as a user bubble in the transcript. The persona
      // system prompt instructs the model to reply with the opener verbatim.
      if (options.openingLine) {
        ws.send(JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text: CALL_OPENING_TRIGGER }] }],
            turnComplete: true,
          },
        }))
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
        // Model audio starting means the user has finished their turn — emit
        // the user bubble now so it appears before the agent starts speaking.
        if (options.transcription && !userFlushedForTurn && userTranscriptBuffer.trim()) {
          callbacks.onTranscript?.('user', userTranscriptBuffer.trim())
          userTranscriptBuffer = ''
          userFlushedForTurn = true
        }
      }
    }

    // Input transcription — user's speech (inside serverContent.inputTranscription)
    const inputTranscription = (msg as { serverContent?: { inputTranscription?: { text?: string } } }).serverContent?.inputTranscription
    if (options.transcription && inputTranscription?.text) {
      userTranscriptBuffer += inputTranscription.text
    }

    // Output transcription — model's speech (inside serverContent.outputTranscription)
    const outputTranscription = (msg as { serverContent?: { outputTranscription?: { text?: string } } }).serverContent?.outputTranscription
    if (options.transcription && outputTranscription?.text) {
      // First output token signals user turn ended — emit user bubble now if
      // model audio didn't already trigger it (e.g. transcription-only mode).
      if (!userFlushedForTurn && userTranscriptBuffer.trim()) {
        callbacks.onTranscript?.('user', userTranscriptBuffer.trim())
        userTranscriptBuffer = ''
        userFlushedForTurn = true
      }
      modelTranscriptBuffer += outputTranscription.text
    }

    // turnComplete — model's turn done; flush remaining buffers and reset
    // the per-turn flush flag so the next exchange starts fresh.
    const turnComplete = (msg as { serverContent?: { turnComplete?: boolean } }).serverContent?.turnComplete
    if (options.transcription && turnComplete) {
      if (userTranscriptBuffer.trim()) {
        callbacks.onTranscript?.('user', userTranscriptBuffer.trim())
        userTranscriptBuffer = ''
      }
      if (modelTranscriptBuffer.trim()) {
        callbacks.onTranscript?.('model', modelTranscriptBuffer.trim())
        modelTranscriptBuffer = ''
      }
      userFlushedForTurn = false
    }

    const error = (msg as { error?: { message?: string } }).error
    if (error) {
      callbacks.onError(error.message ?? 'Voice session error')
    }
  })

  ws.addEventListener('close', (ev: CloseEvent) => {
    const wasReady = ready
    ready = false
    if (setupTimeout) { clearTimeout(setupTimeout); setupTimeout = null }
    // If we never got setupComplete, the session never went live — surface
    // this as an error so the UI can bail out of the connecting/ringing
    // screen. Otherwise emit 'ended' (the normal disconnect path).
    if (!wasReady) {
      callbacks.onError(`Connection closed before ready (code ${ev.code})`)
    } else {
      callbacks.onStateChange('ended')
    }
    safeCtx.close()
    safeStream.getTracks().forEach(t => t.stop())
    if (bridgeAudioEl) {
      bridgeAudioEl.pause()
      bridgeAudioEl.srcObject = null
      bridgeAudioEl.remove()
      bridgeAudioEl = null
    }
  })

  ws.addEventListener('error', () => {
    callbacks.onError('Connection error')
  })

  // 4. Return the agent handle.
  return {
    setMuted(muted) {
      audioTrack.enabled = !muted
    },
    flush() {
      if (!options.transcription) return
      if (userTranscriptBuffer.trim()) {
        callbacks.onTranscript?.('user', userTranscriptBuffer.trim())
        userTranscriptBuffer = ''
      }
      if (modelTranscriptBuffer.trim()) {
        callbacks.onTranscript?.('model', modelTranscriptBuffer.trim())
        modelTranscriptBuffer = ''
      }
      userFlushedForTurn = false
    },
    disconnect() {
      if (ws.readyState !== WebSocket.CLOSED) ws.close()
    },
  }
}
