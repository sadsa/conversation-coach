// lib/voice-agent.ts

import type { TargetLanguage, TranscriptTurn } from '@/lib/types'

export type VoiceAgentState = 'connecting' | 'active' | 'ended'

export interface VoiceAgentCallbacks {
  onStateChange: (state: VoiceAgentState) => void
  onError: (message: string) => void
  onUserAudio?: (rms: number) => void
  onAgentAudio?: (rms: number) => void
  onTranscript?: (role: 'user' | 'model', text: string) => void
  /**
   * Fires synchronously for every PCM16 frame the mic worklet emits — even
   * before Gemini's WebSocket finishes its handshake. The Int16Array is a
   * fresh copy owned by the caller (safe to retain).
   *
   * Wired up for parallel STT: PracticeClient tees these into AssemblyAI
   * Universal-3 Pro Streaming for the displayed user transcript, because
   * Gemini Live's `inputAudioTranscription` mishears NZ-accented speech
   * (Spanish-with-NZ-accent in particular — see the
   * `/debug/transcribe-compare` experiment). Gemini still receives the
   * same frames from the production send-path and drives the conversation
   * (turn detection, agent response, persona, TTS) — the tee is downstream
   * of capture and has zero effect on what Gemini hears.
   */
  onMicPcm?: (samples: Int16Array) => void
  /**
   * Fires once per turn when the first audio chunk from the model arrives.
   * Lets the UI react to "user finished, model is responding" without
   * polling RMS or waiting for the parallel STT's final transcript — e.g.
   * inserting a "…" placeholder for the user's bubble while AssemblyAI is
   * still finalising the transcription.
   *
   * The internal flag resets on `serverContent.turnComplete` so each new
   * exchange fires it again.
   *
   * NOTE: This also fires when the model speaks first (no preceding user
   * turn — e.g. call-mode opener, agent follow-ups). Consumers that use
   * it to insert a "user turn placeholder" should also gate on a
   * separate user-spoke-this-cycle signal, or they'll attribute model-
   * initiated turns to the user.
   */
  onModelTurnStart?: () => void
  /**
   * Fires once per turn when the model signals `serverContent.turnComplete`
   * — i.e. the model has finished its reply. The natural "end of
   * exchange" boundary for resetting per-turn UI state (clearing
   * placeholder refs, "user audible this cycle" flags, etc.) so the
   * next user turn starts from a clean slate.
   *
   * Fires even when `transcription: false` — we still want consumers to
   * be able to detect end-of-exchange independent of the transcription
   * option.
   */
  onTurnComplete?: () => void
  /** Fires when Gemini calls a declared tool. The callback receives the
   *  function name and parsed args. Call the returned `respond` function
   *  with a result object to send the tool_response back to Gemini. */
  onToolCall?: (name: string, args: Record<string, unknown>, respond: (result: Record<string, unknown>) => void) => void
}

export interface ConnectOptions {
  /** When true, enables Gemini Live input + output transcription callbacks. */
  transcription?: boolean
  /**
   * When false (and `transcription` is true), Gemini's input audio
   * transcription is NOT requested at setup, so no user-role transcripts
   * are emitted. Use when the user-bubble text is sourced from a parallel
   * STT (AssemblyAI U3 Pro in PracticeClient) — saves the Gemini-side
   * transcription cost and removes the temptation to double-attribute the
   * same turn from two sources. Defaults to true for backward compat.
   */
  inputTranscription?: boolean
  /** Override the system prompt sent to Gemini on connect. */
  systemPrompt?: string
  /** Override the prebuilt voice name (defaults to NEXT_PUBLIC_GOOGLE_VOICE
   *  or DEFAULT_VOICE). Used by the call-mode persona to match voice to vibe. */
  voiceName?: string
  /** Override the Gemini Live model. Defaults to {@link DEFAULT_MODEL}.
   *  Practice uses {@link FLASH_LIVE_MODEL} for both chat and call modes —
   *  the snappier turn-taking matters more than native-audio's richer
   *  intonation, and persona character comes through via the system prompt
   *  + matched voice. {@link NATIVE_AUDIO_MODEL} is kept exported in case
   *  we want to reintroduce it for a specific surface. */
  model?: string
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
}

/** Trigger token sent via clientContent to cue the agent's first turn.
 *  Kept here so the persona system prompt builder can reference the same
 *  constant. */
export const CALL_OPENING_TRIGGER = '__START_CALL__'

