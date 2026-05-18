// lib/assemblyai-stream.ts
//
// Thin wrapper around AssemblyAI's Universal-3 Pro Streaming WebSocket
// (`wss://streaming.assemblyai.com/v3/ws`). Built specifically to be a
// "transcript-only sink" for PCM16 frames captured elsewhere — typically
// the same mic stream that's driving Gemini Live in `lib/voice-agent.ts`.
//
// The choice of AssemblyAI over Gemini's built-in `inputAudioTranscription`
// is the result of the side-by-side comparison run in
// `/debug/transcribe-compare`: with `keyterms_prompt` populated for NZ +
// Rioplatense vocab, AssemblyAI handles the user's accent meaningfully
// better (especially on the NEAR/SQUARE merger and on Spanish words like
// `dale` / `posta`), and is noticeably more stable run-to-run. Gemini
// stays as the conversation engine because its turn-taking, persona
// voice, and NZ-accent TTS output are still the right tool there.
//
// Protocol notes (all hard-won — read before changing):
//
// - The WS expects each binary frame to contain **50–1000ms of audio**.
//   Send anything shorter (our PCM worklet emits ~8ms quanta, which is
//   fine for Gemini) and the server closes with WebSocket code 3007
//   "Input duration violation". `pushPcm` accumulates samples into 100ms
//   chunks before sending — comfortably mid-window.
// - Universal-3 Pro Streaming silently ignores `language_code`. To steer
//   the transcription language we prepend `Transcribe English.` /
//   `Transcribe Spanish.` to the default prompt via the `prompt` query
//   parameter, per AssemblyAI's documented workaround.
// - `keyterms_prompt` is passed as a JSON-encoded array of strings on the
//   query string. Max 100 terms, each ≤50 chars (we silently enforce
//   both, matching the parser used in the debug page).
// - Auth uses a single-use 60s token minted via /api/assemblyai-stream-
//   token. Never bundle the long-lived API key into the browser.
// - On disconnect, send a `{"type":"Terminate"}` JSON message before
//   closing the WS so sessions are billed only for the recorded duration
//   rather than the full 3-hour idle timeout.
import type { TargetLanguage } from '@/lib/types'
import { log } from '@/lib/logger'

export interface AssemblyAIStreamCallbacks {
  /**
   * Fires on every Turn event from AssemblyAI. `isFinal` true means the
   * server decided the user's utterance ended (punctuation + silence) and
   * this is the formatted final transcript; false means the value is an
   * in-flight partial that will be superseded by a later Turn for the
   * same utterance.
   */
  onTurn: (text: string, isFinal: boolean) => void
  /** Fires once after the WS connection is open and ready to accept PCM. */
  onReady?: () => void
  /** Surfaced WebSocket / token / server errors. */
  onError?: (message: string) => void
}

export interface AssemblyAIStreamOptions {
  language: TargetLanguage
  /**
   * Vocabulary boost — see AssemblyAI's keyterms_prompt docs. Pre-filtered
   * for the documented limits (≤100 terms, ≤50 chars each); duplicates
   * are dropped case-insensitively. Defaults to the curated NZ +
   * Rioplatense + voseo list below.
   */
  keyterms?: string[]
}

export interface AssemblyAIStream {
  /**
   * Push a chunk of PCM16 samples (16 kHz, mono) into the stream. Internally
   * buffers until ≥1600 samples (100ms) have accumulated, then flushes as a
   * single binary frame. The samples are copied — caller is free to reuse
   * the underlying buffer immediately.
   */
  pushPcm: (samples: Int16Array) => void
  /**
   * Tear down the stream. Sends Terminate, closes the WS, drops any buffered
   * sub-50ms chunk. Idempotent.
   */
  disconnect: () => void
}

