// components/PracticeClient.tsx
//
// The 5-minute Spanish conversation session UI. Rendered in-place by the
// Practise home (`<PractiseClient>`) when the user taps Call or Chat — there
// is no longer a standalone `/practice` route. State machine:
//
//   loading → incoming → connecting → active/warning/ending → review → analysing → ready
//                                                                 ↗ connecting (resume)
//                                                                 ↘ home via onExit() (discard / no speech)
//                                                                          ↘ error
//
// Call mode mounts in `loading` — the persona is fetched here so the
// post-answer `connecting` beat only waits for the Gemini WebSocket
// handshake. Once ready, transitions to `incoming` (the iOS-style ringing
// screen). Tapping Answer opens the WebSocket; the persona speaks first
// once active (opener delivered via the call-start trigger). Tapping
// Decline returns to the home doors. Reroll routes back through `loading`
// → `incoming` so every new caller gets the full ring experience and the
// persona fetch runs before the user sees the ring screen.
// Chat mode skips `loading` and `incoming`, starting at `connecting`.
//
// Mode is passed in as a prop (caller decides chat vs. call). Whenever the
// session would otherwise return to a picker / idle screen — discard, end
// with no turns, error retry with nothing recorded, fatal reroll failure —
// the component calls `onExit()` and the parent re-renders the home doors.
//
// Audio-reactive feedback uses a RAF tick + RMS decay loop feeding
// AudioReactiveDots.
//
// Active-state choreography (timer-driven):
//   T-60s: 4-min warning toast — "1 minute left"
//   T-30s: meter fill colour shifts from accent-primary → pill-amber
//   T=0:   transition through 'ending' state for 1.5s with wrap-up copy,
//          then auto-end → review
//
// Manual end skips the 'ending' beat — the user clicked the button, the
// ceremonial wrap-up is auto-end-only.
//
// Review state — both manual and auto-end land here. The user confirms
// whether to save (→ analysing) or discard (→ onExit → home).
// beforeunload guard covers review + analysing so navigating away warns.
//
// Keyboard shortcuts:
//   Escape → endSession (also declines from the incoming screen)
//   Space  → toggleMute
//
// On unmount the agent disconnects, all timers clear, and the wake lock
// (if held) releases.
'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from '@/components/LanguageProvider'
import {
  connect,
  buildPracticeSystemPrompt,
  buildResumeSystemPrompt,
  FLASH_LIVE_MODEL,
  CALL_OPENING_TRIGGER,
} from '@/lib/voice-agent'
import { connectAssemblyAIStream, type AssemblyAIStream } from '@/lib/assemblyai-stream'
import { buildPersonaSystemPrompt } from '@/lib/persona'
import { playRingtone, type Ringtone } from '@/lib/ringtone'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { AudioReactiveDots } from '@/components/AudioReactiveDots'
import { LoadingScreen } from '@/components/LoadingScreen'
import { ProcessingGraphic } from '@/components/ProcessingGraphic'
import type { TargetLanguage, TranscriptTurn } from '@/lib/types'
import type { VoiceAgent } from '@/lib/voice-agent'
import type { Persona } from '@/lib/persona'
import type { VoiceTickCallback } from '@/components/AudioReactiveDots'

/** Mode selected on the home doors — call (caller persona) or chat
 *  (coach-led back-and-forth). Reroll only applies to call mode. */
export type PracticeMode = 'chat' | 'call'

// `'loading'` is the brief pre-ring state in call mode — the persona is
// fetched here before the incoming screen appears so there's no wait after
// the user taps Answer. `'incoming'` is the iOS-style ringing screen shown
// once the persona is ready. Chat mode skips both and goes straight to
// `'connecting'`.
type PracticeState =
  | 'loading' | 'incoming' | 'connecting'
  | 'active' | 'warning' | 'ending'
  | 'review' | 'analysing' | 'error'

const SHORTCUT_HINT_KEY = 'cc:practice-shortcut-hint-seen'
const SHORTCUT_HINT_LIMIT = 3

/** Max rerolls per call session. Stops mash-the-reroll loops and gives
 *  callers gravity ("I should commit to this person"). Reroll = full
 *  reset of timer + transcript — agreed UX behaviour. */
const REROLL_MAX = 3

interface Props {
  targetLanguage: TargetLanguage
  /** Mode the parent chose on the home doors. Drives initial connect path:
   *  'call' goes through ringing + persona fetch; 'chat' connects directly. */
  mode: PracticeMode
  /** Called whenever the session ends without saving — discard, end with no
   *  speech, fatal connection error before any turns. Parent uses this to
   *  return to the doors view. */
  onExit: () => void
  /** Optional topic to seed the Coach's opening question (chat mode only).
   *  Set when the user taps a starter chip on the home screen. Appended to
   *  the system prompt so the Coach opens with a natural question about it. */
  starterTopic?: string
}

const TOTAL_SECONDS = 300        // 5 min hard cap
const WARN_SECONDS = 240         // 1-min warning toast at 4 min
const COLOR_SHIFT_SECONDS = 270  // meter colour shift at T-30s
const ENDING_HOLD_MS = 1500      // wrap-up beat duration before auto-end
const RMS_DECAY = 0.85
const RMS_FLOOR = 0.004
// LIVE_CAPTION_TURNS removed — all turns are shown in the scrollable transcript

