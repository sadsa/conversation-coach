'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useAnimationControls, useMotionValue, useTransform, useReducedMotion } from 'framer-motion'
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

type LessonState = 'connecting' | 'active' | 'ending' | 'complete'

const RMS_DECAY = 0.85
const RMS_FLOOR = 0.004
const CONTROLS_SHOW_MS = 2000
const SWIPE_THRESHOLD = 80
const HINT_KEY = 'cc:study-hint:v1'
const HINT_SHOW_MS = 5000

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
  const [controlsVisible, setControlsVisible] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)

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
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const firstListeningFiredRef = useRef(false)

  const x = useMotionValue(0)
  const dragControls = useAnimationControls()
  const advanceOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1])
  const goBackOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      agentRef.current?.disconnect()
      if (endingTimeoutRef.current) clearTimeout(endingTimeoutRef.current)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current)
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

  function dismissHint() {
    setHintVisible(false)
    if (typeof window !== 'undefined') window.localStorage.setItem(HINT_KEY, '1')
  }

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

  // Onboarding hint: one-shot, after the user's first turn (first listening state)
  useEffect(() => {
    if (voiceStatus !== 'listening') return
    if (firstListeningFiredRef.current) return
    firstListeningFiredRef.current = true
    if (typeof window !== 'undefined' && window.localStorage.getItem(HINT_KEY) === '1') return
    setHintVisible(true)
    const timer = setTimeout(() => dismissHint(), HINT_SHOW_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceStatus])

  function showControlsBriefly() {
    setControlsVisible(true)
    if (controlsHideTimerRef.current) clearTimeout(controlsHideTimerRef.current)
    controlsHideTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_SHOW_MS)
  }

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
              setToast(isMic ? t('practice.errorMic') : t('practice.errorConnect'))
              onExitRef.current()
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
        setToast(isPermission ? t('practice.errorMic') : t('practice.errorConnect'))
        onExitRef.current()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (lessonState === 'connecting') {
    return <LoadingScreen />
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
      onClick={showControlsBriefly}
    >
      {/* ── Controls overlay — hidden until tap-outside ──────────────────── */}
      <div
        data-testid="controls-layer"
        aria-hidden={!controlsVisible}
        className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-4 transition-opacity duration-200 ${controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); endSession() }}
          disabled={isEnding}
          aria-label={t('practice.endAria')}
          aria-keyshortcuts="Escape"
          className="w-11 h-11 rounded-full flex items-center justify-center bg-danger-fill text-on-accent disabled:opacity-40"
        >
          <Icon name="phone-hangup" className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleMute() }}
          disabled={isEnding}
          aria-label={muted ? t('practice.unmuteAria') : t('practice.muteAria')}
          aria-pressed={muted}
          aria-keyshortcuts="Space"
          className={`w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-40 ${muted ? 'bg-warning-surface text-warning' : 'bg-surface-elevated text-text-secondary'}`}
        >
          <Icon name={muted ? 'mic-off' : 'mic'} className="h-5 w-5" />
        </button>
      </div>

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

        {/* Card + desktop arrows */}
        <div className="relative w-full max-w-sm flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleGoBack() }}
            disabled={currentCardIndex === 0 || isEnding}
            aria-label={t('lesson.goBack')}
            className="hidden sm:flex w-10 h-10 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-20 flex-shrink-0"
          >
            <Icon name="chevron-left" className="w-5 h-5" />
          </button>

          <div className="relative flex-1">
            {/* Advance overlay (right swipe → next card) */}
            <motion.div
              style={{ opacity: advanceOpacity }}
              className="absolute inset-0 z-10 pointer-events-none rounded-2xl border-2 border-accent-primary bg-accent-primary/10 flex items-center justify-center"
              aria-hidden="true"
            >
              <Icon name="chevron-right" className="w-8 h-8 text-accent-primary" />
            </motion.div>
            {/* Go-back overlay (left swipe → re-drill) */}
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
              style={{ x, touchAction: 'pan-y' }}
              animate={dragControls}
              onDragStart={() => { isDraggingRef.current = true }}
              onDragEnd={(_, info) => {
                if (info.offset.x > SWIPE_THRESHOLD) {
                  dragControls.start({ x: 400, opacity: 0, transition: { duration: 0.2 } }).then(() => {
                    handleAdvanceCard()
                    dragControls.set({ x: 0, opacity: 1 })
                  })
                } else if (info.offset.x < -SWIPE_THRESHOLD) {
                  dragControls.start({ x: -400, opacity: 0, transition: { duration: 0.2 } }).then(() => {
                    handleGoBack()
                    dragControls.set({ x: 0, opacity: 1 })
                  })
                } else {
                  dragControls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } })
                }
                setTimeout(() => { isDraggingRef.current = false }, 0)
              }}
              onClick={(e) => { e.stopPropagation() }}
              className="w-full bg-surface border border-border-subtle rounded-2xl p-6 min-h-[200px] flex flex-col justify-center gap-3 cursor-grab active:cursor-grabbing select-none"
            >
              <p className="text-2xl font-serif text-accent-primary leading-snug">
                {card.correction}
              </p>
              <p className="text-sm text-text-secondary leading-relaxed">
                {card.explanation}
              </p>
            </motion.div>
          </div>

          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleAdvanceCard() }}
            disabled={isEnding}
            aria-label={t('lesson.advance')}
            className="hidden sm:flex w-10 h-10 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-20 flex-shrink-0"
          >
            <Icon name="chevron-right" className="w-5 h-5" />
          </button>
        </div>

        {/* Onboarding hint — one-shot after the user's first turn */}
        <AnimatePresence>
          {hintVisible && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border-subtle text-xs text-text-secondary"
              aria-live="polite"
            >
              <span className="oa-touch" aria-hidden="true">↔</span>
              <span>{t('lesson.hint')}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Audio visualizer — fixed-height wrapper prevents flex reflow when compact toggles */}
        <div className="h-6 flex items-center justify-center flex-shrink-0">
          <AudioReactiveDots
            audioTickCallbacksRef={audioTickCallbacksRef}
            compact={voiceStatus === 'speaking'}
            className={`transition-opacity duration-300 ${isEnding ? 'opacity-40' : ''}`}
          />
        </div>
      </div>

      {/* Test seams */}
      <button
        data-testid="advance-card"
        className="sr-only"
        onClick={(e) => { e.stopPropagation(); handleAdvanceCard() }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        data-testid="go-back-card"
        className="sr-only"
        onClick={(e) => { e.stopPropagation(); handleGoBack() }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {toast && <Toast message={toast} />}
    </div>
  )
}
