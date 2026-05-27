// components/LessonClient.tsx
//
// 10-minute structured voice lesson. Launched from the Study sheet when the
// user taps "Practise this phrase". State machine:
//
//   connecting → active/warning/ending → review → analysing → /sessions/[id]
//                                           ↘ onExit() (discard / no speech / error)
//
// Phase is tracked separately from session state. It advances when Gemini
// calls the `set_phase` tool. On `complete`, transitions to review.
//
// Audio plumbing (AssemblyAI parallel STT, AudioReactiveDots, wake lock,
// scroll, keyboard shortcuts) mirrors PracticeClient exactly.

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
import { LessonPhaseRail, type LessonPhase } from '@/components/LessonPhaseRail'
import { LessonPhrasePill } from '@/components/LessonPhrasePill'
import type { TranscriptTurn } from '@/lib/types'
import type { VoiceAgent } from '@/lib/voice-agent'
import type { VoiceTickCallback } from '@/components/AudioReactiveDots'

type LessonState =
  | 'connecting'
  | 'active' | 'warning' | 'ending'
  | 'review' | 'analysing' | 'error'

const TOTAL_SECONDS     = 600   // 10 min hard cap
const WARN_SECONDS      = 480   // 2-min warning at T-120s
const COLOR_SHIFT_SECONDS = 570 // colour shift at T-30s
const ENDING_HOLD_MS    = 1500
const RMS_DECAY         = 0.85
const RMS_FLOOR         = 0.004

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
  const [currentPhase, setCurrentPhase] = useState<LessonPhase>('explain')
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

  useEffect(() => {
    const isLive = lessonState === 'active' || lessonState === 'warning' || lessonState === 'ending' || lessonState === 'review'
    document.body.style.overflow = isLive ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [lessonState])

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
  }, [])

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
    const userTurns = turns.filter(t => t.role === 'user')
    if (userTurns.length === 0) {
      setToast('No speech detected')
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
  }, [targetLanguage, phrase, router])

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
            onToolCall: (name, args, respond) => {
              if (name !== 'set_phase') { respond({ ok: true }); return }
              const phase = args.phase as string
              if (phase === 'complete') {
                respond({ ok: true })
                // End the session after a brief beat so the teacher's final
                // words finish playing before we transition.
                completeTimeoutRef.current = setTimeout(() => {
                  completeTimeoutRef.current = null
                  endSessionRef.current()
                }, 800)
              } else if (['model', 'drill', 'free_use'].includes(phase)) {
                setCurrentPhase(phase as LessonPhase)
                respond({ ok: true })
              } else {
                respond({ ok: false, error: 'Unknown phase' })
              }
            },
          },
          {
            transcription: true,
            inputTranscription: false,
            systemPrompt,
            model: FLASH_LIVE_MODEL,
            tools: [SET_PHASE_TOOL],
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

  if (lessonState === 'connecting') {
    return <LoadingScreen />
  }

  if (lessonState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50dvh] gap-4 px-6 text-center">
        <p className="text-text-secondary">{t('practice.errorConnect')}</p>
        <Button variant="secondary" size="md" onClick={() => onExitRef.current()}>
          {t('practice.reviewDiscard')}
        </Button>
      </div>
    )
  }

  if (lessonState === 'analysing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50dvh] gap-6 px-6">
        <ProcessingGraphic />
        <p className="text-text-secondary text-sm">{t('practice.analysing')}</p>
      </div>
    )
  }

  if (lessonState === 'review') {
    return (
      <div className="flex flex-col min-h-[100dvh]">
        <div className="flex-1 overflow-y-auto px-5 pt-safe-top pb-4">
          <h2 className="font-display text-2xl font-medium text-text-primary mt-6 mb-4">
            {t('practice.reviewHeading')}
          </h2>
          <div className="space-y-2">
            {frozenTurnsRef.current.map((turn, i) => (
              <div
                key={i}
                className={[
                  'px-3 py-2 rounded-xl text-sm leading-relaxed',
                  turn.role === 'user'
                    ? 'bg-accent-chip text-on-accent-chip self-end ml-8'
                    : 'bg-surface-elevated text-text-primary mr-8',
                ].join(' ')}
              >
                {turn.text}
              </div>
            ))}
          </div>
        </div>
        <div className="px-5 pb-safe-bottom pt-3 border-t border-border-subtle space-y-2">
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => submitTurns(frozenTurnsRef.current)}
          >
            {t('practice.reviewSave')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={() => onExitRef.current()}
          >
            {t('practice.reviewDiscard')}
          </Button>
        </div>
        {toast && <Toast message={toast} />}
      </div>
    )
  }

  // active / warning / ending
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-safe-top pb-0 flex-shrink-0">
        <button
          type="button"
          onClick={endSession}
          className="text-sm font-medium text-text-tertiary hover:text-text-secondary transition-colors py-2"
        >
          {t('lesson.end')}
        </button>
        <span
          className={[
            'text-sm font-medium tabular-nums transition-colors',
            inFinalStretch ? 'text-pill-amber' : 'text-text-tertiary',
          ].join(' ')}
        >
          {formatTime(remainingSecs)}
        </span>
      </div>

      {/* Phase rail */}
      <LessonPhaseRail currentPhase={currentPhase} />

      {/* Phrase pill */}
      <LessonPhrasePill
        correction={phrase.correction}
        flashcard_front={phrase.flashcard_front}
      />

      {/* Transcript */}
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
      >
        {liveTurns.map((turn, i) => (
          <div
            key={i}
            className={[
              'flex',
              turn.role === 'user' ? 'justify-end' : 'justify-start',
            ].join(' ')}
          >
            {firstOfRoleFlags[i] && (
              <span className="sr-only">{turn.role === 'user' ? 'You' : 'Teacher'}</span>
            )}
            <div
              className={[
                'max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed',
                turn.role === 'user'
                  ? 'bg-accent-chip text-on-accent-chip rounded-br-sm'
                  : 'bg-surface-elevated text-text-primary rounded-bl-sm',
                turn.pending ? 'italic opacity-60' : '',
              ].join(' ')}
            >
              {turn.text || '…'}
            </div>
          </div>
        ))}
      </div>

      {/* Voice indicator */}
      <div className="flex items-center justify-center h-8 flex-shrink-0">
        <AnimatePresence mode="wait">
          {voiceStatus === 'muted' ? (
            <motion.span
              key="muted"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-xs text-text-tertiary"
            >
              {t('lesson.statusMuted')}
            </motion.span>
          ) : voiceStatus === 'speaking' ? (
            <motion.div
              key="speaking"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              <AudioReactiveDots audioTickCallbacksRef={audioTickCallbacksRef} compact />
            </motion.div>
          ) : (
            <motion.div
              key="listening"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-1.5"
            >
              <div className="w-1.5 h-1.5 rounded-full border border-text-tertiary" />
              <span className="text-xs text-text-tertiary">{t('lesson.statusListening')}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center pb-safe-bottom pt-2 flex-shrink-0">
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? t('lesson.unmuteAria') : t('lesson.muteAria')}
          aria-pressed={muted}
          className="flex flex-col items-center gap-1.5"
        >
          <div className={[
            'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
            muted ? 'bg-surface-elevated border border-border' : 'bg-surface border border-border',
          ].join(' ')}>
            <Icon
              name={muted ? 'mic-off' : 'mic'}
              className="w-5 h-5 text-text-secondary"
            />
          </div>
          <span className="text-[10px] text-text-tertiary">{muted ? t('lesson.unmuteLabel') : t('lesson.muteLabel')}</span>
        </button>
      </div>

      {lessonState === 'ending' && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
          <p className="text-text-secondary text-sm">{t('practice.endingState')}</p>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </div>
  )
}
