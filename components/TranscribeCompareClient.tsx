// components/TranscribeCompareClient.tsx
//
// Investigation tool: capture mic audio, send the same PCM16 frames to both
// Gemini Live AND AssemblyAI Universal-3 Pro Streaming in parallel, render
// each provider's transcript side by side as it arrives. No agent response
// is played back — Gemini is asked to stay silent, AssemblyAI is pure STT.
//
// Reached only via direct URL (`/debug/transcribe-compare`). Not linked
// from any production nav. Use when judging whether to swap Gemini's
// `inputTranscription` for a parallel STT source on the practice surface.
//
// Architecture mirrors lib/voice-agent.ts for the Gemini side (AudioContext
// at 16 kHz, AudioWorklet emitting PCM16 buffers) but stripped down — no
// playback path, no persona, no transcript-buffering-by-turn. Each worklet
// frame is teed to two WebSockets simultaneously, so timing differences
// between providers are only their own latency, not ours.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/Button'

type TargetLanguage = 'es-AR' | 'en-NZ'

type Status = 'idle' | 'connecting' | 'recording' | 'stopping' | 'error'

interface TranscribeCompareClientProps {
  initialTargetLanguage: TargetLanguage
}

const GEMINI_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'
const GEMINI_MODEL = 'models/gemini-3.1-flash-live-preview'

const ASSEMBLYAI_WS_BASE = 'wss://streaming.assemblyai.com/v3/ws'

/** Gemini system prompt that asks the model to stay silent. We only want
 *  the input transcription stream; any model response is wasted tokens and
 *  would push setupComplete latency. The phrasing leans on "absolutely
 *  silent" + a single instruction to acknowledge with empty string so the
 *  model doesn't decide to "be helpful" anyway. */
function silentListenPrompt(language: TargetLanguage): string {
  if (language === 'en-NZ') {
    return `You are an absolutely silent transcription assistant. Do not speak. Do not respond verbally. Do not generate any audio output. Simply listen. The user is speaking English (New Zealand accent).`
  }
  return `You are an absolutely silent transcription assistant. Do not speak. Do not respond verbally. Do not generate any audio output. Simply listen. The user is speaking Spanish (Argentinian / Rioplatense, voseo).`
}

/** AssemblyAI's prompt-based language steer — Universal-3 Pro Streaming
 *  silently ignores `language_code`. Prepending "Transcribe ." to
 *  the default prompt is the documented workaround. */
function assemblyaiLanguagePrompt(language: TargetLanguage): string {
  const langWord = language === 'en-NZ' ? 'English' : 'Spanish'
  return `Transcribe ${langWord}. Transcribe verbatim with standard punctuation. Include filler words and incomplete utterances.`
}

/** Seed list for the keyterms textarea — gives AssemblyAI a head start on
 *  the words we saw it miss in the first comparison run (bach, mean feed,
 *  Tekapo) plus the obvious NZ slang and Rioplatense vocab that no public
 *  STT model has in its baseline vocabulary. The user can edit freely;
 *  this is just a sensible starting point. AssemblyAI's docs cap us at
 *  100 terms × 50 chars each. */
const DEFAULT_KEYTERMS = [
  // Kiwi idioms / NZ vocab the previous run got wrong or close to wrong
  'bach', 'sweet as', 'mean feed', 'yeah nah', 'ay', 'bro', 'Kiwi',
  // Māori place names + common loanwords
  'Aotearoa', 'Tekapo', 'Taupō', 'Whakatāne', 'Wanaka', 'Ōamaru',
  'Whangārei', 'Tauranga', 'Rotorua', 'Wellington', 'Auckland',
  'Christchurch', 'kia ora', 'kai', 'whānau', 'Pākehā', 'marae',
  // Rioplatense slang for the Spanish-mode run
  'ché', 'vos', 'boludo', 'pibe', 'mina', 'laburo', 'quilombo',
  'bárbaro', 'plata', 'bondi', 'fiaca', 'posta', 'copado', 'dale',
  'boliche', 'porteño', 'rioplatense',
].join(', ')

/** Turn the textarea body into the JSON-array string AssemblyAI expects on
 *  the `keyterms_prompt` query parameter. Splits on commas AND newlines so
 *  the user can paste a list in any shape; trims whitespace; drops empties
 *  and dupes; enforces both AssemblyAI limits (100 terms, 50 chars). */
