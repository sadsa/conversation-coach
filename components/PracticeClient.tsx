// components/PracticeClient.tsx
//
// Client island for /practice — the deliberate 5-minute Spanish conversation
// surface. Full state machine:
//
//   idle → connecting → active/warning/ending → review → analysing → ready
//                                                      ↗ connecting (resume)
//                                                      ↘ idle (discard)
//                                                               ↘ error
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
// whether to save (→ analysing) or discard (→ idle after 5s undo window).
// beforeunload guard covers review + analysing so navigating away warns.
//
// Keyboard shortcuts:
//   Escape → endSession
//   Space  → toggleMute
//
// On unmount the agent disconnects, all timers clear, and the wake lock
// (if held) releases.
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from '@/components/LanguageProvider'
import { connect, buildPracticeSystemPrompt } from '@/lib/voice-agent'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'
import { AudioReactiveDots } from '@/components/AudioReactiveDots'
import { ProcessingGraphic } from '@/components/ProcessingGraphic'
import type { TargetLanguage, TranscriptTurn } from '@/lib/types'
import type { VoiceAgent } from '@/lib/voice-agent'
import type { VoiceTickCallback } from '@/components/AudioReactiveDots'

type PracticeState = 'idle' | 'connecting' | 'active' | 'warning' | 'ending' | 'review' | 'analysing' | 'error'

const SHORTCUT_HINT_KEY = 'cc:practice-shortcut-hint-seen'
const SHORTCUT_HINT_LIMIT = 3

interface Props {
  targetLanguage: TargetLanguage
}

const TOTAL_SECONDS = 300        // 5 min hard cap
const WARN_SECONDS = 240         // 1-min warning toast at 4 min
const COLOR_SHIFT_SECONDS = 270  // meter colour shift at T-30s
const ENDING_HOLD_MS = 1500      // wrap-up beat duration before auto-end
const RMS_DECAY = 0.85
const RMS_FLOOR = 0.004
// LIVE_CAPTION_TURNS removed — all turns are shown in the scrollable transcript