export function PracticeClient({ targetLanguage, mode, onExit, starterTopic }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  // First state shown is mode-dependent — 'loading' for call (persona fetch
  // runs here so the incoming screen appears already-ready; after fetch
  // transitions to 'incoming'), 'connecting' for chat (compact spinner;
  // connect kicks off immediately). Both eventually reach 'active' once the
  // WebSocket reports setupComplete; call mode passes through 'connecting'
  // after the user taps Answer.
  const [practiceState, setPracticeState] = useState<PracticeState>(
    mode === 'call' ? 'loading' : 'connecting',
  )
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [voiceStatus, setVoiceStatus] = useState<'listening' | 'speaking' | 'muted'>('listening')
  // True while a resume reconnect is in flight. Keeps practiceState at
  // 'review' (no full-screen loader) and shows a spinner on the Continue
  // button instead.
  const [isResuming, setIsResuming] = useState(false)
  const [liveTurns, setLiveTurns] = useState<TranscriptTurn[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [showShortcutHint, setShowShortcutHint] = useState(false)

  // The active call session's persona — set when call-mode connect succeeds,
  // cleared on session end. Currently used only for system-prompt context and
  // potential logging; future: caller-ID UI on ringing screen.
  const [persona, setPersona] = useState<Persona | null>(null)
  // Rerolls remaining for this call session. Resets to REROLL_MAX whenever
  // a fresh call begins (NOT preserved across review → resume). At zero, the
  // "Try another line" pill hides.
  const [rerollsLeft, setRerollsLeft] = useState(REROLL_MAX)
  // Guard against double-tapping reroll while the persona fetch + reconnect
  // is in flight. Prevents spawning two parallel WebSockets.
  const [isRerolling, setIsRerolling] = useState(false)

  const agentRef = useRef<VoiceAgent | null>(null)
  // Parallel STT (AssemblyAI Universal-3 Pro Streaming) — sources the
  // displayed user-bubble text. Gemini Live still drives the conversation
  // (turn detection, agent response, persona, TTS); the mic frames are
  // teed via `onMicPcm` so both engines see the same audio. See the
  // /debug/transcribe-compare experiment for the decision history —
  // AssemblyAI handles NZ-accented Spanish + English meaningfully better
  // than Gemini's built-in inputAudioTranscription.
  const assemblyStreamRef = useRef<AssemblyAIStream | null>(null)
  // Index into `turnsRef.current` of the in-flight user bubble (the one
  // being filled by AssemblyAI partials and finals). Null between turns.
  // Drives both the "…" placeholder lifecycle and the AssemblyAI partial-
  // to-final replacement.
  const placeholderTurnIndexRef = useRef<number | null>(null)
  // True once any user-role bubble (partial, final, OR placeholder) has been
  // emitted in the *current* exchange. Prevents Gemini's `onModelTurnStart`
  // from inserting a stranded second placeholder once AssemblyAI has
  // already surfaced a bubble for the same utterance. Reset on `onTurnComplete`.
  const userBubbleEmittedThisTurnRef = useRef(false)
  // True if the user has produced any audible mic input (RMS above the
  // ambient floor) since the last `onTurnComplete`. Distinguishes a real
  // user utterance from a model-initiated turn (call-mode opener,
  // unprompted follow-up) — only the former should trigger a "…"
  // placeholder when `onModelTurnStart` fires.
  const userAudibleSinceLastTurnRef = useRef(false)
  const turnsRef = useRef<TranscriptTurn[]>([])
  const frozenTurnsRef = useRef<TranscriptTurn[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  // Stable ref so effects below can fire onExit without re-binding when the
  // parent passes a fresh function on every render.
  const onExitRef = useRef(onExit)
  useEffect(() => { onExitRef.current = onExit }, [onExit])
  // Break circular dep: startTimer → endSession → startTimer
  const endSessionRef = useRef<() => void>(() => {})

  // Audio-reactive plumbing — AudioReactiveDots subscribes to this callback set.
  const userRmsRef = useRef(0)
  const agentRmsRef = useRef(0)
  const audioTickCallbacksRef = useRef<Set<VoiceTickCallback>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastSpeakerRef = useRef<'user' | 'agent' | 'idle'>('idle')

  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  // Handle to the active ringtone (if any). Held in a ref because the
  // ringtone's start/stop lifecycle is driven by an effect that reads
  // practiceState, not by any render output — and we want one persistent
  // handle across re-renders, not a fresh one per render.
  const ringtoneRef = useRef<Ringtone | null>(null)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      agentRef.current?.disconnect()
      // Same idempotent disconnect pattern as the agent — covers all
      // unmount paths (parent flipping back to doors, route change, dev
      // strict-mode double-invoke). Mirror of the cleanup in onStateChange
      // ('ended') and onError.
      assemblyStreamRef.current?.disconnect()
      assemblyStreamRef.current = null
      placeholderTurnIndexRef.current = null
      if (timerRef.current) clearInterval(timerRef.current)
      if (endingTimeoutRef.current) clearTimeout(endingTimeoutRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      wakeLockRef.current?.release()
      wakeLockRef.current = null
      // Defence-in-depth — the ringtone effect's own cleanup should have
      // run already (practiceState transitions and unmount both fire it),
      // but if the component is torn down while the ringtone is somehow
      // still playing we'd leak the AudioContext + oscillators. stop() is
      // idempotent, so the redundant call is harmless.
      ringtoneRef.current?.stop()
      ringtoneRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!window.matchMedia('(min-width: 768px)').matches) return
    try {
      const seen = parseInt(window.localStorage.getItem(SHORTCUT_HINT_KEY) || '0', 10)
      setShowShortcutHint(seen < SHORTCUT_HINT_LIMIT)
      window.localStorage.setItem(SHORTCUT_HINT_KEY, String(seen + 1))
    } catch {
      setShowShortcutHint(true)
    }
  }, [])

  // Lock body scroll while a live session is running. Body uses
  // min-h-[100dvh] which lets it grow with content — without this lock
  // the flex chain never gets a definite height and the chat can push the
  // controls off-screen. Mirrors the pattern used by modals/overlays.
  // Connecting / analysing / error states render compact centered cards
  // and keep the body scrollable.
  useEffect(() => {
    const isLive =
      practiceState === 'active' ||
      practiceState === 'warning' ||
      practiceState === 'ending' ||
      practiceState === 'review' ||
      practiceState === 'incoming'
    if (isLive) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [practiceState])

  // Ringtone lifecycle — plays through both `incoming` (initial answer
  // screen) and `ringing` (the brief reroll connect beat) so the audible
  // signal carries the "incoming call" metaphor everywhere the visual
  // ring choreography does. Stops the moment we leave those states (user
  // taps Answer or Decline, reroll completes into `connecting`, or the
  // component unmounts via discard / strict-mode double-invoke).
  //
  // The component mounted via a click on the home door — that's the
  // user-gesture context the browser needs to allow AudioContext output,
  // and React's commit + effect dispatch happen within the transient
  // activation window. If the browser still blocks playback, playRingtone
  // returns a no-op handle and we silently degrade — the ring screen is
  // already telling the story visually, and a silent ringtone is better
  // than an unhandled rejection on every call mount.
  useEffect(() => {
    const shouldRing = practiceState === 'incoming'
    if (!shouldRing) return
    try {
      ringtoneRef.current = playRingtone()
    } catch {
      ringtoneRef.current = null
    }
    return () => {
      ringtoneRef.current?.stop()
      ringtoneRef.current = null
    }
  }, [practiceState])

  // Warn on browser navigation while unsaved turns exist or analysis is running.
  useEffect(() => {
    if (practiceState !== 'review' && practiceState !== 'analysing') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [practiceState])

  // Auto-dismiss informational toasts after a few seconds. Unlike SessionList
  // / WriteList, Practice's toasts are notifications without an action slot,
  // so they have no natural dismiss interaction — left alone they'd linger
  // across the whole next session (e.g. "Nueva persona en la línea" bleeding
  // into the freshly-connected call).
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  // Keep the screen awake during a 5-minute session — without this the
  // lockscreen kicks in mid-conversation and the mic worklet streams into
  // a closed device.
  useEffect(() => {
    const sessionLive =
      practiceState === 'active' || practiceState === 'warning' || practiceState === 'ending'
    async function acquire() {
      if (!sessionLive || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch {
        // Denied (low battery, etc.) — non-fatal.
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') acquire()
    }
    if (sessionLive) {
      acquire()
      document.addEventListener('visibilitychange', onVisibilityChange)
    } else {
      wakeLockRef.current?.release()
      wakeLockRef.current = null
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [practiceState])

  // RAF tick loop: decay both RMS values, derive who's speaking, fan out
  // to subscribed audio-reactive widgets. Only runs while a session is
  // live; nothing to animate idle/connecting/analysing.
  useEffect(() => {
    const sessionLive =
      practiceState === 'active' || practiceState === 'warning' || practiceState === 'ending'
    if (!sessionLive) {
      userRmsRef.current = 0
      agentRmsRef.current = 0
      return
    }
    function tick() {
      const u = userRmsRef.current
      const a = agentRmsRef.current
      userRmsRef.current = u * RMS_DECAY
      agentRmsRef.current = a * RMS_DECAY

      let speaker: 'user' | 'agent' | 'idle' = 'idle'
      if (!muted) {
        if (a > u && a > RMS_FLOOR) speaker = 'agent'
        else if (u > RMS_FLOOR) speaker = 'user'
      }
      // Throttle React state writes — only flip when speaker changes.
      if (speaker !== lastSpeakerRef.current) {
        lastSpeakerRef.current = speaker
        if (muted) setVoiceStatus('muted')
        else if (speaker === 'agent') setVoiceStatus('speaking')
        else setVoiceStatus('listening')
      }
      audioTickCallbacksRef.current.forEach(cb => cb(u, a, muted))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [practiceState, muted])

  // Scroll chat to bottom whenever a new turn lands.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [liveTurns])

  // Precompute "first bubble for this role" markers so the transcript map
  // doesn't run findIndex per item (O(n²) → O(n)). At 40+ turns the lookup
  // was the hottest thing in this render path.
  const firstOfRoleFlags = useMemo(() => {
    const seen = new Set<TranscriptTurn['role']>()
    return liveTurns.map(turn => {
      if (seen.has(turn.role)) return false
      seen.add(turn.role)
      return true
    })
  }, [liveTurns])

  // Reflect mute toggles in the status row immediately — RAF tick alone
  // won't update if the user is silent at the moment of toggling.
  useEffect(() => {
    if (practiceState === 'active' || practiceState === 'warning' || practiceState === 'ending') {
      setVoiceStatus(muted ? 'muted' : 'listening')
      lastSpeakerRef.current = 'idle'
    }
  }, [muted, practiceState])

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString()
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const remainingSecs = Math.max(0, TOTAL_SECONDS - elapsed)
  const progress = Math.min(1, elapsed / TOTAL_SECONDS)
  const inFinalStretch = elapsed >= COLOR_SHIFT_SECONDS

  const startTimer = useCallback((fromSecs = 0) => {
    let count = fromSecs
    timerRef.current = setInterval(() => {
      count++
      if (!isMountedRef.current) return
      setElapsed(count)
      if (count === WARN_SECONDS) {
        setPracticeState('warning')
        setToast(t('practice.warningToast'))
      }
      if (count >= TOTAL_SECONDS) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        // Auto-end runs through the wrap-up beat first — gives the agent
        // and the user 1.5s to settle visually before the review prompt.
        setPracticeState('ending')
        endingTimeoutRef.current = setTimeout(() => {
          endingTimeoutRef.current = null
          endSessionRef.current()
        }, ENDING_HOLD_MS)
      }
    }, 1000)
  }, [t])

  /** AssemblyAI Turn handler. One bubble per user utterance, regardless
   *  of how many partials it receives — `placeholderTurnIndexRef` tracks
   *  the in-flight slot. The slot exists until either (a) we get a final
   *  (then locked + ref cleared) or (b) `onTurnComplete` cleans up a
   *  stranded placeholder. Empty turns are filtered upstream so we only
   *  ever see meaningful text here. */
  const handleAssemblyAITurn = useCallback((text: string, isFinal: boolean) => {
    if (!isMountedRef.current) return
    if (placeholderTurnIndexRef.current !== null) {
      // Update the in-flight bubble (placeholder from onModelTurnStart, or
      // a partial from a previous AssemblyAI tick). Partials → partials →
      // final all flow into the same slot, replacing text in place. Spread
      // to a fresh array reference so React re-renders the list.
      const idx = placeholderTurnIndexRef.current
      const next = [...turnsRef.current]
      next[idx] = { ...next[idx], text, pending: !isFinal }
      turnsRef.current = next
      setLiveTurns(next)
      if (isFinal) placeholderTurnIndexRef.current = null
    } else {
      // No in-flight bubble — first AssemblyAI event of this turn AND no
      // placeholder was pre-emitted by onModelTurnStart. Common case for
      // normal-length utterances where AssemblyAI's first partial beats
      // Gemini's end-of-turn VAD.
      const turn: TranscriptTurn = {
        role: 'user', text, wallMs: Date.now(), pending: !isFinal,
      }
      turnsRef.current = [...turnsRef.current, turn]
      setLiveTurns(turnsRef.current)
      if (!isFinal) placeholderTurnIndexRef.current = turnsRef.current.length - 1
    }
    userBubbleEmittedThisTurnRef.current = true
  }, [])

  /** Gemini "model just started replying" callback — drops a "…"
   *  placeholder for the user's bubble when:
   *    1. The user has actually spoken this cycle (RMS above floor).
   *    2. No user bubble has been emitted yet for this cycle (otherwise
   *       AssemblyAI already surfaced one and the placeholder would be a
   *       stranded duplicate).
   *    3. No partial bubble is currently in flight (otherwise it IS the
   *       placeholder already).
   *
   *  Skipping conditions 1–3 was the source of two regressions visible in
   *  the May 18 screenshot: model-initiated turns (call openers) gained a
   *  stranded "…" bubble, and AssemblyAI's in-flight partial got
   *  prematurely promoted to final (rendering as two bubbles for the
   *  same utterance — e.g. "I'll try—" then "I'll try."). */
  const handleModelTurnStart = useCallback(() => {
    if (!isMountedRef.current) return
    if (!userAudibleSinceLastTurnRef.current) return
    if (userBubbleEmittedThisTurnRef.current) return
    if (placeholderTurnIndexRef.current !== null) return
    const turn: TranscriptTurn = {
      role: 'user', text: '', wallMs: Date.now(), pending: true,
    }
    turnsRef.current = [...turnsRef.current, turn]
    placeholderTurnIndexRef.current = turnsRef.current.length - 1
    userBubbleEmittedThisTurnRef.current = true
    setLiveTurns(turnsRef.current)
  }, [])

  /** End-of-exchange cleanup — fires once Gemini reports `turnComplete`
   *  (model finished its reply). Two responsibilities:
   *    1. Settle any in-flight placeholder. If it has partial text, lock
   *       it as final so it doesn't render italic indefinitely. If it's
   *       still empty, drop the bubble — AssemblyAI never delivered for
   *       this exchange (rare; usually a very-short utterance that
   *       AssemblyAI didn't pick up, or a model-initiated cycle where the
   *       user-audible signal misfired).
   *    2. Reset the per-cycle flags so the next user turn starts clean. */
  const handleTurnComplete = useCallback(() => {
    if (!isMountedRef.current) return
    if (placeholderTurnIndexRef.current !== null) {
      const idx = placeholderTurnIndexRef.current
      const old = turnsRef.current[idx]
      const next = [...turnsRef.current]
      if (!old.text.trim()) {
        next.splice(idx, 1)
      } else {
        next[idx] = { ...old, pending: false }
      }
      turnsRef.current = next
      setLiveTurns(next)
      placeholderTurnIndexRef.current = null
    }
    userBubbleEmittedThisTurnRef.current = false
    userAudibleSinceLastTurnRef.current = false
  }, [])

  /** Tears down the AssemblyAI side independently of Gemini. Called from
   *  every place the Gemini agent gets disconnected so the two stay in
   *  step — unmount, endSession, reconnect, error paths. Safe to call
   *  multiple times; the underlying disconnect is idempotent. */
  const disconnectAssemblyAI = useCallback(() => {
    assemblyStreamRef.current?.disconnect()
    assemblyStreamRef.current = null
    placeholderTurnIndexRef.current = null
    userBubbleEmittedThisTurnRef.current = false
    userAudibleSinceLastTurnRef.current = false
  }, [])

  const submitTurns = useCallback(async (turns: TranscriptTurn[]) => {
    const userTurns = turns.filter(turn => turn.role === 'user')
    if (userTurns.length === 0) {
      setToast(t('practice.errorNoSpeech'))
      // Nothing to analyse — bail back to the home doors so the user can
      // start a fresh session rather than stranding them on a half-collapsed
      // review screen.
      onExitRef.current()
      return
    }
    setPracticeState('analysing')
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
      if (isMountedRef.current) setPracticeState('error')
    }
  }, [t, targetLanguage, router])

  const endSession = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (endingTimeoutRef.current) { clearTimeout(endingTimeoutRef.current); endingTimeoutRef.current = null }
    agentRef.current?.flush()
    agentRef.current?.disconnect()
    agentRef.current = null
    // Disconnect AssemblyAI alongside Gemini. The Terminate frame inside
    // disconnect ensures we're billed for actual recorded duration, not
    // the full idle-timeout window.
    disconnectAssemblyAI()
    // Settle any in-flight user bubble: drop empty placeholders (the user
    // never spoke for that turn — typically a stranded "…" from
    // onModelTurnStart) and lock partial-text bubbles in as final so the
    // review screen doesn't render italic text indefinitely. Doing this
    // here (rather than in submitTurns) means the user sees the same
    // settled transcript on review that they'll save.
    const settled = turnsRef.current
      .filter(turn => !turn.pending || turn.text.trim() !== '')
      .map(turn => turn.pending ? { ...turn, pending: false } : turn)
    turnsRef.current = settled
    setLiveTurns(settled)
    // Nothing was said — skip the save/discard prompt and return to the
    // home doors. The session was effectively a no-op; treating it like a
    // dismiss is the gentlest exit.
    if (settled.length === 0) {
      onExitRef.current()
      return
    }
    frozenTurnsRef.current = [...settled]
    setPracticeState('review')
  }, [disconnectAssemblyAI])

  const confirmSave = useCallback(() => {
    submitTurns(frozenTurnsRef.current)
  }, [submitTurns])

  const discardSession = useCallback(() => {
    onExitRef.current()
  }, [])

  useEffect(() => { endSessionRef.current = endSession }, [endSession])

  // Reconnects from the review state without losing any turns or elapsed time.
  // Restores turnsRef from the frozen snapshot so onTranscript appends correctly.
  // In call mode, preserves the persona's voice + character — without this,
  // resuming a call would drop the persona and the agent would morph into a
  // generic conversation partner mid-flow. The agent waits for the user to
  // resume speaking (same wait-for-greeting pattern as initial connect) rather
  // than re-speaking its introduction; no `openingLine` is passed on resume.
  const resumeSession = useCallback(async () => {
    if (practiceState !== 'review') return
    if (isResuming) return
    const restoredTurns = [...frozenTurnsRef.current]
    const restoredElapsed = elapsed
    const activePersona = mode === 'call' ? persona : null
    turnsRef.current = restoredTurns
    frozenTurnsRef.current = []
    // Keep practiceState at 'review' — the review UI stays visible while
    // reconnecting. isResuming drives a spinner on the Continue button.
    setIsResuming(true)
    setMuted(false)
    const baseSystemPrompt = activePersona
      ? buildPersonaSystemPrompt(buildPracticeSystemPrompt(targetLanguage), activePersona)
      : buildPracticeSystemPrompt(targetLanguage)

    const agentLabel = activePersona
      ? activePersona.name
      : targetLanguage === 'en-NZ' ? 'Coach' : 'Entrenador'

    const systemPrompt = restoredTurns.length > 0
      ? buildResumeSystemPrompt(baseSystemPrompt, restoredTurns, agentLabel)
      : baseSystemPrompt
    try {
      // Drop any leftover AssemblyAI stream from the previous session
      // before opening a fresh one. Order matters: the new stream must be
      // ready BEFORE Gemini starts streaming mic frames, otherwise the
      // first hundred-or-so milliseconds of user audio aren't transcribed.
      disconnectAssemblyAI()
      const assemblyStream = await connectAssemblyAIStream(
        { onTurn: handleAssemblyAITurn },
        { language: targetLanguage },
      )
      assemblyStreamRef.current = assemblyStream
      const agent = await connect(
        targetLanguage,
        {
          onStateChange: (s) => {
            if (!isMountedRef.current) return
            if (s === 'active') {
              setIsResuming(false)
              setPracticeState('active')
              startTimer(restoredElapsed)
            } else if (s === 'ended') {
              if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
              agentRef.current = null
              disconnectAssemblyAI()
            }
          },
          onError: (msg) => {
            if (!isMountedRef.current) return
            const isMic = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
            setToast(isMic ? t('practice.errorMic') : t('practice.errorConnect'))
            setIsResuming(false)
            disconnectAssemblyAI()
            // Restore review state so the user can still save what they had.
            frozenTurnsRef.current = restoredTurns
            setPracticeState('review')
          },
          onUserAudio: (rms) => {
            userRmsRef.current = Math.max(userRmsRef.current, rms)
            // Once the floor is crossed in a given exchange, latch the
            // flag — it gates whether onModelTurnStart inserts a "…"
            // placeholder, so we want to err on "user did speak". Reset
            // happens at `onTurnComplete`.
            if (rms > RMS_FLOOR) userAudibleSinceLastTurnRef.current = true
          },
          onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
          // Tee mic PCM into AssemblyAI in parallel with Gemini. The push
          // is non-blocking (it just memcopies into a 100ms-chunk buffer)
          // so Gemini's send-path cadence is unchanged.
          onMicPcm: (samples) => assemblyStreamRef.current?.pushPcm(samples),
          onModelTurnStart: handleModelTurnStart,
          onTurnComplete: handleTurnComplete,
          onTranscript: (role, text) => {
            if (!isMountedRef.current) return
            // With `inputTranscription: false` Gemini only emits model
            // turns. Ignore any stray user-role transcript defensively.
            if (role !== 'model') return
            const turn: TranscriptTurn = { role, text, wallMs: Date.now() }
            turnsRef.current = [...turnsRef.current, turn]
            setLiveTurns(turnsRef.current)
          },
        },
      {
        transcription: true,
        // Source the user-bubble text from AssemblyAI Universal-3 Pro
        // instead of Gemini's `inputTranscription`. Model bubble still
        // comes from Gemini's outputTranscription.
        inputTranscription: false,
        systemPrompt,
        // Both modes are on the flash-live model — call mode used to pin
        // NATIVE_AUDIO_MODEL for richer intonation but the end-of-turn pauses
        // made personas feel sluggish vs. chat. Same model = same voice
        // timbre on resume, which is what matters here.
        model: FLASH_LIVE_MODEL,
        voiceName: activePersona?.voiceName,
      },
      )
      agentRef.current = agent
    } catch (err) {
      if (!isMountedRef.current) return
      const isPermission = err instanceof DOMException && err.name === 'NotAllowedError'
      setToast(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
      setIsResuming(false)
      disconnectAssemblyAI()
      // Restore review state so the user can still save what they had.
      frozenTurnsRef.current = restoredTurns
      setPracticeState('review')
    }
  }, [practiceState, isResuming, elapsed, mode, persona, targetLanguage, t, startTimer, disconnectAssemblyAI, handleAssemblyAITurn, handleModelTurnStart, handleTurnComplete])

  const toggleMute = useCallback(() => {
    if (!agentRef.current) return
    setMuted(prev => {
      const next = !prev
      agentRef.current?.setMuted(next)
      return next
    })
  }, [])

  // Keyboard shortcuts — Escape ends the session, Space toggles mute.
  // Skip when focus is in any text-entry field.
  const endSessionStableRef = useRef(endSession)
  const toggleMuteStableRef = useRef(toggleMute)
  useEffect(() => { endSessionStableRef.current = endSession }, [endSession])
  useEffect(() => { toggleMuteStableRef.current = toggleMute }, [toggleMute])

  useEffect(() => {
    if (practiceState !== 'active' && practiceState !== 'warning') return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        endSessionStableRef.current()
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        toggleMuteStableRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [practiceState])

  /** Fetch a fresh persona from the server. Returns null on failure (caller
   *  decides how to surface it). Cheap (~1.5s, ~$0.001) — single GET. */
  const fetchPersona = useCallback(async (): Promise<Persona | null> => {
    try {
      const res = await fetch('/api/practice/persona')
      if (!res.ok) return null
      const { persona: p } = await res.json() as { persona: Persona }
      return p
    } catch {
      return null
    }
  }, [])

  /** Core connect helper shared by chat-mode start, call-mode start, and
   *  reroll. Wires all the standard callbacks (RMS, transcript, state) and
   *  hands the persona-specific bits through as connect() options. Also
   *  opens the parallel AssemblyAI stream which sources the user-bubble
   *  text — see `lib/assemblyai-stream.ts`. Throws on failure; caller is
   *  responsible for the error UX (different per flow — chat falls back to
   *  idle, reroll falls back to previous call). */
  const connectAgent = useCallback(async (activePersona: Persona | null): Promise<VoiceAgent> => {
    const basePrompt = activePersona
      ? buildPersonaSystemPrompt(buildPracticeSystemPrompt(targetLanguage), activePersona)
      : buildPracticeSystemPrompt(targetLanguage)
    // Append opener instruction for chat mode. Persona-led (call) sessions
    // don't use this — the persona's own opener already provides a hook.
    // With a starter topic, direct the coach to that topic. Without one,
    // instruct the coach to open with a warm greeting and invite the learner
    // to talk about whatever they'd like.
    const systemPrompt = !activePersona
      ? basePrompt + (starterTopic
          ? (targetLanguage === 'en-NZ'
              ? `\n\nOpen the conversation by asking about: ${starterTopic}. One natural question to get things started.`
              : `\n\nEmpezá la conversación preguntando sobre: ${starterTopic}. Una pregunta natural para arrancar.`)
          : (targetLanguage === 'en-NZ'
              ? `\n\nOpen with exactly two utterances: one short greeting word, then one question. Nothing else — no preamble, no multi-sentence welcome.`
              : `\n\nAbrí con exactamente dos cosas: una palabra de saludo corta, y una sola pregunta. Nada más — sin introducción larga, sin bienvenida de varias oraciones.`))
      : basePrompt

    // Open AssemblyAI BEFORE Gemini so it's ready to accept mic frames the
    // instant voice-agent.ts starts emitting them via onMicPcm. The 100ms
    // chunk buffer means we wouldn't actually lose the very first frame,
    // but reserving the connection up front keeps the cadence honest.
    disconnectAssemblyAI()
    const assemblyStream = await connectAssemblyAIStream(
      { onTurn: handleAssemblyAITurn },
      { language: targetLanguage },
    )
    assemblyStreamRef.current = assemblyStream

    return connect(
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
            disconnectAssemblyAI()
            // Defensive: if 'ended' arrives while still connecting (i.e.
            // the session never reached active), exit back to the home doors
            // so the UI doesn't sit on the connecting screen forever. Voice-
            // agent now routes pre-setup closes through onError, but this
            // catches any edge case onError doesn't cover.
            setPracticeState(prev => {
              if (prev === 'connecting') {
                onExitRef.current()
                return prev
              }
              return prev
            })
          }
        },
        onError: (msg) => {
          if (!isMountedRef.current) return
          const isMic = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
          setToast(isMic ? t('practice.errorMic') : t('practice.errorConnect'))
          disconnectAssemblyAI()
          onExitRef.current()
        },
        onUserAudio: (rms) => {
          userRmsRef.current = Math.max(userRmsRef.current, rms)
          // See the matching comment in `resumeSession`: latch this on
          // the first RMS cross above the floor, reset on turnComplete.
          if (rms > RMS_FLOOR) userAudibleSinceLastTurnRef.current = true
        },
        onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
        // Tee mic PCM into AssemblyAI. Non-blocking memcopy into a 100ms-
        // chunk buffer; Gemini's send-path cadence is unaffected.
        onMicPcm: (samples) => assemblyStreamRef.current?.pushPcm(samples),
        onModelTurnStart: handleModelTurnStart,
        onTurnComplete: handleTurnComplete,
        onTranscript: (role, text) => {
          if (!isMountedRef.current) return
          // User-bubble text comes from AssemblyAI. Gemini's input
          // transcription is disabled in this connect call, but ignore
          // user-role transcripts defensively in case the option ever
          // gets re-enabled and we forget to update this handler.
          if (role !== 'model') return
          const turn: TranscriptTurn = { role, text, wallMs: Date.now() }
          turnsRef.current = [...turnsRef.current, turn]
          setLiveTurns(turnsRef.current)
        },
      },
      {
        transcription: true,
        // User-bubble text is sourced from AssemblyAI Universal-3 Pro via
        // the parallel stream above. We still want Gemini's output
        // transcription for the model bubble, hence transcription: true.
        inputTranscription: false,
        systemPrompt,
        // Both modes use the flash-live model. Call mode previously used
        // NATIVE_AUDIO_MODEL for emotional intonation, but the longer
        // end-of-turn pauses made personas feel clunky vs. chat's snappy
        // back-and-forth. Personas still come through via the system prompt
        // + matched voice — flash-live carries enough character with those.
        model: FLASH_LIVE_MODEL,
        // Persona-only: matched voice + opening line. The persona speaks
        // first — `openingLine` sends the call-start trigger so the agent
        // delivers its opener the moment the WebSocket is active, before
        // the learner says anything. This mirrors how a real phone call
        // works: the caller identifies themselves when someone picks up.
        voiceName: activePersona?.voiceName,
        // Persona (call mode): speak first with the persona's opener.
        // Chat mode with a starter topic: also speak first — the system
        // prompt already instructs the Coach what to ask about.
        // Chat mode always speaks first (chip or plain CTA); call mode uses persona opener.
        openingLine: activePersona?.opener ?? CALL_OPENING_TRIGGER,
      },
    )
  }, [targetLanguage, t, startTimer, disconnectAssemblyAI, handleAssemblyAITurn, handleModelTurnStart, handleTurnComplete])

  // Initial dispatch — runs exactly once. Cleanup of WebSocket / timers /
  // wake lock lives in the top-level mount effect, so this only kicks off
  // the work — no return cleanup.
  //
  // Chat mode: connect immediately (no ring step).
  // Call mode: fetch the persona first (loading state), then transition to
  // the incoming screen once the persona is ready. This way the post-answer
  // connecting beat only needs to open the WebSocket — the slow Claude call
  // is already done.
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true
    if (mode === 'call') {
      void (async () => {
        try {
          const p = await fetchPersona()
          if (!isMountedRef.current) return
          if (!p) {
            setToast(t('practice.errorConnect'))
            onExitRef.current()
            return
          }
          setPersona(p)
          setPracticeState('incoming')
        } catch {
          if (!isMountedRef.current) return
          setToast(t('practice.errorConnect'))
          onExitRef.current()
        }
      })()
      return
    }
    void (async () => {
      try {
        const agent = await connectAgent(null)
        agentRef.current = agent
      } catch (err) {
        if (!isMountedRef.current) return
        const isPermission = err instanceof DOMException && err.name === 'NotAllowedError'
        setToast(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
        onExitRef.current()
      }
    })()
    // mode is captured at mount and intentionally never re-runs — a mode
    // change would mean a fresh session, which is the parent's job to
    // model by re-mounting this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Answer the incoming call: flip to the connecting beat and open the
   *  WebSocket. The persona is already in state (fetched during 'loading'),
   *  so this only waits for the Gemini handshake — typically <1s. Errors
   *  fall back to the home doors via onExit. */
  const answerCall = useCallback(async () => {
    if (practiceState !== 'incoming') return
    if (!persona) return
    setPracticeState('connecting')
    try {
      const agent = await connectAgent(persona)
      agentRef.current = agent
    } catch (err) {
      if (!isMountedRef.current) return
      const isPermission = err instanceof DOMException && err.name === 'NotAllowedError'
      setToast(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
      onExitRef.current()
    }
  }, [practiceState, persona, connectAgent, t])

  /** Decline the incoming call: straight back to the home doors. The
   *  persona fetch (if still in flight) finishes in the background and
   *  its result is discarded — the component is already unmounting. */
  const declineCall = useCallback(() => {
    onExitRef.current()
  }, [])

  /** "Try another line" — call-mode only. Hangs up the current caller and
   *  routes back through the `incoming` screen for the new caller, so the
   *  user re-rehearses the answer-the-phone moment with every reroll (the
   *  whole point of call mode is practising that micro-moment — auto-
   *  answering rerolls would mean the user only ever practised it once
   *  per session). Tearing down the live agent, wiping the transcript, and
   *  starting a fresh persona fetch happens here; the answer/decline of the
   *  new caller is then handled by the same `answerCall` / `declineCall`
   *  handlers the initial incoming screen uses. Costs one reroll from the
   *  budget at tap-time (declining the new caller still "spent" a reroll —
   *  if the user declines, they exit the session entirely anyway). Pill
   *  hides at zero remaining. */
  const tryAnotherLine = useCallback(() => {
    if (isRerolling) return
    if (mode !== 'call') return
    if (rerollsLeft <= 0) {
      setToast(t('practice.rerollExhaustedToast'))
      return
    }
    // Only meaningful from an active/warning state — review/ending have their
    // own affordances. Block silently if called from elsewhere.
    if (practiceState !== 'active' && practiceState !== 'warning') return

    setIsRerolling(true)
    // Drop any lingering toast so a stale message doesn't bleed onto the
    // incoming screen for the new caller.
    setToast(null)

    // Tear down the live session. flush() isn't useful — we're discarding the
    // transcript anyway. Clear any ending-beat timer too just in case. The
    // agent's dispose() runs synchronously inside disconnect(), which kills
    // scheduled audio playback immediately — without that, the previous
    // persona kept talking over the new one because ws.close is async.
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (endingTimeoutRef.current) { clearTimeout(endingTimeoutRef.current); endingTimeoutRef.current = null }
    agentRef.current?.disconnect()
    agentRef.current = null
    // Drop the AssemblyAI stream too — `answerCall` re-opens a fresh one
    // for the new caller via `connectAgent`. Leaving the previous stream
    // alive would tee the new caller's audio into it and surface bubbles
    // attributed to a hung-up session.
    disconnectAssemblyAI()

    // Full reset — fresh 5-min budget, blank transcript. Matches the
    // metaphor: hang up → another call comes in, start over.
    setMuted(false)
    setElapsed(0)
    setLiveTurns([])
    turnsRef.current = []
    setPersona(null)

    // Decrement at tap-time, not after connect. The act of asking for a
    // new caller IS the spend; if the user declines the new caller they
    // exit the session entirely (consistent with declining the initial
    // call) so the budget bookkeeping is moot in that branch anyway.
    setRerollsLeft(prev => Math.max(0, prev - 1))

    // Fetch the new persona before showing the ring screen — same pattern as
    // the initial call-mode mount. isRerolling stays true until the fetch
    // resolves so double-taps are blocked during the loading beat.
    setPracticeState('loading')
    void (async () => {
      try {
        const p = await fetchPersona()
        if (!isMountedRef.current) return
        if (!p) {
          setToast(t('practice.errorConnect'))
          onExitRef.current()
          return
        }
        setPersona(p)
        setPracticeState('incoming')
      } catch {
        if (!isMountedRef.current) return
        setToast(t('practice.errorConnect'))
        onExitRef.current()
      } finally {
        setIsRerolling(false)
      }
    })()
  }, [isRerolling, mode, rerollsLeft, practiceState, fetchPersona, t, disconnectAssemblyAI])

  // Retry from the error state. If we collected user speech, re-submit;
  // otherwise the connection itself failed before any turns landed — bail
  // back to the home doors so the user can pick a mode and try again
  // (rather than restarting on a dead screen).
  const retry = useCallback(() => {
    if (turnsRef.current.some(turn => turn.role === 'user')) {
      submitTurns([...turnsRef.current])
    } else {
      onExitRef.current()
    }
  }, [submitTurns])

  // ─── Incoming (call mode only) ─────────────────────────────────────────
  // iOS-style incoming-call screen. Persona is already fetched (during
  // 'loading'); tapping Answer opens the WebSocket and transitions through
  // 'connecting' into 'active'. The persona speaks first once active.
  // Decline returns to the home doors. Caller identity is anonymous here —
  // the persona introduces themselves in their opener line.
  if (practiceState === 'incoming') {
    return (
      <div
        className="
          mx-auto w-full max-w-md px-6
          flex flex-col flex-1
          pt-10 pb-8
        "
        role="dialog"
        aria-modal="true"
        aria-labelledby="incoming-caller-name"
      >
        {/* Top block: eyebrow → ringing phone → caller name + hint.
            `space-y` keeps internal rhythm tight; the spacer below pushes
            the call-action row to the bottom of the viewport. */}
        <div className="flex flex-col items-center text-center gap-7">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-tertiary">
            {t('practice.incomingTitle')}
          </p>

          {/* Ringing handset — emerald pulse + shake. Same primitives the
              old `ringing` screen used, just sized up for the dominant
              role they play on this screen. */}
          <div
            className="
              w-28 h-28 rounded-full
              bg-emerald-500/10 dark:bg-emerald-400/10
              flex items-center justify-center
            "
            style={{ animation: reducedMotion ? undefined : 'cc-call-pulse 1.8s ease-out infinite' }}
            aria-hidden="true"
          >
            <span style={{ animation: reducedMotion ? undefined : 'cc-call-shake 1.4s ease-in-out infinite', display: 'inline-flex' }}>
              <Icon
                name="phone"
                className="h-12 w-12 text-emerald-600 dark:text-emerald-400"
              />
            </span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <p
              id="incoming-caller-name"
              className="font-display text-2xl font-medium text-text-primary"
            >
              {persona?.name ?? t('practice.incomingCaller')}
            </p>
            <p className="text-sm text-text-secondary leading-relaxed max-w-[28ch]">
              {t('practice.incomingHint')}
            </p>
          </div>
        </div>

        {/* Spacer — pushes the action row to the bottom of the available
            vertical space the way iOS phone app does. min-h prevents the
            row from collapsing into the caller block on short viewports. */}
        <div className="flex-1 min-h-8" aria-hidden="true" />

        {/* Decline + Answer. Matches the iOS/Android phone-app convention
            (Decline left, Answer right) so the muscle memory carries over.
            Decline reuses rose (same hue family as the in-call Hang Up
            button — destructive read). Answer wears the brand emerald and
            gets a slow, calm pulse to draw the eye without nagging. */}
        <div className="flex items-end justify-center gap-12 sm:gap-16">

          <button
            type="button"
            onClick={declineCall}
            data-testid="incoming-decline"
            aria-label={t('practice.declineAria')}
            className="group flex flex-col items-center gap-1.5 focus-visible:outline-none"
          >
            <div
              className="
                w-16 h-16 rounded-full flex items-center justify-center
                bg-rose-500 text-white
                group-hover:bg-rose-600 group-active:bg-rose-700
                group-focus-visible:ring-2 group-focus-visible:ring-rose-500 group-focus-visible:ring-offset-2
                transition-colors duration-150
              "
            >
              <Icon name="phone-hangup" className="h-6 w-6" />
            </div>
            <span className="text-xs font-medium text-rose-600 dark:text-rose-400 select-none">
              {t('practice.decline')}
            </span>
          </button>

          <button
            type="button"
            onClick={answerCall}
            data-testid="incoming-answer"
            aria-label={t('practice.answerAria')}
            className="group flex flex-col items-center gap-1.5 focus-visible:outline-none"
          >
            <div
              className="
                w-16 h-16 rounded-full flex items-center justify-center
                bg-emerald-500 text-white
                group-hover:bg-emerald-600 group-active:bg-emerald-700
                group-focus-visible:ring-2 group-focus-visible:ring-emerald-500 group-focus-visible:ring-offset-2
                transition-colors duration-150
              "
              style={{ animation: reducedMotion ? undefined : 'cc-call-pulse 2.2s ease-out infinite' }}
            >
              <Icon name="phone" className="h-6 w-6" />
            </div>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 select-none">
              {t('practice.answer')}
            </span>
          </button>
        </div>
      </div>
    )
  }

  // ─── Loading (call mode only — persona fetch) ──────────────────────────
  // Brief pre-ring beat while the Claude persona is being generated
  // (~1-2s). Keeping the persona fetch here means the post-answer
  // connecting beat only waits for the Gemini WebSocket handshake, not
  // the full Claude round-trip.
  if (practiceState === 'loading') {
    return <LoadingScreen />
  }

  // ─── Connecting ────────────────────────────────────────────────────────
  // Brief pre-flight before Gemini's setupComplete fires. In call mode
  // this only waits for the WebSocket handshake (~<1s) since the persona
  // was fetched during 'loading'. The analysing screen below keeps the
  // waveform-to-line graphic; connecting borrows the generic robot loader.
  if (practiceState === 'connecting') {
    return <LoadingScreen />
  }

  // ─── Analysing ─────────────────────────────────────────────────────────
  // Same consolidated processing layout as the upload pipeline's status
  // screen — one shared visual for "we're working on it" across the app.
  if (practiceState === 'analysing') {
    return (
      <div
        className="
          mx-auto w-full max-w-md px-6
          flex flex-col items-center justify-center flex-1
          gap-6 text-center
        "
        role="status"
        aria-live="polite"
      >
        <ProcessingGraphic label={t('practice.analysing')} />
        <p className="text-sm text-text-tertiary max-w-[32ch] leading-relaxed">
          {t('practice.analysingHint')}
        </p>
      </div>
    )
  }

  // ─── Error ─────────────────────────────────────────────────────────────
  if (practiceState === 'error') {
    const hasTurns = turnsRef.current.some(turn => turn.role === 'user')
    return (
      <div
        className="
          mx-auto w-full max-w-md px-6
          flex flex-col items-center justify-center flex-1
          gap-6 text-center
        "
      >
        <p className="text-base text-text-secondary">{t('practice.errorAnalysis')}</p>
        <Button onClick={retry}>
          {hasTurns ? t('practice.tryAgain') : t('practice.startOver')}
        </Button>
      </div>
    )
  }

  // ─── Active / Warning / Ending / Review ────────────────────────────────
  const isEnding = practiceState === 'ending'
  const isReview = practiceState === 'review'
  const statusLabel = isEnding
    ? t('practice.endingState')
    : voiceStatus === 'muted' ? t('practice.statusMuted')
    : null

  return (
    // position:fixed anchors us to the real viewport regardless of the flex
    // chain. body uses min-h-[100dvh] (not a definite height), so flex-1 +
    // min-h-0 inside main never gets a bounded size to scroll within.
    // Fixed positioning with CSS-variable coordinates is the reliable escape.
    <div
      className="fixed flex flex-col bg-bg overflow-hidden z-10"
      style={{
        top: 'calc(var(--header-height) + env(safe-area-inset-top))',
        left: 0,
        right: 0,
        bottom: 'var(--bottom-nav-h)',
      }}
    >

      {/* ── Top bar: progress rail + countdown ──────────────────────────────
          Anchored. ScaleX on the fill is GPU-accelerated (no layout thrash).
          Colour shifts from accent-primary → pill-amber in the final 30s —
          a deliberate emotional cue, not a flicker. In review the bar
          freezes at full (scaleX 1) and the timer shows session duration. */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-border-subtle flex-shrink-0">
        <div
          className="h-1 flex-1 rounded-full bg-border-subtle overflow-hidden"
          role="progressbar"
          aria-valuenow={isReview ? 100 : Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={isReview
            ? t('practice.timerAriaElapsed', { time: formatTime(elapsed) })
            : t('practice.timerAria', { time: formatTime(remainingSecs) })
          }
        >
          <div
            className="h-full w-full origin-left bg-accent-primary"
            style={{
              transform: isReview ? 'scaleX(1)' : `scaleX(${progress})`,
              transition: isReview
                ? 'transform 600ms var(--ease-out-quart)'
                : 'transform 1000ms linear, background-color 700ms var(--ease-out-quart)',
            }}
          />
        </div>
        <span
          className={`text-sm tabular-nums font-medium select-none transition-colors duration-700 ${!isReview && inFinalStretch ? 'text-pill-amber' : 'text-text-secondary'}`}
          aria-hidden="true"
        >
          {isReview ? formatTime(elapsed) : t('practice.timeRemaining', { time: formatTime(remainingSecs) })}
        </span>
      </div>

      {/* ── Scrollable transcript ────────────────────────────────────────────
          All turns. Auto-scrolls to bottom on each new entry (via
          chatScrollRef + useEffect). role="log" + aria-atomic="false" lets
          screen readers announce each new bubble without re-reading the
          entire thread. Bubbles are side-aligned: user right, agent left.
          No opacity fade — the full thread is equally readable in a scroll. */}
      {/* Tapping the transcript during review used to resume the session, but
          this was an invisible gesture that conflicted with scroll-to-read
          intent. Resume is now explicit via the "Continue conversation" button
          below. cursor-pointer removed accordingly. */}
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto min-h-0 px-4 pt-5 pb-4 flex flex-col gap-3"
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        {/* Spacer pushes messages to the bottom when the conversation is
            short. Collapses to zero once messages overflow the container,
            at which point the scroll area takes over. More reliable than
            justify-end + overflow-y:auto across browsers. */}
        <div className="flex-1" aria-hidden="true" />

        {liveTurns.map((turn, i) => {
          // Show a role label above the very first bubble for each speaker so
          // first-time users immediately understand the side convention.
          const isFirstOfRole = firstOfRoleFlags[i]
          return (
            <motion.div
              key={`${turn.wallMs}-${i}`}
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              className={`flex flex-col gap-1 ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {isFirstOfRole && (
                <span className="text-xs text-text-tertiary select-none px-1">
                  {turn.role === 'user' ? t('practice.youLabel') : t('practice.coachLabel')}
                </span>
              )}
              <p
                className={`
                  px-4 py-2.5 text-sm leading-relaxed max-w-[78%]
                  ${turn.role === 'user'
                    ? 'rounded-2xl bg-accent-chip text-on-accent-chip'
                    : 'rounded-2xl bg-surface-elevated text-text-primary ring-1 ring-border-subtle'}
                  ${turn.pending ? 'opacity-80 italic' : ''}
                `}
              >
                {turn.pending && !turn.text.trim() ? (
                  // Three-dots placeholder while AssemblyAI catches up — Gemini's
                  // VAD often decides the user finished speaking ~500ms before
                  // AssemblyAI's punctuation-based final lands, and without this
                  // the user would see the agent reply with no transcript of
                  // their own turn yet. Animation cycles the three dots so it
                  // reads as "thinking" rather than a frozen ellipsis.
                  <TypingDots />
                ) : (
                  turn.text
                )}
              </p>
            </motion.div>
          )
        })}
      </div>

      {/* ── Bottom region: toast + call controls ↔ review prompt ─────────────
          AnimatePresence cross-fades between the live call controls and the
          save/discard prompt when the session ends. The transcript above
          stays visible throughout — the user never loses their conversational
          context.

          `relative` anchors the in-session toast (e.g. the T-60s "1 minute
          left" warning) to the TOP edge of whichever bar is shown. The shared
          <Toast> is `fixed` at `--toast-bottom`, which inside this full-bleed
          fixed surface lands directly over the Mute / End buttons and — being
          a higher layer — swallows their taps. Floating it at `bottom-full`
          keeps it clear of the controls at any controls height, and being
          absolute it adds no layout shift when it appears / dismisses. */}
      <div className="relative flex-shrink-0">
        {toast && (
          <div
            key={toast}
            role="alert"
            className="
              absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-50
              w-max max-w-[calc(100%-2rem)]
              flex items-center gap-3 px-4 py-2.5
              bg-surface-elevated border border-border rounded-xl
              text-sm text-text-primary shadow-lg
              animate-toast-in
            "
          >
            <span>{toast}</span>
          </div>
        )}
      <AnimatePresence mode="wait">
        {isReview ? (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
            className="flex-shrink-0 border-t border-border-subtle px-6 pt-5 pb-5 flex flex-col items-center gap-4"
          >
            <div className="text-center">
              <p className="text-base font-medium text-text-primary">{t('practice.reviewHeading')}</p>
              <p className="text-sm text-text-secondary mt-1">{t('practice.reviewEncouragement')}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button size="md" onClick={confirmSave}>{t('practice.reviewSave')}</Button>
              <Button size="md" variant="secondary" onClick={discardSession}>{t('practice.reviewDiscard')}</Button>
            </div>
            <button
              type="button"
              onClick={resumeSession}
              disabled={isResuming}
              className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isResuming && (
                <svg className="animate-spin w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {t('practice.reviewResume')}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="controls"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="flex-shrink-0 px-6 pt-3 pb-3 flex flex-col items-center gap-3"
          >
            {/* Call action row — Mute · live waveform · End. The waveform
                shares the controls line rather than sitting on its own row
                above, so the live surface stays compact. It's the center
                column of a three-up rhythm: each column is a glyph (circle
                or dots) over a label slot. The center label slot carries the
                muted / wrapping-up status that used to live in the standalone
                status row, so no notable state is lost in the consolidation. */}
            <div className="flex items-end justify-center gap-12 sm:gap-16">

              {/* Mute — neutral circle, amber fill when pressed */}
              <button
                type="button"
                onClick={toggleMute}
                disabled={isEnding}
                aria-label={muted ? t('practice.unmuteAria') : t('practice.muteAria')}
                aria-pressed={muted}
                aria-keyshortcuts="Space"
                className="group flex flex-col items-center gap-1.5 disabled:cursor-not-allowed focus-visible:outline-none"
              >
                <div
                  className={`
                    w-14 h-14 rounded-full flex items-center justify-center
                    transition-colors duration-150
                    group-focus-visible:ring-2 group-focus-visible:ring-accent-primary group-focus-visible:ring-offset-2
                    group-disabled:opacity-40
                    ${muted
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : 'bg-surface-elevated text-text-secondary group-hover:bg-border-subtle group-hover:text-text-primary group-active:opacity-75'}
                  `}
                >
                  <Icon name={muted ? 'mic-off' : 'mic'} className="h-[1.375rem] w-[1.375rem]" />
                </div>
                <span
                  className={`text-xs font-medium select-none transition-colors duration-150 ${muted ? 'text-amber-600 dark:text-amber-400' : 'text-text-secondary'}`}
                >
                  {muted ? t('practice.unmuteLabel') : t('practice.muteLabel')}
                </span>
              </button>

              {/* Live waveform + status — center column. Dots align with the
                  flanking circles (centered in a matching h-14 box); the
                  label slot below mirrors the buttons' labels and holds the
                  notable-state cue (muted / ending). The slot keeps a fixed
                  height so the dots don't shift when the label appears. */}
              <div className="flex flex-col items-center gap-1.5">
                <div className="h-14 flex items-center justify-center">
                  <AudioReactiveDots
                    audioTickCallbacksRef={audioTickCallbacksRef}
                    compact
                    className={`transition-opacity duration-300 ${isEnding ? 'opacity-40' : ''}`}
                  />
                </div>
                <div className="h-4 flex items-center" aria-live="polite">
                  <AnimatePresence mode="wait">
                    {statusLabel && (
                      <motion.span
                        key={statusLabel}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className={`text-xs font-medium select-none ${
                          isEnding
                            ? 'text-text-tertiary'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {statusLabel}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* End call — filled rose circle, always reads as destructive */}
              <button
                type="button"
                onClick={endSession}
                disabled={isEnding}
                aria-label={t('practice.endAria')}
                aria-keyshortcuts="Escape"
                className="group flex flex-col items-center gap-1.5 disabled:cursor-not-allowed focus-visible:outline-none"
              >
                <div
                  className="
                    w-14 h-14 rounded-full flex items-center justify-center
                    bg-rose-500 text-white
                    group-hover:bg-rose-600 group-active:bg-rose-700
                    group-disabled:opacity-40
                    group-focus-visible:ring-2 group-focus-visible:ring-rose-500 group-focus-visible:ring-offset-2
                    transition-colors duration-150
                  "
                >
                  <Icon name="phone-hangup" className="h-[1.375rem] w-[1.375rem]" />
                </div>
                <span className="text-xs font-medium text-rose-600 dark:text-rose-400 select-none">
                  {t('practice.end')}
                </span>
              </button>
            </div>

            {/* Reroll pill — call mode only, hides at zero rerolls. Lives
                below the mute/end buttons so it's discoverable but not
                competing with the primary controls. Greyed out + disabled
                while a reroll is in flight (prevents double-tap spawning two
                parallel WebSockets). */}
            {mode === 'call' && rerollsLeft > 0 && !isEnding && (
              <button
                type="button"
                onClick={tryAnotherLine}
                disabled={isRerolling}
                aria-label={t('practice.rerollAria')}
                className="
                  mt-1 inline-flex items-center gap-1.5
                  px-3 py-1.5 rounded-full
                  text-xs font-medium
                  bg-surface-elevated text-text-secondary
                  ring-1 ring-border-subtle
                  hover:bg-border-subtle hover:text-text-primary
                  disabled:opacity-50 disabled:cursor-not-allowed
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
                  transition-colors
                "
              >
                <Icon name="refresh" className="h-3.5 w-3.5" />
                <span>{t('practice.rerollLabel')}</span>
                {/* Compact reroll counter — three dots, ones used dim. Reads
                    "lines remaining" at a glance without needing a numeral. */}
                <span className="flex items-center gap-0.5 ml-1" aria-hidden="true">
                  {Array.from({ length: REROLL_MAX }).map((_, i) => (
                    <span
                      key={i}
                      className={`block w-1 h-1 rounded-full ${i < rerollsLeft ? 'bg-text-secondary' : 'bg-border-subtle'}`}
                    />
                  ))}
                </span>
                <span className="sr-only">{t('practice.rerollsLeft', { n: rerollsLeft })}</span>
              </button>
            )}

            {showShortcutHint && (
              <p className="text-xs text-text-tertiary select-none" aria-hidden="true">
                {t('practice.shortcutHint')}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  )
}

/**
 * Three-dot "typing" indicator for the user-bubble placeholder. Rendered
 * inside the existing pill so its sizing + colour come from the parent —
 * no need to recolour for accent-chip variants. Animation uses CSS
 * `animation-delay` offsets rather than framer-motion to stay cheap (the
 * indicator can render every turn) and to keep working under
 * reduced-motion (the dots simply hold their mid-frame opacity).
 */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Transcribing">
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-typing-dot [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-typing-dot [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-typing-dot [animation-delay:300ms]" />
    </span>
  )
}