function parseKeyterms(raw: string): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const candidate of raw.split(/[,\n]/)) {
    const trimmed = candidate.trim()
    if (!trimmed) continue
    if (trimmed.length > 50) continue
    if (seen.has(trimmed.toLowerCase())) continue
    seen.add(trimmed.toLowerCase())
    terms.push(trimmed)
    if (terms.length >= 100) break
  }
  return terms
}

interface TranscriptEntry {
  /** Server-assigned id (Gemini turn count or AssemblyAI turn order index). */
  id: number
  /** True once the turn is final (no more partial updates). */
  final: boolean
  text: string
  /** ms since this transcript line first appeared. */
  receivedAt: number
}

/**
 * Manages a list of transcript lines for a single provider with optional
 * partial updates. Gemini emits incremental text inside one "user turn"
 * which we flush on turnComplete; AssemblyAI emits a single Turn event per
 * turn with `end_of_turn: false|true`. The unified shape: each line has an
 * id and a `final` flag; partials replace the in-flight line, finals lock
 * it in and bump the id for the next one.
 */
function useTranscriptLog() {
  const [lines, setLines] = useState<TranscriptEntry[]>([])
  const nextIdRef = useRef(0)

  const appendPartial = useCallback((text: string) => {
    setLines(prev => {
      if (prev.length === 0 || prev[prev.length - 1].final) {
        const id = nextIdRef.current++
        return [...prev, { id, final: false, text, receivedAt: Date.now() }]
      }
      const last = prev[prev.length - 1]
      return [...prev.slice(0, -1), { ...last, text }]
    })
  }, [])

  const appendFinal = useCallback((text: string) => {
    setLines(prev => {
      if (prev.length === 0 || prev[prev.length - 1].final) {
        const id = nextIdRef.current++
        return [...prev, { id, final: true, text, receivedAt: Date.now() }]
      }
      const last = prev[prev.length - 1]
      return [...prev.slice(0, -1), { ...last, text, final: true }]
    })
  }, [])

  const clear = useCallback(() => {
    setLines([])
    nextIdRef.current = 0
  }, [])

  return { lines, appendPartial, appendFinal, clear }
}

/** Encode an ArrayBuffer of PCM16 samples to base64 for Gemini Live's
 *  JSON-wrapped `realtime_input.audio` channel. AssemblyAI takes raw
 *  binary frames — no encoding needed. */
function pcmToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function TranscribeCompareClient({ initialTargetLanguage }: TranscribeCompareClientProps) {
  const [language, setLanguage] = useState<TargetLanguage>(initialTargetLanguage)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [geminiReady, setGeminiReady] = useState(false)
  const [assemblyReady, setAssemblyReady] = useState(false)
  const [keytermsRaw, setKeytermsRaw] = useState(DEFAULT_KEYTERMS)
  // Parsed keyterms — recomputed on every render but cheap and lets us
  // show the live count + over-limit warnings next to the textarea.
  const keyterms = useMemo(() => parseKeyterms(keytermsRaw), [keytermsRaw])
  // Snapshot of keyterms at recording-start time, used by the AssemblyAI
  // connection. Edits during recording don't apply to the live session —
  // see the textarea note. Implemented as a ref so the keyterms textarea
  // can be reactive without re-creating startAssembly on every keystroke.
  const keytermsForSessionRef = useRef<string[]>([])

  const gemini = useTranscriptLog()
  const assembly = useTranscriptLog()

  // Refs for everything we need to tear down on stop/unmount.
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const geminiWsRef = useRef<WebSocket | null>(null)
  const assemblyWsRef = useRef<WebSocket | null>(null)
  const geminiReadyRef = useRef(false)
  const assemblyReadyRef = useRef(false)
  const startedAtRef = useRef<number | null>(null)
  // Mirror of `status` for closures that outlive a single render — WS
  // event handlers, the worklet onmessage callback, etc. React's
  // setState doesn't update closed-over local variables, so reading
  // `status` inside those handlers would always see the value at the
  // time the closure was created (almost always 'idle' or 'connecting'),
  // not the live one.
  const statusRef = useRef<Status>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  // Buffer Gemini input transcription text per turn (it arrives as small
  // increments alongside other server messages — same approach as the
  // production voice-agent). Flush on turnComplete or on stop.
  const geminiUserBufferRef = useRef('')
  // Buffer raw PCM16 frames so the user can save the captured audio as a
  // WAV for replay or offline scoring. Kept simple — one big buffer.
  const recordedFramesRef = useRef<Int16Array[]>([])
  const recordedSampleCountRef = useRef(0)
  // AssemblyAI U3 Pro Streaming requires each WS frame to contain between
  // 50ms and 1000ms of audio (close code 3007 if violated). Our shared
  // `/pcm-processor.js` worklet emits 128-sample frames (~8ms at 16 kHz)
  // — fine for Gemini Live, far below AssemblyAI's floor. Accumulate
  // worklet ticks into 100ms chunks (1600 samples = 3200 bytes) before
  // sending. 100ms is comfortably mid-window and the perceived added
  // latency is negligible (AssemblyAI's first partial fires at 750ms by
  // default anyway).
  const assemblyChunkBufferRef = useRef<Int16Array[]>([])
  const assemblyChunkSamplesRef = useRef(0)

  // -------- helpers ----------
  const stopGemini = useCallback(() => {
    const ws = geminiWsRef.current
    geminiWsRef.current = null
    geminiReadyRef.current = false
    if (ws && ws.readyState <= WebSocket.OPEN) {
      try { ws.close() } catch { /* ignore */ }
    }
  }, [])

  const stopAssembly = useCallback(() => {
    const ws = assemblyWsRef.current
    assemblyWsRef.current = null
    assemblyReadyRef.current = false
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Politely terminate so the session is billed only for the recorded
      // duration instead of running on AssemblyAI's side until inactivity
      // timeout. See https://www.assemblyai.com/docs/streaming/universal-3-pro
      try {
        ws.send(JSON.stringify({ type: 'Terminate' }))
      } catch { /* ignore */ }
    }
    if (ws && ws.readyState <= WebSocket.OPEN) {
      try { ws.close() } catch { /* ignore */ }
    }
  }, [])

  // Keep statusRef in sync with the live state value.
  useEffect(() => {
    statusRef.current = status
  }, [status])

  const stopAll = useCallback(() => {
    setStatus(prev => (prev === 'idle' || prev === 'error' ? prev : 'stopping'))
    statusRef.current = 'stopping'
    workletRef.current?.port.close()
    workletRef.current?.disconnect()
    workletRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    audioCtxRef.current?.close().catch(() => { /* already closed */ })
    audioCtxRef.current = null
    stopGemini()
    stopAssembly()
    startedAtRef.current = null
    // Drop any sub-50ms AssemblyAI chunk left in the buffer — sending it
    // would trip the 3007 input-duration violation, and there's nothing
    // useful in <50ms of trailing audio anyway.
    assemblyChunkBufferRef.current = []
    assemblyChunkSamplesRef.current = 0
    // Flush any pending Gemini user-transcript buffer that didn't get a
    // turnComplete before the user hit stop.
    if (geminiUserBufferRef.current.trim()) {
      gemini.appendFinal(geminiUserBufferRef.current.trim())
      geminiUserBufferRef.current = ''
    }
    setGeminiReady(false)
    setAssemblyReady(false)
    setStatus('idle')
    statusRef.current = 'idle'
  }, [gemini, stopAssembly, stopGemini])

  // -------- starters ----------
  const startGemini = useCallback(async () => {
    const tokenRes = await fetch('/api/voice-token')
    if (!tokenRes.ok) throw new Error('voice-token fetch failed')
    const { token } = (await tokenRes.json()) as { token: string }
    const url = new URL(GEMINI_WS)
    url.searchParams.set('key', token)
    const ws = new WebSocket(url.toString())
    ws.binaryType = 'arraybuffer'
    geminiWsRef.current = ws

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        setup: {
          model: GEMINI_MODEL,
          generationConfig: {
            // We still need at least one response modality declared or the
            // API rejects the setup. AUDIO is fine — we just drop every
            // audio chunk that comes back.
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
            },
          },
          systemInstruction: { parts: [{ text: silentListenPrompt(language) }] },
          inputAudioTranscription: {},
        },
      }))
    })

    ws.addEventListener('message', (event: MessageEvent) => {
      let msg: Record<string, unknown> | null = null
      if (event.data instanceof ArrayBuffer) {
        try {
          msg = JSON.parse(new TextDecoder().decode(event.data)) as Record<string, unknown>
        } catch {
          // Binary audio frame from the model — ignore. We asked it to be silent
          // but the API still streams ambient silence chunks sometimes.
          return
        }
      } else {
        msg = JSON.parse(event.data as string) as Record<string, unknown>
      }

      if ('setupComplete' in msg) {
        geminiReadyRef.current = true
        setGeminiReady(true)
        return
      }

      const serverContent = (msg as { serverContent?: {
        inputTranscription?: { text?: string }
        turnComplete?: boolean
      } }).serverContent
      if (serverContent?.inputTranscription?.text) {
        geminiUserBufferRef.current += serverContent.inputTranscription.text
        // Show partial progress so the panel doesn't feel frozen between turns.
        gemini.appendPartial(geminiUserBufferRef.current)
      }
      if (serverContent?.turnComplete) {
        const text = geminiUserBufferRef.current.trim()
        geminiUserBufferRef.current = ''
        if (text) gemini.appendFinal(text)
      }

      const err = (msg as { error?: { message?: string; code?: number } }).error
      if (err) {
        setError(`Gemini error: ${err.message ?? 'unknown'}`)
      }
    })

    ws.addEventListener('close', (ev: CloseEvent) => {
      geminiReadyRef.current = false
      setGeminiReady(false)
      if (statusRef.current === 'recording' || statusRef.current === 'connecting') {
        setError(`Gemini WS closed unexpectedly (code ${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`)
      }
    })

    ws.addEventListener('error', () => {
      if (statusRef.current === 'recording' || statusRef.current === 'connecting') {
        setError('Gemini WS error')
      }
    })
  }, [gemini, language])

  const startAssembly = useCallback(async () => {
    const tokenRes = await fetch('/api/assemblyai-stream-token')
    if (!tokenRes.ok) throw new Error('assemblyai-stream-token fetch failed')
    const { token } = (await tokenRes.json()) as { token: string }

    const url = new URL(ASSEMBLYAI_WS_BASE)
    url.searchParams.set('sample_rate', '16000')
    url.searchParams.set('speech_model', 'u3-rt-pro')
    url.searchParams.set('prompt', assemblyaiLanguagePrompt(language))
    // keyterms_prompt is documented as a JSON-encoded array of strings on
    // the query string. Skip it entirely when empty so we don't pin a
    // sub-optimal default; the server's behaviour for `[]` vs absent is
    // not promised to be identical.
    const keytermsForThisSession = keytermsForSessionRef.current
    if (keytermsForThisSession.length > 0) {
      url.searchParams.set('keyterms_prompt', JSON.stringify(keytermsForThisSession))
    }
    url.searchParams.set('token', token)

    const ws = new WebSocket(url.toString())
    ws.binaryType = 'arraybuffer'
    assemblyWsRef.current = ws

    ws.addEventListener('open', () => {
      // No setup message — connection-param style is the documented path
      // for Universal-3 Pro Streaming. The next thing the server expects
      // is raw PCM16 binary frames.
      assemblyReadyRef.current = true
      setAssemblyReady(true)
    })

    ws.addEventListener('message', (event: MessageEvent) => {
      let msg: Record<string, unknown>
      try {
        const text = event.data instanceof ArrayBuffer
          ? new TextDecoder().decode(event.data)
          : (event.data as string)
        msg = JSON.parse(text) as Record<string, unknown>
      } catch {
        return
      }

      const type = msg.type as string | undefined
      if (type === 'Turn') {
        const transcript = (msg.transcript as string | undefined) ?? ''
        const endOfTurn = Boolean(msg.end_of_turn)
        if (!transcript) return
        if (endOfTurn) {
          assembly.appendFinal(transcript)
        } else {
          assembly.appendPartial(transcript)
        }
      } else if (type === 'Termination') {
        assemblyReadyRef.current = false
        setAssemblyReady(false)
      } else if (type === 'Error') {
        setError(`AssemblyAI error: ${(msg.error as string | undefined) ?? 'unknown'}`)
      }
    })

    ws.addEventListener('close', (ev: CloseEvent) => {
      assemblyReadyRef.current = false
      setAssemblyReady(false)
      if (statusRef.current === 'recording' || statusRef.current === 'connecting') {
        setError(`AssemblyAI WS closed unexpectedly (code ${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`)
      }
    })

    ws.addEventListener('error', () => {
      if (statusRef.current === 'recording' || statusRef.current === 'connecting') {
        setError('AssemblyAI WS error')
      }
    })
  }, [assembly, language])

  // -------- main start handler ----------
  const handleStart = useCallback(async () => {
    if (statusRef.current === 'connecting' || statusRef.current === 'recording' || statusRef.current === 'stopping') {
      return
    }
    setError(null)
    gemini.clear()
    assembly.clear()
    recordedFramesRef.current = []
    recordedSampleCountRef.current = 0
    assemblyChunkBufferRef.current = []
    assemblyChunkSamplesRef.current = 0
    geminiUserBufferRef.current = ''
    // Freeze the keyterms list for this session so live textarea edits
    // can't desync from what the AssemblyAI WS was actually opened with.
    keytermsForSessionRef.current = keyterms
    setStatus('connecting')
    statusRef.current = 'connecting'

    let audioCtx: AudioContext | undefined
    let stream: MediaStream | undefined

    try {
      audioCtx = new AudioContext({ sampleRate: 16000 })
      await audioCtx.audioWorklet.addModule('/pcm-processor.js')
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, sampleRate: 16000 },
      })

      audioCtxRef.current = audioCtx
      streamRef.current = stream

      const source = audioCtx.createMediaStreamSource(stream)
      const worklet = new AudioWorkletNode(audioCtx, 'pcm-processor')
      source.connect(worklet)
      worklet.connect(audioCtx.destination)
      workletRef.current = worklet

      // Tee each worklet PCM frame into both providers + our local capture
      // buffer. Gemini Live accepts the 8ms per-quantum frames as-is.
      // AssemblyAI requires 50–1000ms per frame (close code 3007 if
      // violated), so we accumulate worklet ticks into ~100ms chunks
      // before flushing to it.
      const ASSEMBLY_CHUNK_SAMPLES = 1600 // 100ms at 16kHz
      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (statusRef.current === 'idle' || statusRef.current === 'stopping' || statusRef.current === 'error') return
        const bytes = new Uint8Array(e.data)

        // Save for WAV export.
        const copy = new Int16Array(e.data.slice(0))
        recordedFramesRef.current.push(copy)
        recordedSampleCountRef.current += copy.length

        // Gemini Live: base64-encoded JSON wrapper, only once setup is done.
        const gws = geminiWsRef.current
        if (gws && gws.readyState === WebSocket.OPEN && geminiReadyRef.current) {
          const b64 = pcmToBase64(bytes)
          gws.send(JSON.stringify({
            realtime_input: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } },
          }))
        }

        // AssemblyAI: buffer until we have a chunk in the valid 50-1000ms
        // range, then flush as raw binary. We deliberately use the same
        // `copy` we made for WAV export rather than another slice; it's
        // never mutated after pushing to recordedFramesRef.
        const aws = assemblyWsRef.current
        if (aws && aws.readyState === WebSocket.OPEN && assemblyReadyRef.current) {
          assemblyChunkBufferRef.current.push(copy)
          assemblyChunkSamplesRef.current += copy.length
          if (assemblyChunkSamplesRef.current >= ASSEMBLY_CHUNK_SAMPLES) {
            const merged = new Int16Array(assemblyChunkSamplesRef.current)
            let offset = 0
            for (const frame of assemblyChunkBufferRef.current) {
              merged.set(frame, offset)
              offset += frame.length
            }
            aws.send(merged.buffer)
            assemblyChunkBufferRef.current = []
            assemblyChunkSamplesRef.current = 0
          }
        }
      }

      // Open both sockets in parallel — neither blocks the other.
      await Promise.all([startGemini(), startAssembly()])

      setStatus('recording')
      statusRef.current = 'recording'
      startedAtRef.current = Date.now()
    } catch (err) {
      const message = (err as Error).message || 'failed to start'
      setError(message)
      stream?.getTracks().forEach(t => t.stop())
      await audioCtx?.close().catch(() => { /* ignore */ })
      audioCtxRef.current = null
      streamRef.current = null
      workletRef.current = null
      setStatus('error')
      statusRef.current = 'error'
    }
  }, [assembly, gemini, keyterms, startAssembly, startGemini])

  // -------- timer ----------
  useEffect(() => {
    if (status !== 'recording') return
    const interval = setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current)
    }, 100)
    return () => clearInterval(interval)
  }, [status])

  // -------- unmount cleanup ----------
  useEffect(() => {
    return () => {
      // Same teardown as stopAll but inline because the deps are stable
      // refs only — calling stopAll() would re-create the closure on every
      // language flip.
      workletRef.current?.port.close()
      workletRef.current?.disconnect()
      streamRef.current?.getTracks().forEach(t => t.stop())
      audioCtxRef.current?.close().catch(() => { /* ignore */ })
      const gws = geminiWsRef.current
      if (gws && gws.readyState <= WebSocket.OPEN) {
        try { gws.close() } catch { /* ignore */ }
      }
      const aws = assemblyWsRef.current
      if (aws && aws.readyState === WebSocket.OPEN) {
        try { aws.send(JSON.stringify({ type: 'Terminate' })) } catch { /* ignore */ }
        try { aws.close() } catch { /* ignore */ }
      }
    }
  }, [])

  // -------- WAV export ----------
  const handleDownloadWav = useCallback(() => {
    const sampleCount = recordedSampleCountRef.current
    if (sampleCount === 0) return
    const sampleRate = 16000

    // Flatten all frames into one Int16Array.
    const merged = new Int16Array(sampleCount)
    let offset = 0
    for (const frame of recordedFramesRef.current) {
      merged.set(frame, offset)
      offset += frame.length
    }

    // Minimal RIFF/WAVE PCM16 header. 44 bytes.
    const dataBytes = merged.length * 2
    const buffer = new ArrayBuffer(44 + dataBytes)
    const view = new DataView(buffer)
    const writeString = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
    }
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + dataBytes, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)            // PCM chunk size
    view.setUint16(20, 1, true)             // PCM format
    view.setUint16(22, 1, true)             // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true) // byte rate
    view.setUint16(32, 2, true)             // block align
    view.setUint16(34, 16, true)            // bits per sample
    writeString(36, 'data')
    view.setUint32(40, dataBytes, true)
    new Int16Array(buffer, 44).set(merged)

    const blob = new Blob([buffer], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    a.download = `transcribe-compare-${language}-${stamp}.wav`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [language])

  const handleClear = useCallback(() => {
    gemini.clear()
    assembly.clear()
    recordedFramesRef.current = []
    recordedSampleCountRef.current = 0
    setElapsedMs(0)
    setError(null)
  }, [assembly, gemini])

  const hasRecording = recordedSampleCountRef.current > 0
  const elapsedSeconds = useMemo(() => (elapsedMs / 1000).toFixed(1), [elapsedMs])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <Link href="/" className="text-sm text-text-secondary hover:text-text-primary">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold text-text-primary">
          STT comparison — Gemini Live vs AssemblyAI Universal-3 Pro
        </h1>
        <p className="text-sm text-text-secondary">
          Same mic input streamed to both providers in parallel. Use to judge
          whether replacing Gemini Live&apos;s <code className="rounded bg-surface-elevated px-1 py-0.5 text-xs">inputTranscription</code> with
          AssemblyAI would meaningfully improve transcript quality on your
          accent.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-4">
        <fieldset className="flex items-center gap-3" disabled={status === 'recording' || status === 'connecting'}>
          <legend className="sr-only">Language</legend>
          <span className="text-sm font-medium text-text-secondary">Language:</span>
          {(['es-AR', 'en-NZ'] as TargetLanguage[]).map(code => (
            <label key={code} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="lang"
                value={code}
                checked={language === code}
                onChange={() => setLanguage(code)}
              />
              {code === 'es-AR' ? 'Spanish (Argentinian)' : 'English (NZ)'}
            </label>
          ))}
        </fieldset>

        <div className="ml-auto flex items-center gap-3">
          {status === 'recording' && (
            <span className="font-mono text-sm text-text-secondary tabular-nums">
              {elapsedSeconds}s
            </span>
          )}
          {status === 'recording' ? (
            <Button variant="secondary" onClick={stopAll}>Stop</Button>
          ) : (
            <Button onClick={handleStart} disabled={status === 'connecting' || status === 'stopping'}>
              {status === 'connecting' ? 'Connecting…' : 'Start recording'}
            </Button>
          )}
          <Button variant="secondary" onClick={handleClear} disabled={status === 'recording'}>
            Clear
          </Button>
          <Button
            variant="secondary"
            onClick={handleDownloadWav}
            disabled={!hasRecording || status === 'recording'}
            title="Save the captured mic audio as a 16 kHz mono WAV for replay"
          >
            Save WAV
          </Button>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <details className="rounded-lg border border-border bg-surface" open>
        <summary className="cursor-pointer p-4 text-sm font-medium text-text-primary">
          AssemblyAI key terms{' '}
          <span className="font-normal text-text-secondary">
            ({keyterms.length} active, max 100)
          </span>
        </summary>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <p className="text-xs text-text-secondary">
            Comma- or newline-separated. Passed as <code className="rounded bg-surface-elevated px-1 py-0.5">keyterms_prompt</code> only on the AssemblyAI side — Gemini Live has no equivalent. Edits apply on the next <em>Start recording</em>. Terms longer than 50 characters are silently dropped.
          </p>
          <textarea
            value={keytermsRaw}
            onChange={e => setKeytermsRaw(e.target.value)}
            disabled={status === 'recording' || status === 'connecting'}
            spellCheck={false}
            rows={5}
            className="min-h-[6rem] w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-text-primary disabled:opacity-60"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
            <span>
              {keyterms.length} term{keyterms.length === 1 ? '' : 's'} accepted
              {keyterms.length === 0 && ' — no boost will be sent'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setKeytermsRaw('')}
                disabled={status === 'recording' || status === 'connecting'}
                className="rounded border border-border px-2 py-1 hover:text-text-primary disabled:opacity-50"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setKeytermsRaw(DEFAULT_KEYTERMS)}
                disabled={status === 'recording' || status === 'connecting'}
                className="rounded border border-border px-2 py-1 hover:text-text-primary disabled:opacity-50"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        </div>
      </details>

      <section className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        <TranscriptPanel
          title="Gemini Live"
          subtitle="Current source for inputTranscription on /practice"
          ready={geminiReady}
          status={status}
          lines={gemini.lines}
        />
        <TranscriptPanel
          title="AssemblyAI U3 Pro"
          subtitle="speech_model=u3-rt-pro, prompt-steered language"
          ready={assemblyReady}
          status={status}
          lines={assembly.lines}
        />
      </section>

      <footer className="text-xs text-text-secondary">
        Speak the same phrase a couple of times. Final-turn lines are bold;
        partials are lighter and may rewrite themselves until the model
        decides the turn ended. Save the WAV if you want to feed the same
        audio into other STT vendors offline.
      </footer>
    </div>
  )
}

interface TranscriptPanelProps {
  title: string
  subtitle: string
  ready: boolean
  status: Status
  lines: TranscriptEntry[]
}

function TranscriptPanel({ title, subtitle, ready, status, lines }: TranscriptPanelProps) {
  const indicator = ready
    ? { label: 'connected', dot: 'bg-green-500' }
    : status === 'connecting'
      ? { label: 'connecting…', dot: 'bg-yellow-500' }
      : { label: 'idle', dot: 'bg-text-secondary/40' }

  return (
    <div className="flex min-h-[24rem] flex-col rounded-lg border border-border bg-surface">
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <p className="text-xs text-text-secondary">{subtitle}</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-text-secondary">
          <span className={`size-2 rounded-full ${indicator.dot}`} />
          {indicator.label}
        </span>
      </header>
      <div className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-text-secondary">Transcripts will appear here once you start recording.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {lines.map(line => (
              <li
                key={line.id}
                className={line.final ? 'text-text-primary' : 'italic text-text-secondary'}
              >
                {line.text || <span className="opacity-60">…</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