/** Native-audio model. Adapts emotional tone automatically and produces
 *  the most human-like delivery — at the cost of longer end-of-turn pauses
 *  (the model takes a beat to "feel" the response). Not currently wired up:
 *  call mode used to pin this for richer intonation, but the sluggish
 *  turn-taking outweighed the benefit and call mode now uses
 *  {@link FLASH_LIVE_MODEL} too. Kept exported for opt-in experimentation. */
export const NATIVE_AUDIO_MODEL = 'models/gemini-2.5-flash-native-audio-latest'

/** Synthesised-voice live model. Less emotional nuance than native-audio,
 *  but noticeably faster turn-taking — conversation flows the way real
 *  conversation should. Used by both chat mode and call-mode personas. */
export const FLASH_LIVE_MODEL = 'models/gemini-3.1-flash-live-preview'

/** Backwards-compatible default for callers that don't pass a model. Kept
 *  on NATIVE_AUDIO_MODEL so any pre-existing caller's behaviour is
 *  unchanged; the practice surface always passes an explicit model. */
export const DEFAULT_MODEL = NATIVE_AUDIO_MODEL

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

/** System prompt for practice sessions — Gemini acts as a conversation partner, not a coach.
 *
 *  Accent is set by the system prompt, not by API config. Gemini Live's
 *  `language_code` field accepts a fixed list — `en-NZ` and `es-AR` are NOT
 *  on it (the closest English variants are `en-US` and `en-IN`; the closest
 *  Spanish is `es-US`). We deliberately omit `language_code` so the model
 *  defaults aren't pinned to US English / US Spanish, then explicitly steer
 *  the accent in the first line of the prompt. The previous prompt only
 *  identified the speaker's nationality ("you are a NZ speaker") — the model
 *  honoured that as character but defaulted its phonetic output toward US
 *  English unless told otherwise. The current prompt makes pronunciation an
 *  explicit instruction, repeated at the front (primacy) and reinforced with
 *  a concrete dialect-defining feature (the NZ vowel shift / Rioplatense
 *  sheísmo) so the model has something specific to lock onto.
 *
 *  Includes an explicit slow-pace instruction. Live models honour cadence
 *  cues in the system prompt reasonably well; combined with the curated
 *  learner-paced voice catalog (see `LEARNER_PACED_VOICES` in lib/persona.ts)
 *  this brings the perceived speech rate closer to comprehensible for a
 *  language learner without losing naturalness. */
export function buildPracticeSystemPrompt(targetLanguage: TargetLanguage): string {
  if (targetLanguage === 'en-NZ') {
    return `IMPORTANT — ACCENT: You speak with a clear, natural New Zealand (Kiwi) accent throughout the entire conversation. This is non-negotiable. Your accent is unmistakably NZ from the very first word — never American, never British, never "neutral international" English. The characteristic Kiwi vowel shifts are present (the well-known "fish and chips" sound), and the intonation carries the typical NZ rising cadence at the ends of statements. Hold this accent for every single turn; do not drift even if the learner speaks with a different accent.

You are a friendly native New Zealand English speaker having a casual conversation with a language learner.
Keep your responses natural and concise — 1–3 sentences per turn so the learner gets plenty of speaking time.
Speak at a calm, deliberate pace — the person you're talking to is learning English. Articulate each word clearly, leave short pauses between sentences, and don't rush. Imagine you're chatting with a friend who's a little hard of hearing — same warmth, just unhurried. Do NOT switch to over-enunciated "teacher voice"; stay natural, just measured.
Do NOT correct the learner's English mid-conversation. Do NOT give grammar explanations or coaching tips.
Respond only in English. React naturally to what the learner says — ask follow-up questions, share opinions, keep the conversation flowing.
If the learner seems to struggle, respond naturally as any conversationalist would — do not switch to a teaching mode.`
  }
  // Default: es-AR Rioplatense
  return `IMPORTANTE — ACENTO: Hablás con acento rioplatense (porteño) claro y natural durante toda la conversación. Esto es innegociable. Tu acento es inconfundiblemente argentino desde la primera palabra — nunca castellano de España, nunca mexicano, nunca "español neutro". Pronunciá la "ll" y la "y" con el sonido sh característico (sheísmo / zheísmo: "yo" → "sho", "calle" → "cashe", "playa" → "plasha"). Mantené este acento en cada turno; no derrapés aunque el aprendiz hable con otro acento.

Sos un hablante nativo de español rioplatense teniendo una charla cotidiana con alguien que está aprendiendo el idioma.
Respondé de forma natural y breve — 1 a 3 oraciones por turno para que el otro tenga bastante tiempo para hablar.
Hablá en un ritmo tranquilo y pausado — la persona del otro lado está aprendiendo el idioma. Articulá bien cada palabra, dejá pausas cortas entre oraciones, y no aceleres. Imaginate que estás charlando con alguien que escucha un poco lento — la misma calidez, pero sin apuro. NO uses voz de "maestro/a" exagerada; mantenete natural, solo medido/a.
NO corrijas los errores del aprendiz durante la conversación. NO des explicaciones de gramática ni consejos de coaching.
Respondé únicamente en español. Reaccioná de forma natural — hacé preguntas de seguimiento, compartí opiniones, mantené la charla fluyendo.
Usá el voseo y el vocabulario típico del Río de la Plata (ché, dale, bárbaro, etc.) de manera natural, no exagerada.`
}

