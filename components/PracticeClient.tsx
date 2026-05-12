// components/PracticeClient.tsx
//
// Client island for /practice — the deliberate 5-minute Spanish conversation
// surface. Full state machine:
//
//   idle → connecting → active/warning/ending → review → analysing → ready
//                                                      ↘ idle (discard)
//                                                               ↘ error
//
// Mirrors VoiceController's audio-reactive feedback pattern (RAF tick, RMS
// decay, AudioReactiveDots) so the two voice surfaces speak one visual
// language for the same data signal.
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
// Global voice coach suppression: document.body.dataset.practiceActive is set
// while any non-idle state is active. The actual UI suppression (hiding the
// VoiceTrigger chip and mobile FAB on /practice) is implemented via pathname
// checks in AppHeader.tsx and BottomNav.tsx — the dataset attribute is a
// belt-and-suspenders guard for any future consumer that may read it.
//
// Keyboard shortcuts (mirroring VoiceController):
//   Escape → endSession
//   Space  → toggleMute
//
// On unmount the agent disconnects, all timers clear, and the wake lock
// (if held) releases.
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from '@/components/LanguageProvider'
import { connect, buildPracticeSystemPrompt } from '@/lib/voice-agent'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'
import { AudioReactiveDots } from '@/components/AudioReactiveDots'
import { ProcessingGraphic } from '@/components/ProcessingGraphic'
import type { TargetLanguage, TranscriptTurn } from '@/lib/types'
import type { VoiceAgent } from '@/lib/voice-agent'
import type { VoiceTickCallback } from '@/components/VoiceController'

type PracticeState = 'idle' | 'connecting' | 'active' | 'warning' | 'ending' | 'review' | 'analysing' | 'error'

interface Props {
  targetLanguage: TargetLanguage
}

const TOTAL_SECONDS = 300        // 5 min hard cap
const WARN_SECONDS = 240         // 1-min warning toast at 4 min
const COLOR_SHIFT_SECONDS = 270  // meter colour shift at T-30s
const ENDING_HOLD_MS = 1500      // wrap-up beat duration before auto-end
const RMS_DECAY = 0.85
const RMS_FLOOR = 0.004