export function PracticeClient({ targetLanguage }: Props) {
  const { t, targetLanguage: ctxTargetLanguage } = useTranslation()
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const [practiceState, setPracticeState] = useState<PracticeState>('idle')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [voiceStatus, setVoiceStatus] = useState<'listening' | 'speaking' | 'muted'>('listening')
  const [liveTurns, setLiveTurns] = useState<TranscriptTurn[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [discardToast, setDiscardToast] = useState<{ key: number } | null>(null)
  const [showShortcutHint, setShowShortcutHint] = useState(false)

  const agentRef = useRef<VoiceAgent | null>(null)
  const turnsRef = useRef<TranscriptTurn[]>([])
  const frozenTurnsRef = useRef<TranscriptTurn[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const discardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
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

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      agentRef.current?.disconnect()
      if (timerRef.current) clearInterval(timerRef.current)
      if (endingTimeoutRef.current) clearTimeout(endingTimeoutRef.current)
      if (discardTimerRef.current) clearTimeout(discardTimerRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      wakeLockRef.current?.release()
      wakeLockRef.current = null
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
  useEffect(() => {
    const isLive =
      practiceState === 'active' ||
      practiceState === 'warning' ||
      practiceState === 'ending' ||
      practiceState === 'review'
    if (isLive) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [practiceState])

  // Warn on browser navigation while unsaved turns exist or analysis is running.
  useEffect(() => {
    if (practiceState !== 'review' && practiceState !== 'analysing') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [practiceState])

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

  const submitTurns = useCallback(async (turns: TranscriptTurn[]) => {
    const userTurns = turns.filter(turn => turn.role === 'user')
    if (userTurns.length === 0) {
      setToast(t('practice.errorNoSpeech'))
      setPracticeState('idle')
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
    // Nothing was said — skip the save/discard prompt and return to idle.
    if (turnsRef.current.length === 0) {
      turnsRef.current = []
      setElapsed(0)
      setLiveTurns([])
      setPracticeState('idle')
      return
    }
    frozenTurnsRef.current = [...turnsRef.current]
    setPracticeState('review')
  }, [])

  const confirmSave = useCallback(() => {
    submitTurns(frozenTurnsRef.current)
  }, [submitTurns])

  // Undo restores the review state with frozenTurnsRef intact — that's why
  // we don't clear frozen turns until the 5s timer expires.
  const undoDiscard = useCallback(() => {
    if (discardTimerRef.current) { clearTimeout(discardTimerRef.current); discardTimerRef.current = null }
    setDiscardToast(null)
    setPracticeState('review')
  }, [])

  // Optimistic: drop the user back to idle immediately, surface the undo
  // toast over the idle screen, and run a 5s timer to truly clear turns.
  // If the user clicks Start during the window, start() cancels the timer.
  const discardSession = useCallback(() => {
    if (discardTimerRef.current) clearTimeout(discardTimerRef.current)
    setDiscardToast({ key: Date.now() })
    setPracticeState('idle')
    discardTimerRef.current = setTimeout(() => {
      discardTimerRef.current = null
      frozenTurnsRef.current = []
      turnsRef.current = []
      setElapsed(0)
      setLiveTurns([])
      setDiscardToast(null)
    }, 5000)
  }, [])

  useEffect(() => { endSessionRef.current = endSession }, [endSession])

  // Reconnects from the review state without losing any turns or elapsed time.
  // Restores turnsRef from the frozen snapshot so onTranscript appends correctly.
  const resumeSession = useCallback(async () => {
    if (practiceState !== 'review') return
    const restoredTurns = [...frozenTurnsRef.current]
    const restoredElapsed = elapsed
    turnsRef.current = restoredTurns
    frozenTurnsRef.current = []
    setPracticeState('connecting')
    setMuted(false)
    try {
      const agent = await connect(
        targetLanguage,
        {
          onStateChange: (s) => {
            if (!isMountedRef.current) return
            if (s === 'active') {
              setPracticeState('active')
              startTimer(restoredElapsed)
            } else if (s === 'ended') {
              if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
              agentRef.current = null
            }
          },
          onError: (msg) => {
            if (!isMountedRef.current) return
            const isMic = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
            setToast(isMic ? t('practice.errorMic') : t('practice.errorConnect'))
            // Restore review state so the user can still save what they had.
            frozenTurnsRef.current = restoredTurns
            setPracticeState('review')
          },
          onUserAudio: (rms) => { userRmsRef.current = Math.max(userRmsRef.current, rms) },
          onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
          onTranscript: (role, text) => {
            if (!isMountedRef.current) return
            const turn: TranscriptTurn = { role, text, wallMs: Date.now() }
            turnsRef.current.push(turn)
            setLiveTurns(prev => [...prev, turn])
          },
        },
        { transcription: true, systemPrompt: buildPracticeSystemPrompt(targetLanguage) },
      )
      agentRef.current = agent
    } catch (err) {
      if (!isMountedRef.current) return
      const isPermission = err instanceof DOMException && err.name === 'NotAllowedError'
      setToast(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
      // Restore review state so the user can still save what they had.
      frozenTurnsRef.current = restoredTurns
      setPracticeState('review')
    }
  }, [practiceState, elapsed, targetLanguage, t, startTimer])

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

  const start = useCallback(async () => {
    if (practiceState !== 'idle') return
    // If a discard-undo window is open, clicking Start signals the user has
    // moved on — drop the pending timer + toast so they don't linger.
    if (discardTimerRef.current) {
      clearTimeout(discardTimerRef.current)
      discardTimerRef.current = null
      frozenTurnsRef.current = []
      setDiscardToast(null)
    }
    setPracticeState('connecting')
    setMuted(false)
    setElapsed(0)
    setLiveTurns([])
    turnsRef.current = []
    try {
      const agent = await connect(
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
            }
          },
          onError: (msg) => {
            if (!isMountedRef.current) return
            const isMic = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
            setToast(isMic ? t('practice.errorMic') : t('practice.errorConnect'))
            setPracticeState('idle')
          },
          onUserAudio: (rms) => {
            userRmsRef.current = Math.max(userRmsRef.current, rms)
          },
          onAgentAudio: (rms) => {
            agentRmsRef.current = Math.max(agentRmsRef.current, rms)
          },
          onTranscript: (role, text) => {
            if (!isMountedRef.current) return
            const turn: TranscriptTurn = { role, text, wallMs: Date.now() }
            turnsRef.current.push(turn)
            setLiveTurns(prev => [...prev, turn])
          },
        },
        { transcription: true, systemPrompt: buildPracticeSystemPrompt(targetLanguage) },
      )
      agentRef.current = agent
    } catch (err) {
      if (!isMountedRef.current) return
      const isPermission = err instanceof DOMException && err.name === 'NotAllowedError'
      setToast(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
      setPracticeState('idle')
    }
  }, [practiceState, targetLanguage, t, startTimer])

  // Retry from the error state. If we collected user speech, re-submit;
  // otherwise the connection itself failed before any turns landed —
  // restart the session instead of POSTing an empty body.
  const retry = useCallback(() => {
    if (turnsRef.current.some(turn => turn.role === 'user')) {
      submitTurns([...turnsRef.current])
    } else {
      setPracticeState('idle')
      setTimeout(() => { void start() }, 0)
    }
  }, [submitTurns, start])

  // ─── Idle ──────────────────────────────────────────────────────────────
  if (practiceState === 'idle') {
    return (
      <div
        className="
          mx-auto w-full max-w-md px-6
          flex flex-col items-center justify-center flex-1
          gap-8 text-center
        "
      >
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
            {t('practice.heading')}
          </h1>
          <p className="text-base md:text-lg text-text-secondary leading-relaxed">
            {t('practice.description', { language: t(`lang.${ctxTargetLanguage}`) })}
          </p>
        </div>

        <p className="text-sm text-text-secondary">{t('practice.idleMeta')}</p>

        <Button onClick={start} size="md">
          {t('practice.start')}
        </Button>

        {toast && <Toast message={toast} />}
        {discardToast && (
          <Toast
            message={t('practice.discardToast')}
            action={{ label: t('practice.discardUndo'), onClick: undoDiscard }}
            toastKey={discardToast.key}
          />
        )}
      </div>
    )
  }

  // ─── Connecting ────────────────────────────────────────────────────────
  // Brief pre-flight — uses the compact processing graphic so the visual
  // language matches the analysing screen (and the upload pipeline) without
  // dominating a near-instant transition.
  if (practiceState === 'connecting') {
    return (
      <div
        className="
          mx-auto w-full max-w-md px-6
          flex flex-col items-center justify-center flex-1
          gap-5 text-center
        "
        role="status"
        aria-live="polite"
      >
        <ProcessingGraphic compact label={t('practice.connecting')} />
      </div>
    )
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
          gap-7 text-center
        "
        role="status"
        aria-live="polite"
      >
        <ProcessingGraphic label={t('practice.analysing')} />
        <div className="space-y-1.5">
          <p className="text-base sm:text-lg font-medium text-text-primary">
            {t('practice.analysing')}
          </p>
          <p className="text-sm text-text-tertiary">
            {t('practice.analysingHint')}
          </p>
        </div>
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
          const isFirstOfRole = liveTurns.findIndex(t => t.role === turn.role) === i
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
                `}
              >
                {turn.text}
              </p>
            </motion.div>
          )
        })}
      </div>

      {/* ── Bottom bar: call controls ↔ review prompt ────────────────────────
          AnimatePresence cross-fades between the live call controls and the
          save/discard prompt when the session ends. The transcript above
          stays visible throughout — the user never loses their conversational
          context. */}
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
              <p className="text-base font-medium text-foreground">{t('practice.reviewHeading')}</p>
              <p className="text-sm text-text-secondary mt-1">{t('practice.reviewEncouragement')}</p>
              <p className="text-xs text-text-tertiary mt-1">{t('practice.reviewMeta', { time: formatTime(elapsed) })}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button size="md" onClick={confirmSave}>{t('practice.reviewSave')}</Button>
              <Button size="md" variant="secondary" onClick={discardSession}>{t('practice.reviewDiscard')}</Button>
            </div>
            <button
              type="button"
              onClick={resumeSession}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary rounded"
            >
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
            className="flex-shrink-0 border-t border-border-subtle px-6 pt-3 pb-3 flex flex-col items-center gap-3"
          >
            {/* Status row: dots + label only when state is notable (muted / ending) */}
            <div className="flex items-center gap-2 h-5">
              <AudioReactiveDots
                audioTickCallbacksRef={audioTickCallbacksRef}
                compact
                className={`transition-opacity duration-300 ${isEnding ? 'opacity-40' : ''}`}
              />
              <AnimatePresence mode="wait">
                {statusLabel && (
                  <motion.span
                    key={statusLabel}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className={`text-xs font-medium select-none ${isEnding ? 'text-text-tertiary' : 'text-amber-600 dark:text-amber-400'}`}
                  >
                    {statusLabel}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Call action buttons */}
            <div className="flex items-end justify-center gap-16">

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

            {showShortcutHint && (
              <p className="text-xs text-text-tertiary select-none" aria-hidden="true">
                {t('practice.shortcutHint')}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {toast && <Toast message={toast} />}
    </div>
  )
}