/**
 * Appends a formatted conversation history block to an existing system prompt.
 * Used when resuming a paused session so the agent has full context of what
 * was discussed before the break.
 *
 * @param basePrompt  Already-assembled system prompt (base + persona addendum if call mode).
 * @param turns       Settled turns from frozenTurnsRef — no pending/empty turns expected,
 *                    but the function filters defensively.
 * @param agentLabel  Label for the agent's turns in the history block.
 *                    Call mode: persona.name (e.g. "Nora").
 *                    Chat mode: "Coach" (en-NZ) | "Entrenador" (es-AR).
 */
export function buildResumeSystemPrompt(
  basePrompt: string,
  turns: TranscriptTurn[],
  agentLabel: string,
): string {
  const settled = turns
    .filter(t => !t.pending)
    .map(t => ({ ...t, text: t.text.trim() }))
    .filter(t => t.text !== '')
  if (settled.length === 0) return basePrompt

  const lines = settled.map(t => {
    const label = t.role === 'user' ? 'User' : agentLabel
    return `[${label}] ${t.text}`
  })

  const block = [
    '—— CONVERSATION SO FAR ——',
    'The conversation below happened before a brief pause. Resume naturally from where it left off — wait for the user to speak first. Do NOT re-introduce yourself or ask what you were talking about. You have already introduced yourself — do not repeat your introduction.',
    '',
    ...lines,
  ].join('\n')

  return `${basePrompt.trimEnd()}\n${block}`
}

/** Phrase context passed into the lesson — the correction, its explanation,
 *  and the optional [[bracketed]] flashcard text. */