export function PracticeClient({ targetLanguage }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const [practiceState, setPracticeState] = useState<PracticeState>('idle')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [voiceStatus, setVoiceStatus] = useState<'listening' | 'speaking' | 'muted'>('listening')
  const [liveTurns, setLiveTurns] = useState<TranscriptTurn[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [discardToast, setDiscardToast] = useState<{ key: number } | null>(null)

  const agentRef = useRef<VoiceAgent | null>(null)
  const turnsRef = useRef<TranscriptTurn[]>([])
  const frozenTurnsRef = useRef<TranscriptTurn[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const discardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  // Break circular dep: startTimer → endSession → startTimer
  const endSessionRef = useRef<() => void>(() => {})

  // Audio-reactive plumbing — mirrors VoiceController so AudioReactiveDots
  // can subscribe via the same callback set the rest of the app uses.
  const userRmsRef = useRef(0)
  const agentRmsRef = useRef(0)
  const audioTickCallbacksRef = useRef<Set<VoiceTickCallback>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastSpeakerRef = useRef<'user' | 'agent' | 'idle'>('idle')

  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const captionsScrollRef = useRef<HTMLDivElement | null>(null)

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

  // Block the global voice coach trigger while practice is active so the
  // header chip can't open a second WebSocket on top of this one.
  useEffect(() => {
    if (practiceState !== 'idle') {
      document.body.dataset.practiceActive = 'true'
    } else {
      delete document.body.dataset.practiceActive
    }
    return () => { delete document.body.dataset.practiceActive }
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
  // a closed device. Mirrors VoiceController's wake-lock handling.
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

  // Reflect mute toggles in the status row immediately — RAF tick alone
  // won't update if the user is silent at the moment of toggling.
  useEffect(() => {
    if (practiceState === 'active' || practiceState === 'warning' || practiceState === 'ending') {
      setVoiceStatus(muted ? 'muted' : 'listening')
      lastSpeakerRef.current = 'idle'
    }
  }, [muted, practiceState])

  // Auto-scroll the captions area to the latest turn whenever a new one
  // arrives. Without this the conversation pushes off the bottom of the
  // captions box and the user has to scroll manually mid-session.
  useEffect(() => {
    const el = captionsScrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [liveTurns])

  function formatTime(secs: number) {
    const m = Math.floor(secs / 60).toString()
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const remainingSecs = Math.max(0, TOTAL_SECONDS - elapsed)
  const progress = Math.min(1, elapsed / TOTAL_SECONDS)
  const inFinalStretch = elapsed >= COLOR_SHIFT_SECONDS

  const startTimer = useCallback(() => {
    let count = 0
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

  const toggleMute = useCallback(() => {
    if (!agentRef.current) return
    setMuted(prev => {
      const next = !prev
      agentRef.current?.setMuted(next)
      return next
    })
  }, [])

  // Keyboard shortcuts — Escape ends the session, Space toggles mute.
  // Same pattern as VoiceController so muscle memory carries between
  // surfaces. Skip when focus is in any text-entry field.
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
        { kind: 'other' },
        undefined,
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
            {t('practice.description')}
          </p>
        </div>

        <Button onClick={start} size="md">
          {t('practice.start')}
        </Button>

        <p className="text-sm text-text-tertiary">{t('practice.idleMeta')}</p>

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
        <p className="text-base text-text-primary">{t('practice.connecting')}</p>
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

  // ─── Review ────────────────────────────────────────────────────────────
  if (practiceState === 'review') {
    return (
      <div
        className="
          mx-auto w-full max-w-md px-6
          flex flex-col items-center justify-center flex-1
          gap-6 text-center
        "
      >
        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-foreground">{t('practice.reviewHeading')}</p>
          <p className="text-sm text-text-tertiary">{t('practice.reviewMeta', { time: formatTime(elapsed) })}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="md" onClick={confirmSave}>{t('practice.reviewSave')}</Button>
          <Button size="md" variant="secondary" onClick={discardSession}>{t('practice.reviewDiscard')}</Button>
        </div>
        {toast && <Toast message={toast} />}
      </div>
    )
  }

  // ─── Active / Warning / Ending ─────────────────────────────────────────
  const isEnding = practiceState === 'ending'
  const statusLabel = isEnding
    ? t('practice.endingState')
    : voiceStatus === 'muted' ? t('practice.statusMuted')
      : voiceStatus === 'speaking' ? t('practice.statusSpeaking')
      : t('practice.statusListening')

  return (
    <div
      className="
        mx-auto w-full max-w-md px-6 pt-6 pb-6
        flex flex-col gap-8 overflow-hidden flex-1 min-h-0
      "
    >
      {/* Progress meter — quiet rail with accent-primary fill that shifts
          to a warmer pill-amber tone in the final 30 seconds. The fill
          uses scaleX from a left origin (cheaper than animating width —
          GPU-accelerated, no layout thrash). The transition list runs
          width-via-scale linearly with the timer; colour eases out so
          the shift reads as a deliberate emotional cue, not a flicker. */}
      <div className="flex items-center gap-3">
        <div
          className="h-1 flex-1 rounded-full bg-border-subtle overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('practice.timerAria', { time: formatTime(remainingSecs) })}
        >
          <div
            className={`h-full w-full origin-left ${inFinalStretch ? 'bg-pill-amber' : 'bg-accent-primary'}`}
            style={{
              transform: `scaleX(${progress})`,
              transition: 'transform 1000ms linear, background-color 700ms var(--ease-out-quart)',
            }}
          />
        </div>
        <span
          className="text-sm tabular-nums text-text-secondary select-none"
          aria-hidden="true"
        >
          {t('practice.timeRemaining', { time: formatTime(remainingSecs) })}
        </span>
      </div>

      {/* Status row — audio-reactive dots + role text. The dots are the
          loudest element in this view: they tell the user the mic is alive
          and the agent is heard. Mirrors VoiceStrip's vocabulary. The
          status span is NOT aria-live — captions below carry the polite
          announcements; the status string is a state label, not a
          notification. Avoids two competing live regions. */}
      <div className="flex flex-col items-center gap-4">
        <AudioReactiveDots
          audioTickCallbacksRef={audioTickCallbacksRef}
          className={isEnding ? 'opacity-50 transition-opacity duration-300' : 'transition-opacity duration-300'}
        />
        <AnimatePresence mode="wait">
          <motion.span
            key={statusLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`text-sm font-medium select-none ${voiceStatus === 'muted' ? 'text-amber-600 dark:text-amber-400' : 'text-text-secondary'}`}
          >
            {statusLabel}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Live captions — full conversation history. Side alignment +
          colour tint carry the speaker; uppercase YOU/COACH labels were
          dropped in the polish pass (they were doubling the visual
          signal). Captions held at max-w-[70%] so the side alignment
          reads visually rather than two near-full-width blocks stacked.
          role="log" gives screen readers the right semantic for a stream
          of new entries.

          Scroll model: outer is the scroll container, inner uses
          min-h-full + justify-end so a sparse conversation sits at the
          bottom (caption-style); once content overflows, the outer
          scrolls and an effect pins it to the bottom on every new turn
          so the latest message is always visible without manual scroll. */}
      <div
        ref={captionsScrollRef}
        className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1"
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        <div className="min-h-full flex flex-col justify-end gap-3">
          {liveTurns.map((turn, i) => (
            <p
              key={`${turn.wallMs}-${i}`}
              className={`
                rounded-2xl px-4 py-3 text-sm leading-snug max-w-[70%]
                ${turn.role === 'user'
                  ? 'self-end bg-accent-chip text-accent-primary'
                  : 'self-start bg-surface-elevated text-text-primary'}
              `}
            >
              {turn.text}
            </p>
          ))}
        </div>
      </div>

      {/* Controls — two labelled buttons. Labels are always visible (even
          on mobile) so first-time users don't have to guess what the
          circles do. Mute goes amber when pressed — "you're silenced" is
          a state worth noticing, not hiding. End reads rose at rest —
          destructive intent is clear before any hover. Disabled while
          ending so the wrap-up beat is uninterrupted. */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center justify-center gap-6">
          {/* Mute — labelled pill. Amber pressed state signals "the coach
              can't hear you" without implying an error. */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={isEnding}
            aria-label={muted ? t('practice.unmuteAria') : t('practice.muteAria')}
            aria-pressed={muted}
            aria-keyshortcuts="Space"
            className="
              inline-flex flex-col items-center justify-center gap-1
              min-w-[4rem] px-3 py-2 rounded-2xl flex-shrink-0
              text-text-secondary hover:bg-surface-elevated hover:text-text-primary
              active:opacity-75
              aria-pressed:bg-amber-500/15 aria-pressed:text-amber-600
              dark:aria-pressed:text-amber-400
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-secondary
              transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
            "
          >
            <Icon name={muted ? 'mic-off' : 'mic'} className="h-5 w-5" />
            <span className="text-xs font-medium select-none">
              {muted ? t('practice.unmuteLabel') : t('practice.muteLabel')}
            </span>
          </button>

          {/* End — rose at rest so the destructive intent is legible at a
              glance, not discovered on hover for the first time. */}
          <button
            type="button"
            onClick={endSession}
            disabled={isEnding}
            aria-label={t('practice.endAria')}
            aria-keyshortcuts="Escape"
            className="
              inline-flex flex-col items-center justify-center gap-1
              min-w-[4rem] px-3 py-2 rounded-2xl flex-shrink-0
              text-rose-600 dark:text-rose-400
              hover:bg-rose-500/20
              active:bg-rose-500/30
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
              transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
            "
          >
            <Icon name="phone-hangup" className="h-5 w-5" />
            <span className="text-xs font-medium select-none">
              {t('practice.end')}
            </span>
          </button>
        </div>
        <p className="hidden md:block text-xs text-text-tertiary select-none" aria-hidden="true">
          {t('practice.shortcutHint')}
        </p>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  )
}