/**
 * Curated default vocabulary boost for the practice surface. Derived from
 * the misses we saw in the side-by-side comparison runs against real NZ-
 * accented Spanish + English audio. Falls naturally into three buckets:
 *
 *  - NZ vocabulary / idioms the base model doesn't know (bach, sweet as,
 *    yeah nah)
 *  - Māori place names + common loanwords that AssemblyAI's training data
 *    doesn't reliably contain at recognition strength
 *  - Rioplatense slang + voseo conjugations — voseo (`vos sabés`, `podés`,
 *    etc.) is the defining grammatical feature of Argentinian Spanish and
 *    without the boost AssemblyAI tends to castellanise it
 *    (`podés` → `puedes`).
 *
 * Extend freely — but keep the total under 100 entries (AssemblyAI's hard
 * limit). The `prepareKeyterms` function below silently enforces this and
 * the 50-character-per-term cap.
 */
const DEFAULT_PRACTICE_KEYTERMS = [
  // Kiwi idioms / NZ vocab
  'bach', 'sweet as', 'mean feed', 'yeah nah', 'ay', 'bro', 'Kiwi',
  // Māori place names + common loanwords
  'Aotearoa', 'Tekapo', 'Taupō', 'Whakatāne', 'Wanaka', 'Ōamaru',
  'Whangārei', 'Tauranga', 'Rotorua', 'Wellington', 'Auckland',
  'Christchurch', 'kia ora', 'kai', 'whānau', 'Pākehā', 'marae',
  // Rioplatense slang
  'ché', 'vos', 'boludo', 'pibe', 'mina', 'laburo', 'quilombo',
  'bárbaro', 'plata', 'bondi', 'fiaca', 'posta', 'copado', 'dale',
  'boliche', 'porteño', 'rioplatense',
  // Voseo conjugations — the diagnostic forms AssemblyAI tends to lose
  'sos', 'tenés', 'hacés', 'sabés', 'podés', 'querés', 'decís', 'vivís',
  'hablás', 'andás', 'hagás', 'vení', 'mirá', 'contás', 'pensás',
]

/** Returns the default keyterms list — exported so the debug surface and
 *  any future settings UI can pre-populate the same list without
 *  duplicating it. */
export function getDefaultPracticeKeyterms(): string[] {
  return [...DEFAULT_PRACTICE_KEYTERMS]
}

/** Normalise + cap user-provided keyterms. Drops empties, dedupes
 *  case-insensitively, enforces ≤50 chars per term and ≤100 total. */
function prepareKeyterms(input: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const candidate of input) {
    const trimmed = candidate.trim()
    if (!trimmed) continue
    if (trimmed.length > 50) continue
    if (seen.has(trimmed.toLowerCase())) continue
    seen.add(trimmed.toLowerCase())
    out.push(trimmed)
    if (out.length >= 100) break
  }
  return out
}

/** AssemblyAI's WS expects between 50 and 1000ms of audio per binary frame.
 *  1600 samples at 16 kHz = 100ms — well inside the window with safety
 *  margin on both ends. */
const CHUNK_SAMPLES = 1600

/** Prompt-based language steer. Universal-3 Pro Streaming silently ignores
 *  `language_code`; prepending `Transcribe <Language>.` to the default
 *  prompt is the documented workaround. */
function languagePrompt(language: TargetLanguage): string {
  const langWord = language === 'en-NZ' ? 'English' : 'Spanish'
  return `Transcribe ${langWord}. Transcribe verbatim with standard punctuation. Include filler words and incomplete utterances.`
}

const WS_BASE = 'wss://streaming.assemblyai.com/v3/ws'

/**
 * Open a Universal-3 Pro Streaming session. Returns a handle once the
 * token mint succeeds and the WebSocket OPENs — but transcript events
 * arrive asynchronously via `callbacks.onTurn`, so callers should treat
 * the returned object as a stream sink, not a request/response.
 *
 * On any setup failure the promise rejects with a descriptive message.
 */
