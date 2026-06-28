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
import { parseFlashcard } from '@/lib/flashcard'
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
  const phrasesRef = useRef(phrases)
  useEffect(() => { phrasesRef.current = phrases }, [phrases])
  const displayedCardIndicesRef = useRef<Set<number>>(new Set())
  // Always points at the current render's write-back logic — reads only from
  // refs so it's safe to call from stale callbacks.
  const doWriteBackRef = useRef<() => void>(() => {})

  const userRmsRef = useRef(0)
  const agentRmsRef = useRef(0)
  const audioTickCallbacksRef = useRef<Set<VoiceTickCallback>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastSpeakerRef = useRef<'user' | 'agent' | 'idle'>('idle')
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const isDraggingRef = useRef(false)

  const x = useMotionValue(0)
  const cardScale = useMotionValue(1)
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

  // Mark each card as displayed as soon as it becomes current.
  useEffect(() => {
    displayedCardIndicesRef.current.add(currentCardIndex)
  }, [currentCardIndex])

  // Fire PATCH reviewed:true for every card shown this session (fire-and-forget).
  doWriteBackRef.current = () => {
    displayedCardIndicesRef.current.forEach(idx => {
      const id = phrasesRef.current[idx]?.id
      if (!id) return
      fetch(`/api/practice-items/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewed: true }),
      }).catch(() => {})
    })
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

  // Shared advance path: a button tap animates the card off-screen exactly
  // like a swipe release, then runs the matching handler. Swipe-release and
  // the Back/Next pills both call this so the two affordances feel identical.
  //
  // The outgoing card flies off in the gesture direction; once the content has
  // swapped, the incoming card is placed just off the trailing edge and settles
  // into place (slide + fade + a small scale lift). Without this the next card
  // snapped in dead — the entrance is where the deck reads as a deck.
  function animateThenAdvance(dir: 'next' | 'back') {
    if (dir === 'back' && currentCardIndex === 0) {
      void animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 })
      return
    }
    const run = () => {
      if (dir === 'next') handleAdvanceCard()
      else handleGoBack()
    }
    if (reducedMotion) {
      run()
      x.set(0); cardOpacity.set(1); cardScale.set(1)
      return
    }
    const ENTER = [0.25, 1, 0.5, 1] as const
    void Promise.all([
      animate(x, dir === 'next' ? 400 : -400, { duration: 0.2, ease: [0.4, 0, 1, 1] }),
      animate(cardOpacity, 0, { duration: 0.2 }),
    ]).then(() => {
      run()
      // Incoming card starts just off the trailing edge, slightly small and
      // transparent, then eases home.
      x.set(dir === 'next' ? -44 : 44)
      cardScale.set(0.97)
      cardOpacity.set(0)
      void animate(x, 0, { duration: 0.34, ease: ENTER })
      void animate(cardScale, 1, { duration: 0.34, ease: ENTER })
      void animate(cardOpacity, 1, { duration: 0.28, ease: ENTER })
    })
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
    doWriteBackRef.current()
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
    // Calm "Listening Room" close — a quiet settle, not a celebration. The
    // checkmark draws itself, one soft ring expands once, and the copy lands
    // in a gentle stagger. Reduced-motion snaps to the finished frame.
    const reveal = (delay: number) =>
      reducedMotion
        ? { initial: false as const }
        : {
            initial: { opacity: 0, y: 8 },
            animate: { opacity: 1, y: 0 },
            transition: { delay, duration: 0.4, ease: [0.25, 1, 0.5, 1] as const },
          }
    return (
      <motion.div
        className="fixed flex flex-col items-center justify-center gap-5 bg-background z-10 px-8 text-center"
        style={{
          top: 'calc(var(--header-height) + env(safe-area-inset-top))',
          left: 0,
          right: 0,
          bottom: 'var(--bottom-nav-h)',
        }}
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
      >
        <motion.div
          className="relative w-16 h-16 rounded-full bg-accent-primary flex items-center justify-center"
          initial={reducedMotion ? false : { scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.34, 1.2, 0.64, 1] }}
        >
          {!reducedMotion && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-accent-primary"
              initial={{ opacity: 0.5, scale: 1 }}
              animate={{ opacity: 0, scale: 1.9 }}
              transition={{ delay: 0.35, duration: 1, ease: 'easeOut' }}
            />
          )}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 text-on-accent"
            aria-hidden="true"
          >
            <motion.polyline
              points="20 6 9 17 4 12"
              initial={reducedMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.25, duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
            />
          </svg>
        </motion.div>
        <motion.h2 className="text-2xl font-serif text-text-primary" {...reveal(0.45)}>
          {t('lesson.completeHeading', { n: phrases.length })}
        </motion.h2>
        <motion.p className="text-base text-text-secondary -mt-2" {...reveal(0.55)}>
          {t('lesson.completeSub')}
        </motion.p>
        <motion.div {...reveal(0.65)}>
          <Link
            href="/"
            onClick={() => { doWriteBackRef.current(); onExitRef.current() }}
            className="inline-flex min-h-11 items-center px-6 py-2.5 text-sm font-medium rounded-xl bg-accent-primary text-on-accent hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 transition-colors"
          >
            {t('lesson.practiseAgain')}
          </Link>
        </motion.div>
      </motion.div>
    )
  }

  const isEnding = lessonState === 'ending'
  const card = phrases[currentCardIndex]
  // English (native-language) gloss shown under the Spanish phrase as a quiet
  // recall anchor. `flashcard_front` is the native sentence with the equivalent
  // phrase in [[brackets]] — we lift that phrase one tone so the eye lands on
  // the meaning. Null/absent → no gloss, card falls back to the phrase alone.
  const gloss = card.flashcard_front ? parseFlashcard(card.flashcard_front) : null
  // Target sentence with the learned phrase in [[brackets]]. When present we
  // render the full sentence (recall context) and tint only the bracketed
  // phrase Practise Green — the brand's learning-moment colour — so the eye
  // lands on the exact thing being studied. Absent/legacy → fall back to the
  // bare correction in the violet UI accent.
  const back = card.flashcard_back ? parseFlashcard(card.flashcard_back) : null
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
                className="relative flex h-2.5 w-2.5 items-center justify-center"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-border-subtle" />
                {i === currentCardIndex && (
                  <motion.span
                    layoutId="active-pip"
                    className="absolute inset-0 rounded-full bg-accent-primary"
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { type: 'spring', stiffness: 480, damping: 34 }
                    }
                  />
                )}
              </span>
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
            style={{ x, scale: cardScale, opacity: cardOpacity, touchAction: 'pan-y' }}
            onDragStart={() => { isDraggingRef.current = true }}
            onDragEnd={(_, info) => {
              if (info.offset.x > SWIPE_THRESHOLD) animateThenAdvance('next')
              else if (info.offset.x < -SWIPE_THRESHOLD) animateThenAdvance('back')
              else void animate(x, 0, { type: 'spring', stiffness: 300, damping: 30 })
              setTimeout(() => { isDraggingRef.current = false }, 0)
            }}
            className="w-full bg-surface border border-border rounded-2xl px-6 py-8 min-h-[208px] flex flex-col justify-center gap-3 cursor-grab active:cursor-grabbing select-none"
          >
            {back && back.phrase !== '' ? (
              <p className="text-2xl font-serif text-text-primary leading-snug text-center text-balance">
                {back.before}
                <span className="text-correction font-semibold bg-widget-write-bg/60 rounded px-1.5 -mx-0.5 box-decoration-clone">
                  {back.phrase}
                </span>
                {back.after}
              </p>
            ) : (
              <p className="text-2xl font-serif text-accent-primary leading-snug text-center text-balance">
                {card.correction}
              </p>
            )}
            {gloss && (
              <p
                data-testid="lesson-card-gloss"
                className="text-lg italic text-text-tertiary leading-snug text-center text-balance"
              >
                {gloss.before}
                {gloss.phrase !== '' && (
                  <span className="not-italic text-text-secondary">{gloss.phrase}</span>
                )}
                {gloss.after}
              </p>
            )}
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
