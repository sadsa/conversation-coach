// components/LessonClient.tsx
//
// 10-minute structured voice lesson. Launched from the Study sheet when the
// user taps "Practise this phrase".
//
// State machine:
//
//   connecting → active/warning/ending → review → analysing → /sessions/[id]
//                                          ↘ onExit() (discard / no speech)
//                                                ↘ error
//
// The lesson is structurally a sibling of Call and Chat — same Gemini Live
// session, same parallel AssemblyAI STT, same wake-lock + RAF audio plumbing,
// same review/save/discard prompt. The only thing visually distinguishing
// the lesson is the phrase pill anchored at the top: it tells the user what
// they're learning, and that's the only context they need.
//
// The teacher still paces itself through four phases (explain → model →
// drill → free_use → complete) via the `set_phase` tool — that's a model-
// side commitment device baked into the system prompt — but the result is
// no longer surfaced as UI. Phase progress is an application concern, not a
// user concern. We keep the tool wired so the model can still call
// `set_phase: 'complete'` to end the lesson early when the student has
// genuinely got it; the other phases are accepted with `{ ok: true }` and
// otherwise ignored.

'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from '@/components/LanguageProvider'
import {
  connect,
  buildLessonSystemPrompt,
  FLASH_LIVE_MODEL,
  type LessonPhrase,
} from '@/lib/voice-agent'
import { connectAssemblyAIStream, type AssemblyAIStream } from '@/lib/assemblyai-stream'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'
import { AudioReactiveDots } from '@/components/AudioReactiveDots'
import { LoadingScreen } from '@/components/LoadingScreen'
import { ProcessingGraphic } from '@/components/ProcessingGraphic'
import { LessonPhrasePill } from '@/components/LessonPhrasePill'
import type { TranscriptTurn } from '@/lib/types'
import type { VoiceAgent } from '@/lib/voice-agent'
import type { VoiceTickCallback } from '@/components/AudioReactiveDots'

type LessonState =
  | 'connecting'
  | 'active' | 'warning' | 'ending'
  | 'review' | 'analysing' | 'error'

const TOTAL_SECONDS       = 600   // 10 min hard cap
const WARN_SECONDS        = 480   // 2-min warning at T-120s
const COLOR_SHIFT_SECONDS = 570   // colour shift at T-30s
const ENDING_HOLD_MS      = 1500
const COMPLETE_HOLD_MS    = 800   // brief beat after model reports `complete`
const RMS_DECAY           = 0.85
const RMS_FLOOR           = 0.004

const SET_PHASE_TOOL = {
  name: 'set_phase',
  description: 'Advance the lesson to the next phase when you are satisfied the student is ready. Do not advance prematurely — wait for evidence of understanding.',
  parameters: {
    type: 'object',
    properties: {
      phase: {
        type: 'string',
        enum: ['model', 'drill', 'free_use', 'complete'],
        description: 'The phase to advance to.',
      },
    },
    required: ['phase'],
  },
}

interface Props {
  /** The phrase that seeds this lesson — correction, explanation, flashcard_front. */
  phrase: LessonPhrase & { practice_item_id: string }
  /** Called when the lesson ends without saving (discard, no speech, error). */
  onExit: () => void
}