export async function connectAssemblyAIStream(
  callbacks: AssemblyAIStreamCallbacks,
  options: AssemblyAIStreamOptions,
): Promise<AssemblyAIStream> {
  const tokenRes = await fetch('/api/assemblyai-stream-token')
  if (!tokenRes.ok) {
    throw new Error('Failed to mint AssemblyAI streaming token')
  }
  const { token } = (await tokenRes.json()) as { token: string }

  const url = new URL(WS_BASE)
  url.searchParams.set('sample_rate', '16000')
  url.searchParams.set('speech_model', 'u3-rt-pro')
  url.searchParams.set('prompt', languagePrompt(options.language))
  const keyterms = prepareKeyterms(options.keyterms ?? DEFAULT_PRACTICE_KEYTERMS)
  if (keyterms.length > 0) {
    url.searchParams.set('keyterms_prompt', JSON.stringify(keyterms))
  }
  url.searchParams.set('token', token)

  return new Promise<AssemblyAIStream>((resolve, reject) => {
    let resolved = false
    let disposed = false

    const ws = new WebSocket(url.toString())
    ws.binaryType = 'arraybuffer'

    // Sub-100ms buffer of samples not yet flushed to the WS.
    const chunkBuffer: Int16Array[] = []
    let chunkSampleCount = 0

    function pushPcm(samples: Int16Array) {
      if (disposed) return
      if (ws.readyState !== WebSocket.OPEN) return
      // Copy at the boundary — we hold these samples across multiple
      // worklet ticks while the chunk fills, and the caller is free to
      // reuse `samples` immediately on return.
      const copy = new Int16Array(samples)
      chunkBuffer.push(copy)
      chunkSampleCount += copy.length
      if (chunkSampleCount < CHUNK_SAMPLES) return
      const merged = new Int16Array(chunkSampleCount)
      let offset = 0
      for (const frame of chunkBuffer) {
        merged.set(frame, offset)
        offset += frame.length
      }
      ws.send(merged.buffer)
      chunkBuffer.length = 0
      chunkSampleCount = 0
    }

    function disconnect() {
      if (disposed) return
      disposed = true
      chunkBuffer.length = 0
      chunkSampleCount = 0
      if (ws.readyState === WebSocket.OPEN) {
        // Terminate so the session is billed for actual recorded duration
        // rather than running on AssemblyAI's side until inactivity timeout.
        try { ws.send(JSON.stringify({ type: 'Terminate' })) } catch { /* ignore */ }
      }
      if (ws.readyState <= WebSocket.OPEN) {
        try { ws.close() } catch { /* ignore */ }
      }
    }

    ws.addEventListener('open', () => {
      // Universal-3 Pro Streaming uses connection-param config exclusively
      // — there's no setup message to send. Server immediately accepts
      // binary frames + JSON control messages.
      if (resolved || disposed) return
      resolved = true
      callbacks.onReady?.()
      resolve({ pushPcm, disconnect })
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
        const transcript = ((msg.transcript as string | undefined) ?? '').trim()
        // Drop empty partials — they'd produce a "…" bubble that flickers
        // back to a real partial 200ms later. PracticeClient inserts its
        // own placeholder driven by Gemini's onModelTurnStart instead.
        if (!transcript) return
        const endOfTurn = Boolean(msg.end_of_turn)
        callbacks.onTurn(transcript, endOfTurn)
      } else if (type === 'Error') {
        const message = (msg.error as string | undefined) ?? 'AssemblyAI server error'
        log.error('AssemblyAI stream error', { message })
        callbacks.onError?.(message)
      }
      // Begin / Termination messages are informational; we don't surface them.
    })

    ws.addEventListener('close', (ev: CloseEvent) => {
      if (!resolved) {
        const reason = ev.reason || `close code ${ev.code}`
        reject(new Error(`AssemblyAI WebSocket closed before ready: ${reason}`))
        return
      }
      if (!disposed) {
        // Unexpected close after we'd already handed the stream to the
        // caller — surface as error so PracticeClient can decide how to
        // recover (typically: keep Gemini running, log the gap, the next
        // utterance simply won't render in the user bubble until reconnect).
        callbacks.onError?.(`AssemblyAI WS closed unexpectedly (code ${ev.code})`)
      }
    })

    ws.addEventListener('error', () => {
      if (!resolved) {
        reject(new Error('AssemblyAI WebSocket error during setup'))
        return
      }
      callbacks.onError?.('AssemblyAI WebSocket error')
    })
  })
}
