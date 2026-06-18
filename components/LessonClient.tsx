'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, animate, useMotionValue, useTransform, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'
import {
  connect,
  buildStudySystemPrompt,
  formatStudyCardAdvance,
  FLASH_LIVE_MODEL,
  type LessonPhrase,
} from '@/lib/voice-agent'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'
import { AudioReactiveDots } from '@/components/AudioReactiveDots'
import { LoadingScreen } from '@/components/LoadingScreen'
import type { VoiceAgent } from '@/lib/voice-agent'
import type { VoiceTickCallback } from '@/components/AudioReactiveDots'

type LessonState = 'connecting' | 'active' | 'ending' | 'complete' | 'error'

const RMS_DECAY = 0.85
const RMS_FLOOR = 0.004
const SWIPE_THRESHOLD = 80

interface Props {
  /** All Vocabulary Items from this session to weave into the Study conversation. */
  phrases: LessonPhrase[]
  /** Called when the session ends (user exits or connection dropped). */
  onExit: () => void
}

export function LessonClient({ phrases, onExit }: Props) {
  const { t, targetLanguage } = useTranslation()
  const reducedMotion = useReducedMotion()

  const [lessonState, setLessonState] = useState<LessonState>('connecting')
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [muted, setMuted] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<'listening' | 'speaking' | 'muted'>('listening')
  const [toast, setToast] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  const agentRef = useRef<VoiceAgent | null>(null)
  const endingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const isDraggingRef = useRef(false)

  const x = useMotionValue(0)
  const cardOpacity = useMotionValue(1)
  const advanceOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1])
  const goBackOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      agentRef.current?.disconnect()
      if (endingTimeoutRef.current) clearTimeout(endingTimeoutRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      wakeLockRef.current?.release()
      wakeLockRef.current = null
    }
  }, [])

  useEffect(() => {
    const isLive = lessonState === 'active' || lessonState === 'ending'
    document.body.style.overflow = isLive ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [lessonState])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const sessionLive = lessonState === 'active' || lessonState === 'ending'
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
    const sessionLive = lessonState === 'active' || lessonState === 'ending'
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
    if (lessonState === 'active' || lessonState === 'ending') {
      setVoiceStatus(muted ? 'muted' : 'listening')
      lastSpeakerRef.current = 'idle'
    }
  }, [muted, lessonState])

  function handleAdvanceCard() {
    const nextIndex = currentCardIndex + 1
    if (nextIndex < phrases.length) {
      setCurrentCardIndex(nextIndex)
      agentRef.current?.sendText(formatStudyCardAdvance(phrases[nextIndex], nextIndex, phrases.length, targetLanguage))
    } else {
      disconnectResources()
      setLessonState('complete')
    }
  }

  function handleGoBack() {
    if (currentCardIndex === 0) return
    const prevIndex = currentCardIndex - 1
    setCurrentCardIndex(prevIndex)
    agentRef.current?.sendText(formatStudyCardAdvance(phrases[prevIndex], prevIndex, phrases.length, targetLanguage))
  }

  // Shared advance path: a button tap animates the card off-screen exactly
  // like a swipe release, then runs the matching handler. Swipe-release and
  // the Back/Next pills both call this so the two affordances feel identical.
  function animateThenAdvance(dir: 'next' | 'back') {
    if (dir === 'back' && currentCardIndex === 0) {
      void animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 })
      return
    }
    const run = () => {
      if (dir === 'next') handleAdvanceCard()
      else handleGoBack()
      x.set(0)
      cardOpacity.set(1)
    }
    if (reducedMotion) { run(); return }
    void Promise.all([
      animate(x, dir === 'next' ? 400 : -400, { duration: 0.2 }),
      animate(cardOpacity, 0, { duration: 0.2 }),
    ]).then(run)
  }

  const toggleMute = useCallback(() => {
    if (!agentRef.current) return
    setMuted(prev => { const next = !prev; agentRef.current?.setMuted(next); return next })
  }, [])

  const disconnectResources = useCallback(() => {
    if (endingTimeoutRef.current) { clearTimeout(endingTimeoutRef.current); endingTimeoutRef.current = null }
    agentRef.current?.flush()
    agentRef.current?.disconnect()
    agentRef.current = null
  }, [])

  const endSession = useCallback(() => {
    disconnectResources()
    onExitRef.current()
  }, [disconnectResources])

  const toggleMuteRef = useRef(toggleMute)
  useEffect(() => { endSessionRef.current = endSession }, [endSession])
  useEffect(() => { toggleMuteRef.current = toggleMute }, [toggleMute])

  useEffect(() => {
    if (lessonState !== 'active') return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (e.key === 'Escape') { e.preventDefault(); endSessionRef.current() }
      else if (e.code === 'Space' && !e.repeat) { e.preventDefault(); toggleMuteRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lessonState])

  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true
    const systemPrompt = buildStudySystemPrompt(phrases, targetLanguage)
    void (async () => {
      try {
        const agent = await connect(
          targetLanguage,
          {
            onStateChange: (s) => {
              if (!isMountedRef.current) return
              if (s === 'active') { setLessonState('active') }
              else if (s === 'ended') {
                agentRef.current = null
                setLessonState(prev => {
                  if (prev === 'connecting') { onExitRef.current(); return prev }
                  if (prev === 'complete') return prev
                  if (prev === 'active') setTimeout(() => endSessionRef.current(), 0)
                  return prev
                })
              }
            },
            onError: (msg) => {
              if (!isMountedRef.current) return
              const isMic = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
              setConnectionError(isMic ? t('practice.errorMic') : t('practice.errorConnect'))
              setLessonState('error')
            },
            onUserAudio: (rms) => { userRmsRef.current = Math.max(userRmsRef.current, rms) },
            onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
          },
          {
            transcription: false,
            inputTranscription: false,
            systemPrompt,
            model: FLASH_LIVE_MODEL,
            openingLine: 'start',
          },
        )
        agentRef.current = agent
      } catch (err) {
        if (!isMountedRef.current) return
        const isPermission = err instanceof DOMException && err.name === 'NotAllowedError'
        setConnectionError(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
        setLessonState('error')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (lessonState === 'connecting') {
    return <LoadingScreen />
  }

  if (lessonState === 'error') {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
        <Icon name="alert" className="w-10 h-10 text-status-error" />
        <p className="text-base text-text-secondary">{connectionError ?? t('practice.errorConnect')}</p>
        <button
          type="button"
          onClick={() => onExitRef.current()}
          className="inline-flex min-h-11 items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl border border-border text-text-primary hover:bg-surface-elevated transition-colors"
        >
          <Icon name="arrow-left" className="w-4 h-4" />
          {t('lesson.errorBack')}
        </button>
      </div>
    )
  }

  if (lessonState === 'complete') {
    return (
      <motion.div
        className="fixed flex flex-col items-center justify-center gap-6 bg-background z-10 px-8 text-center"
        style={{
          top: 'calc(var(--header-height) + env(safe-area-inset-top))',
          left: 0,
          right: 0,
          bottom: 'var(--bottom-nav-h)',
        }}
        initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
      >
        <div className="w-16 h-16 rounded-full bg-accent-primary flex items-center justify-center">
          <Icon name="check" className="w-8 h-8 text-on-accent" />
        </div>
        <h2 className="text-2xl font-serif text-text-primary">
          {t('lesson.completeHeading', { n: phrases.length })}
        </h2>
        <Link
          href="/"
          onClick={() => onExitRef.current()}
          className="inline-flex min-h-11 items-center px-6 py-2.5 text-sm font-medium rounded-xl bg-accent-primary text-on-accent hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 transition-colors"
        >
          {t('lesson.practiseAgain')}
        </Link>
      </motion.div>
    )
  }

  const isEnding = lessonState === 'ending'
  const card = phrases[currentCardIndex]
  const showPips = phrases.length <= 10
  const onFirstCard = currentCardIndex === 0
  const statusLabel = isEnding
    ? t('practice.endingState')
    : voiceStatus === 'muted' ? t('practice.statusMuted')
    : null

  return (
    <div
      data-testid="lesson-wrapper"
      className="fixed flex flex-col bg-background overflow-hidden z-10"
      style={{
        top: 'calc(var(--header-height) + env(safe-area-inset-top))',
        left: 0,
        right: 0,
        bottom: 'var(--bottom-nav-h)',
      }}
    >
      {/* ── Card area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-5 min-h-0">

        {/* Progress row */}
        <div data-testid="pip-progress" className="flex items-center justify-center gap-1.5">
          {showPips ? (
            phrases.map((_, i) => (
              <span
                key={i}
                data-pip
                className={`rounded-full transition-all duration-200 ${
                  i === currentCardIndex
                    ? 'w-2.5 h-2.5 bg-accent-primary'
                    : 'w-1.5 h-1.5 bg-border-subtle'
                }`}
              />
            ))
          ) : (
            <span className="text-xs text-text-tertiary uppercase tracking-wide select-none">
              {t('lesson.cardOf', { n: currentCardIndex + 1, total: phrases.length })}
            </span>
          )}
        </div>

        {/* Focus card — swipe (secondary) over the always-visible pills below */}
        <div className="relative w-full max-w-sm">
          {/* Advance overlay (right swipe → next card) */}
          <motion.div
            style={{ opacity: advanceOpacity }}
            className="absolute inset-0 z-10 pointer-events-none rounded-2xl border-2 border-accent-primary bg-accent-primary/10 flex items-center justify-center"
            aria-hidden="true"
          >
            <Icon name="chevron-right" className="w-8 h-8 text-accent-primary" />
          </motion.div>
          {/* Go-back overlay (left swipe → previous card) */}
          <motion.div
            style={{ opacity: goBackOpacity }}
            className="absolute inset-0 z-10 pointer-events-none rounded-2xl border-2 border-text-tertiary bg-text-tertiary/10 flex items-center justify-center"
            aria-hidden="true"
          >
            <Icon name="chevron-left" className="w-8 h-8 text-text-tertiary" />
          </motion.div>

          <motion.div
            data-testid="lesson-card"
            drag="x"
            style={{ x, opacity: cardOpacity, touchAction: 'pan-y' }}
            onDragStart={() => { isDraggingRef.current = true }}
            onDragEnd={(_, info) => {
              if (info.offset.x > SWIPE_THRESHOLD) animateThenAdvance('next')
              else if (info.offset.x < -SWIPE_THRESHOLD) animateThenAdvance('back')
              else void animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 })
              setTimeout(() => { isDraggingRef.current = false }, 0)
            }}
            className="w-full bg-surface border border-border-subtle rounded-2xl p-6 min-h-[200px] flex flex-col justify-center cursor-grab active:cursor-grabbing select-none"
          >
            <p className="text-2xl font-serif text-accent-primary leading-snug text-center text-balance">
              {card.correction}
            </p>
          </motion.div>
        </div>

        {/* Always-visible Back / Next — primary card navigation */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            data-testid="go-back-card"
            onClick={() => animateThenAdvance('back')}
            disabled={onFirstCard || isEnding}
            aria-label={t('lesson.goBack')}
            className="inline-flex min-h-11 items-center gap-1.5 pl-3 pr-4 py-2 text-sm font-medium rounded-xl border border-border text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <Icon name="chevron-left" className="w-4 h-4" />
            {t('lesson.goBackLabel')}
          </button>
          <button
            type="button"
            data-testid="advance-card"
            onClick={() => animateThenAdvance('next')}
            disabled={isEnding}
            aria-label={t('lesson.advance')}
            className="inline-flex min-h-11 items-center gap-1.5 pl-4 pr-3 py-2 text-sm font-semibold rounded-xl bg-accent-primary text-on-accent hover:bg-accent-primary-hover transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {t('lesson.advanceLabel')}
            <Icon name="chevron-right" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Call-control row — Mute · live waveform · End (shared with PracticeClient) ── */}
      <div className="flex-shrink-0 px-6 pt-3 pb-3 flex flex-col items-center gap-3">
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
                  ? 'bg-amber-500/15 text-amber-600'
                  : 'bg-surface-elevated text-text-secondary group-hover:bg-border-subtle group-hover:text-text-primary group-active:opacity-75'}
              `}
            >
              <Icon name={muted ? 'mic-off' : 'mic'} className="h-[1.375rem] w-[1.375rem]" />
            </div>
            <span
              className={`text-xs font-medium select-none transition-colors duration-150 ${muted ? 'text-amber-600' : 'text-text-secondary'}`}
            >
              {muted ? t('practice.unmuteLabel') : t('practice.muteLabel')}
            </span>
          </button>

          {/* Live waveform + status — center column */}
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
                    className={`text-xs font-medium select-none ${isEnding ? 'text-text-tertiary' : 'text-amber-600'}`}
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
            <span className="text-xs font-medium text-rose-600 select-none">
              {t('practice.end')}
            </span>
          </button>
        </div>
      </div>

      {toast && <Toast message={toast} />}
    </div>
  )
}