export function LessonClient({ phrase, onExit }: Props) {
  const { t, targetLanguage } = useTranslation()
  const router = useRouter()
  const reducedMotion = useReducedMotion()

  const [lessonState, setLessonState] = useState<LessonState>('connecting')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [voiceStatus, setVoiceStatus] = useState<'listening' | 'speaking' | 'muted'>('listening')
  const [liveTurns, setLiveTurns] = useState<TranscriptTurn[]>([])
  const [toast, setToast] = useState<string | null>(null)

  const agentRef = useRef<VoiceAgent | null>(null)
  const assemblyStreamRef = useRef<AssemblyAIStream | null>(null)
  const placeholderTurnIndexRef = useRef<number | null>(null)
  const userBubbleEmittedThisTurnRef = useRef(false)
  const userAudibleSinceLastTurnRef = useRef(false)
  const turnsRef = useRef<TranscriptTurn[]>([])
  const frozenTurnsRef = useRef<TranscriptTurn[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const completeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const onExitRef = useRef(onExit)
  useEffect(() => { onExitRef.current = onExit }, [onExit])
  const endSessionRef = useRef<() => void>(() => {})

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
      assemblyStreamRef.current?.disconnect()
      assemblyStreamRef.current = null
      placeholderTurnIndexRef.current = null
      if (timerRef.current) clearInterval(timerRef.current)
      if (endingTimeoutRef.current) clearTimeout(endingTimeoutRef.current)
      if (completeTimeoutRef.current) clearTimeout(completeTimeoutRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      wakeLockRef.current?.release()
      wakeLockRef.current = null
    }
  }, [])

  // Lock body scroll while a live session is running. Same rationale as
  // PracticeClient — body uses min-h-[100dvh] and without the lock the
  // flex chain never gets a definite height to scroll within. The
  // connecting state isn't included; LoadingScreen is its own
  // component and doesn't need a definite parent height to render.
  useEffect(() => {
    const isLive =
      lessonState === 'active' ||
      lessonState === 'warning' ||
      lessonState === 'ending' ||
      lessonState === 'review'
    document.body.style.overflow = isLive ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [lessonState])

  // Warn on browser navigation while unsaved turns exist or analysis is running.
  useEffect(() => {
    if (lessonState !== 'review' && lessonState !== 'analysing') return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [lessonState])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const sessionLive = lessonState === 'active' || lessonState === 'warning' || lessonState === 'ending'
    async function acquire() {
      if (!sessionLive || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
      try { wakeLockRef.current = await navigator.wakeLock.request('screen') } catch { /* non-fatal */ }
    }
    function onVisibilityChange() { if (document.visibilityState === 'visible') acquire() }
    if (sessionLive) {
      acquire()
      document.addEventListener('visibilitychange', onVisibilityChange)
    } else {
      wakeLockRef.current?.release()
      wakeLockRef.current = null
    }
    return () => { document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [lessonState])

  // RAF tick loop: decay RMS, derive who's speaking, fan out to subscribers.
  useEffect(() => {
    const sessionLive = lessonState === 'active' || lessonState === 'warning' || lessonState === 'ending'
    if (!sessionLive) { userRmsRef.current = 0; agentRmsRef.current = 0; return }
    function tick() {
      userRmsRef.current *= RMS_DECAY
      agentRmsRef.current *= RMS_DECAY
      const u = userRmsRef.current
      const a = agentRmsRef.current
      let speaker: 'user' | 'agent' | 'idle' = 'idle'
      if (!muted) {
        if (a > u && a > RMS_FLOOR) speaker = 'agent'
        else if (u > RMS_FLOOR) speaker = 'user'
      }
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
    return () => { if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null } }
  }, [lessonState, muted])

  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [liveTurns])

  useEffect(() => {
    if (lessonState === 'active' || lessonState === 'warning' || lessonState === 'ending') {
      setVoiceStatus(muted ? 'muted' : 'listening')
      lastSpeakerRef.current = 'idle'
    }
  }, [muted, lessonState])

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
        setLessonState('warning')
        setToast(t('lesson.warningToast'))
      }
      if (count >= TOTAL_SECONDS) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        setLessonState('ending')
        endingTimeoutRef.current = setTimeout(() => {
          endingTimeoutRef.current = null
          endSessionRef.current()
        }, ENDING_HOLD_MS)
      }
    }, 1000)
  }, [t])

  const handleAssemblyAITurn = useCallback((text: string, isFinal: boolean) => {
    if (!isMountedRef.current) return
    if (placeholderTurnIndexRef.current !== null) {
      const idx = placeholderTurnIndexRef.current
      const next = [...turnsRef.current]
      next[idx] = { ...next[idx], text, pending: !isFinal }
      turnsRef.current = next
      setLiveTurns(next)
      if (isFinal) placeholderTurnIndexRef.current = null
    } else {
      const turn: TranscriptTurn = { role: 'user', text, wallMs: Date.now(), pending: !isFinal }
      turnsRef.current = [...turnsRef.current, turn]
      setLiveTurns(turnsRef.current)
      if (!isFinal) placeholderTurnIndexRef.current = turnsRef.current.length - 1
    }
    userBubbleEmittedThisTurnRef.current = true
  }, [])

  const handleModelTurnStart = useCallback(() => {
    if (!isMountedRef.current) return
    if (!userAudibleSinceLastTurnRef.current) return
    if (userBubbleEmittedThisTurnRef.current) return
    if (placeholderTurnIndexRef.current !== null) return
    const turn: TranscriptTurn = { role: 'user', text: '', wallMs: Date.now(), pending: true }
    turnsRef.current = [...turnsRef.current, turn]
    placeholderTurnIndexRef.current = turnsRef.current.length - 1
    userBubbleEmittedThisTurnRef.current = true
    setLiveTurns(turnsRef.current)
  }, [])

  const handleTurnComplete = useCallback(() => {
    if (!isMountedRef.current) return
    if (placeholderTurnIndexRef.current !== null) {
      const idx = placeholderTurnIndexRef.current
      const old = turnsRef.current[idx]
      const next = [...turnsRef.current]
      if (!old.text.trim()) next.splice(idx, 1)
      else next[idx] = { ...old, pending: false }
      turnsRef.current = next
      setLiveTurns(next)
      placeholderTurnIndexRef.current = null
    }
    userBubbleEmittedThisTurnRef.current = false
    userAudibleSinceLastTurnRef.current = false
  }, [])

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
      onExitRef.current()
      return
    }
    setLessonState('analysing')
    try {
      const res = await fetch('/api/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turns,
          targetLanguage,
          session_type: 'lesson',
          lesson_phrase: {
            correction: phrase.correction,
            explanation: phrase.explanation,
            flashcard_front: phrase.flashcard_front,
            practice_item_id: phrase.practice_item_id,
          },
        }),
      })
      if (!res.ok) throw new Error('Analysis failed')
      const { session_id } = await res.json() as { session_id: string }
      if (isMountedRef.current) router.push(`/sessions/${session_id}`)
    } catch {
      if (isMountedRef.current) setLessonState('error')
    }
  }, [t, targetLanguage, phrase, router])

  const endSession = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (endingTimeoutRef.current) { clearTimeout(endingTimeoutRef.current); endingTimeoutRef.current = null }
    agentRef.current?.flush()
    agentRef.current?.disconnect()
    agentRef.current = null
    disconnectAssemblyAI()
    const settled = turnsRef.current
      .filter(turn => !turn.pending || turn.text.trim() !== '')
      .map(turn => turn.pending ? { ...turn, pending: false } : turn)
    turnsRef.current = settled
    setLiveTurns(settled)
    if (settled.length === 0) { onExitRef.current(); return }
    frozenTurnsRef.current = [...settled]
    setLessonState('review')
  }, [disconnectAssemblyAI])

  useEffect(() => { endSessionRef.current = endSession }, [endSession])

  const confirmSave = useCallback(() => {
    submitTurns(frozenTurnsRef.current)
  }, [submitTurns])

  const discardSession = useCallback(() => {
    onExitRef.current()
  }, [])

  // Retry from the error state. The transcript is still in
  // frozenTurnsRef; re-POST as-is. Falls back to onExit if somehow nothing
  // was captured.
  const retry = useCallback(() => {
    if (frozenTurnsRef.current.length > 0) {
      submitTurns([...frozenTurnsRef.current])
    } else {
      onExitRef.current()
    }
  }, [submitTurns])

  const toggleMute = useCallback(() => {
    if (!agentRef.current) return
    setMuted(prev => { const next = !prev; agentRef.current?.setMuted(next); return next })
  }, [])

  const endSessionStableRef = useRef(endSession)
  const toggleMuteStableRef = useRef(toggleMute)
  useEffect(() => { endSessionStableRef.current = endSession }, [endSession])
  useEffect(() => { toggleMuteStableRef.current = toggleMute }, [toggleMute])

  useEffect(() => {
    if (lessonState !== 'active' && lessonState !== 'warning') return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key === 'Escape') { e.preventDefault(); endSessionStableRef.current() }
      else if (e.code === 'Space' && !e.repeat) { e.preventDefault(); toggleMuteStableRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lessonState])

  // Initial connect — runs once on mount.
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true
    const systemPrompt = buildLessonSystemPrompt(phrase, targetLanguage)
    void (async () => {
      try {
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
              if (s === 'active') { setLessonState('active'); startTimer() }
              else if (s === 'ended') {
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
                agentRef.current = null
                disconnectAssemblyAI()
                setLessonState(prev => prev === 'connecting' ? (onExitRef.current(), prev) : prev)
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
              if (rms > RMS_FLOOR) userAudibleSinceLastTurnRef.current = true
            },
            onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
            onMicPcm: (samples) => assemblyStreamRef.current?.pushPcm(samples),
            onModelTurnStart: handleModelTurnStart,
            onTurnComplete: handleTurnComplete,
            onTranscript: (role, text) => {
              if (!isMountedRef.current || role !== 'model') return
              const turn: TranscriptTurn = { role, text, wallMs: Date.now() }
              turnsRef.current = [...turnsRef.current, turn]
              setLiveTurns(turnsRef.current)
            },
            // The model still calls `set_phase` to pace itself through the
            // four phases — that's the commitment device baked into the
            // system prompt. We accept all advances silently; the only
            // case we act on is `complete`, which ends the lesson early
            // after a brief beat so the teacher's final words finish
            // playing.
            onToolCall: (name, args, respond) => {
              if (name !== 'set_phase') { respond({ ok: true }); return }
              const next = args.phase as string
              respond({ ok: true })
              if (next === 'complete') {
                completeTimeoutRef.current = setTimeout(() => {
                  completeTimeoutRef.current = null
                  endSessionRef.current()
                }, COMPLETE_HOLD_MS)
              }
            },
          },
          {
            transcription: true,
            inputTranscription: false,
            systemPrompt,
            model: FLASH_LIVE_MODEL,
            tools: [SET_PHASE_TOOL],
            // Teacher leads — the moment Gemini reports setupComplete we
            // send the lesson-start trigger so the model speaks first.
            // Otherwise the student lands on a silent screen with no cue
            // that the session is live. The system prompt's "STARTING
            // THE LESSON" block instructs the model to greet briefly,
            // name the phrase, and dive straight into Phase 1.
            openingLine: 'start',
          },
        )
        agentRef.current = agent
      } catch (err) {
        if (!isMountedRef.current) return
        const isPermission = err instanceof DOMException && err.name === 'NotAllowedError'
        setToast(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
        disconnectAssemblyAI()
        onExitRef.current()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const firstOfRoleFlags = useMemo(() => {
    const seen = new Set<TranscriptTurn['role']>()
    return liveTurns.map(turn => { if (seen.has(turn.role)) return false; seen.add(turn.role); return true })
  }, [liveTurns])

  // ── Render ──────────────────────────────────────────────────────────────────

  // Connecting: full-bleed <LoadingScreen /> with no surrounding chrome.
  // Showing the progress rail / phrase pill / call controls before the
  // session is live just adds dead UI the user can't act on. The shared
  // robot loader makes the wait recognisable; the lesson chrome appears
  // the moment Gemini reports setupComplete.
  if (lessonState === 'connecting') {
    return <LoadingScreen />
  }

  if (lessonState === 'analysing') {
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

  // The error branch lifts PracticeClient's pattern: a single primary
  // action ("Try again") which re-POSTs the frozen transcript. Discard
  // is implicit — closing the lesson via the page-level nav drops them
  // back to /write. Body copy uses the existing pipeline-failure key so
  // the voice stays consistent with the rest of the app.
  if (lessonState === 'error') {
    const hasTurns = frozenTurnsRef.current.length > 0
    return (
      <div
        className="
          mx-auto w-full max-w-md px-6
          flex flex-col items-center justify-center flex-1
          gap-6 text-center
        "
      >
        <p className="text-base text-text-secondary">{t('practice.errorAnalysis')}</p>
        <div className="flex items-center gap-3">
          <Button onClick={retry}>
            {hasTurns ? t('practice.tryAgain') : t('practice.startOver')}
          </Button>
          {hasTurns && (
            <Button variant="secondary" onClick={discardSession}>
              {t('practice.reviewDiscard')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ── Active / Warning / Ending / Review ───────────────────────────────
  // Single render path shared across the live states. Connecting was
  // handled above — by the time we reach this branch the WebSocket is
  // up and the lesson is ready for the user to engage with.
  const isEnding = lessonState === 'ending'
  const isReview = lessonState === 'review'
  const statusLabel = isEnding
    ? t('practice.endingState')
    : voiceStatus === 'muted' ? t('practice.statusMuted')
    : null

  return (
    <div
      className="fixed flex flex-col bg-bg overflow-hidden z-10"
      style={{
        top: 'calc(var(--header-height) + env(safe-area-inset-top))',
        left: 0,
        right: 0,
        bottom: 'var(--bottom-nav-h)',
      }}
    >

      {/* ── Top bar: progress rail + countdown ───────────────────────────── */}
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
          {isReview
            ? formatTime(elapsed)
            : t('practice.timeRemaining', { time: formatTime(remainingSecs) })}
        </span>
      </div>

      {/* ── Phrase pill ─────────────────────────────────────────────────────
          The only lesson-specific element on the surface — anchors the
          user to what they're studying for the entire session. */}
      <LessonPhrasePill
        correction={phrase.correction}
        flashcard_front={phrase.flashcard_front}
      />

      {/* ── Transcript ─────────────────────────────────────────────────── */}
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto min-h-0 px-4 pt-5 pb-4 flex flex-col gap-3"
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        <div className="flex-1" aria-hidden="true" />

        {liveTurns.map((turn, i) => {
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
                  <TypingDots />
                ) : (
                  turn.text
                )}
              </p>
            </motion.div>
          )
        })}
      </div>

      {/* ── Bottom bar: call controls ↔ review prompt ──────────────────────
          Mirrors PracticeClient: AnimatePresence cross-fades between the
          live Mute/End controls and the save/discard prompt. During
          `connecting` we still render the controls row (Mute + End) so
          the user can bail out before the WebSocket is ready — End just
          calls onExit since there's nothing to save yet. */}
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
            {/* Status row: audio dots + optional label (Muted / Wrapping up). */}
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

            <div className="flex items-end justify-center gap-12 sm:gap-16">
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
          </motion.div>
        )}
      </AnimatePresence>

      {toast && <Toast message={toast} />}
    </div>
  )
}

/**
 * Three-dot "typing" indicator for the user-bubble placeholder. Lifted
 * verbatim from PracticeClient so the lesson surface uses the same visual
 * for in-flight transcription. Keep these in sync if PracticeClient
 * ever updates its rendering.
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