export interface LessonPhrase {
  correction: string
  explanation: string
  flashcard_front: string | null
  flashcard_back: string | null
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
Explain the correction in one sentence. Do NOT give your own example — instead, immediately invite the student to try using the phrase themselves. The prompt must be directly about the phrase (e.g. "¿Podés armar una oración con 'me resulta difícil'?") — do not ask a general conversation question unrelated to the phrase. When the student has produced a correct use, call set_phase with phase="model".

Phase 2 — model (~2 minutes):
Demonstrate the phrase in 3–4 varied contexts — different subjects, tenses, or scenarios. Keep examples short and memorable. Ask a brief comprehension check after each example. When you are satisfied the student recognises the pattern, call set_phase with phase="drill".

Phase 3 — drill (~3 minutes):
Ask the student to produce their own sentences using the phrase. Prompt them with scenarios ("Tell me something you did yesterday", "How would you say you went to the gym?"). If they make the same error being studied, gently correct it once and move on — do not dwell. When the student has produced at least 2–3 correct uses with confidence, call set_phase with phase="free_use".

Phase 4 — free_use (~3 minutes):
Have a natural conversation on any topic. Steer the conversation so the phrase comes up naturally — do not prompt it directly. When the student uses it naturally in context at least once, or when the 10 minutes are nearly up, call set_phase with phase="complete" to end the lesson.

ADVANCEMENT RULE: Call set_phase only when you have heard evidence of understanding or production. Do not advance on a timer alone. If the student is struggling, slow down and stay in the current phase longer.

—— STARTING THE LESSON ——
YOU lead this session. Speak first. The moment the lesson-start signal arrives, say TWO short sentences only — name the phrase, then ask if the student is ready (e.g. "Hoy practicamos 'me resulta difícil'. ¿Estás listo/a?"). Nothing more. When they respond, begin Phase 1. Do NOT launch into the full explanation before the student has spoken. Do NOT translate or explain the lesson-start signal itself.`
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
  let finalSink: AudioNode = safeCtx.destination
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
    finalSink = dest
    bridgeAudioEl = el
  }

  // All agent audio routes through this gain node so stopAgentPlayback() can
  // ramp to 0 before cutting sources, avoiding the click/pop that src.stop()
  // causes when cutting mid-waveform.
  const agentGain = safeCtx.createGain()
  agentGain.connect(finalSink)
  const agentSink = agentGain

  // 3. Open WebSocket — API key in query param.
  const wsUrl = new URL(WS_ENDPOINT)
  wsUrl.searchParams.set('key', token)
  const ws = new WebSocket(wsUrl.toString())
  ws.binaryType = 'arraybuffer'

  let ready = false
  let disposed = false
  let setupTimeout: ReturnType<typeof setTimeout> | null = null
  let playbackTime = safeCtx.currentTime
  const voiceName = options.voiceName ?? process.env.NEXT_PUBLIC_GOOGLE_VOICE ?? DEFAULT_VOICE

  // Suppress mic sends briefly after Gemini fires `interrupted`.
  // On slow connections, stale/buffered mic frames arrive at Gemini while the
  // model is already speaking → VAD triggers `interrupted` → model restarts
  // from the first syllable → stutter loop. A short cooldown after each
  // interrupt breaks the feedback cycle before fresh frames resume.
  // 150ms is enough to drain in-flight frames without muting real speech —
  // 500ms was too aggressive and dropped the first half-second of user replies.
  let micSuppressUntil = 0

  // Track every scheduled agent audio source so we can hard-stop playback
  // when the user changes focus mid-response (otherwise the new turn's audio
  // overlaps the tail of the old one). Sources self-remove on `ended`.
  const activeAgentSources = new Set<AudioBufferSourceNode>()

  function stopAgentPlayback() {
    const now = safeCtx.currentTime
    const fadeEnd = now + 0.02  // 20ms ramp — inaudible but eliminates the hard-cut click
    agentGain.gain.cancelScheduledValues(now)
    agentGain.gain.setValueAtTime(agentGain.gain.value, now)
    agentGain.gain.linearRampToValueAtTime(0, fadeEnd)
    activeAgentSources.forEach(src => {
      try { src.stop(fadeEnd) } catch { /* already stopped — fine */ }
    })
    activeAgentSources.clear()
    // Restore gain so the next response starts at full volume.
    agentGain.gain.setValueAtTime(1, fadeEnd)
    playbackTime = fadeEnd
    // Snap the indicator back to silence so the UI doesn't keep pulsing
    // green for a beat after we cut the audio.
    if (!disposed) callbacks.onAgentAudio?.(0)
  }

  /**
   * Synchronous teardown. Both the explicit `disconnect()` and the natural
   * `ws.close` event funnel through here so the cleanup is idempotent.
   *
   * Why this matters: `ws.close()` is async — the close event can fire
   * hundreds of ms later. Without this, scheduled `AudioBufferSourceNode`s
   * (the agent's tail) keep playing through the still-open `AudioContext`
   * while a new session spins up — the user hears two voices simultaneously.
   * Also marks the instance disposed so any pending WebSocket events from
   * the old session can't fire stale callbacks at the caller, who has
   * usually already swapped in a new agent (e.g. "try another line").
   */
  function dispose() {
    if (disposed) return
    disposed = true
    if (setupTimeout) { clearTimeout(setupTimeout); setupTimeout = null }
    stopAgentPlayback()
    if (ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
      try { ws.close() } catch { /* already closed — fine */ }
    }
    safeCtx.close().catch(() => { /* already closed — fine */ })
    safeStream.getTracks().forEach(t => t.stop())
    if (bridgeAudioEl) {
      bridgeAudioEl.pause()
      bridgeAudioEl.srcObject = null
      bridgeAudioEl.remove()
      bridgeAudioEl = null
    }
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

  // Stream mic audio. We deliberately do NOT short-circuit on
  // `!ready` (i.e. Gemini setupComplete still pending) — `onMicPcm` and
  // `onUserAudio` callers (parallel STT, mic-level indicators) should
  // see frames as soon as the worklet emits them. The Gemini-specific
  // send is gated below.
  worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (disposed) return

    // Emit RMS from the PCM16 buffer so the indicator is driven by the
    // exact bytes that are about to be sent. When muted, audioTrack.enabled
    // = false silences the worklet output, so RMS naturally reads ~0.
    // (The Int16Array used here owns a copy via `slice(0)` so the
    // downstream send-path's view of `e.data` is unaffected.)
    if (callbacks.onUserAudio || callbacks.onMicPcm) {
      const samples = new Int16Array(e.data.slice(0))
      callbacks.onUserAudio?.(pcm16Rms(samples))
      callbacks.onMicPcm?.(samples)
    }

    // Gemini Live — gated on setupComplete + open WS.
    if (!ready || ws.readyState !== WebSocket.OPEN) return

    // Drop this frame if the send buffer is already backed up.
    // A growing bufferedAmount means the connection is slow — queuing more
    // frames only deepens the stale-burst problem. 32 kB ≈ 128 × the typical
    // 256-byte frame, so this only triggers under genuine congestion.
    if (ws.bufferedAmount > 32768) return

    // Respect the post-interrupt cooldown.
    if (safeCtx.currentTime < micSuppressUntil) return

    const bytes = new Uint8Array(e.data)
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
  // Tracks whether we've fired `onModelTurnStart` for the current turn.
  // Reset on `serverContent.turnComplete`. Lets consumers (PracticeClient)
  // insert a transient "…" placeholder for the user bubble the instant the
  // model starts replying, without polling RMS or waiting for AssemblyAI's
  // final transcript to arrive.
  let modelTurnStartFiredForTurn = false

  ws.addEventListener('open', () => {
    if (disposed) return
    callbacks.onStateChange('connecting')
    const setupMsg: Record<string, unknown> = {
      setup: {
        // Practice surface always passes FLASH_LIVE_MODEL (both chat and
        // call modes — see ConnectOptions.model docs). DEFAULT_MODEL is kept
        // on NATIVE_AUDIO_MODEL for callers that don't pass one.
        //
        // CAREFUL: the AI Studio model name is NOT the same as Vertex's. Vertex
        // calls native-audio `gemini-live-2.5-flash-native-audio`; AI Studio
        // v1alpha exposes `gemini-2.5-flash-native-audio-{latest,preview-...}`
        // and `gemini-3.1-flash-live-preview`. Using the wrong name causes
        // the WebSocket to silently close before setupComplete — looks like
        // a hang.
        model: options.model ?? DEFAULT_MODEL,
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
        // Input transcription is opt-out via `inputTranscription: false`
        // when a parallel STT is sourcing the user-bubble text (see the
        // option's docs). Output transcription is always on when
        // `transcription: true` because we still need it to drive model-
        // bubble text and the "model started responding" signal.
        ...(options.transcription ? {
          ...(options.inputTranscription === false ? {} : { inputAudioTranscription: {} }),
          outputAudioTranscription: {},
        } : {}),
        ...(options.tools && options.tools.length > 0 ? {
          tools: [{ function_declarations: options.tools }],
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
    if (disposed) return
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
      // the new response. Also suppress mic sends for 150ms — on slow
      // connections, stale mic frames trip VAD immediately after the model
      // restarts, causing the first-syllable repeat loop.
      stopAgentPlayback()
      micSuppressUntil = safeCtx.currentTime + 0.15
      return
    }

    if (serverContent?.modelTurn?.parts) {
      // Fire the "model turn started" hook once per turn before processing
      // chunks. The signal is what tells PracticeClient to drop a "…"
      // placeholder bubble in for the user while AssemblyAI catches up.
      if (!modelTurnStartFiredForTurn) {
        modelTurnStartFiredForTurn = true
        callbacks.onModelTurnStart?.()
      }
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
    if (turnComplete) {
      if (options.transcription) {
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
      // Reset regardless of transcription option — both callbacks below
      // and `onModelTurnStart` should fire fresh on the next turn either
      // way. The end-of-exchange callback fires AFTER the flush so any
      // consumer that wants to lock pending placeholders sees a settled
      // user-turn shape.
      modelTurnStartFiredForTurn = false
      callbacks.onTurnComplete?.()
    }

    const error = (msg as { error?: { message?: string } }).error
    if (error) {
      callbacks.onError(error.message ?? 'Voice session error')
    }

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
  })

  ws.addEventListener('close', (ev: CloseEvent) => {
    // If dispose() already ran (caller-initiated disconnect), don't bother
    // the caller with an 'ended' callback — they triggered the teardown
    // themselves and have already moved on (often to a new session). Firing
    // it anyway would let the OLD session's handler stomp on the NEW state.
    if (disposed) return
    const wasReady = ready
    ready = false
    if (!wasReady) {
      callbacks.onError(`Connection closed before ready (code ${ev.code})`)
    } else {
      callbacks.onStateChange('ended')
    }
    dispose()
  })

  ws.addEventListener('error', () => {
    if (disposed) return
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
      dispose()
    },
  }
}
