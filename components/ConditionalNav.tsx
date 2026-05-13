// components/ConditionalNav.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { NavDrawer } from '@/components/NavDrawer'
import { BottomBar } from '@/components/BottomBar'
import { VoiceStrip } from '@/components/VoiceStrip'
import { useVoiceSave, VoiceReviewStrip } from '@/components/VoiceSave'
import { useTranslation } from '@/components/LanguageProvider'
import { Toast } from '@/components/Toast'

const HIDDEN_ON = ['/login', '/access-denied', '/onboarding', '/auth']

export function ConditionalNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const voice = useVoiceSave()
  const { t } = useTranslation()

  const isReviewActive =
    voice.reviewState === 'review' ||
    voice.reviewState === 'analysing' ||
    voice.reviewState === 'error'

  const voiceActive =
    voice.state === 'active' ||
    voice.state === 'muted' ||
    isReviewActive

  // Centrally manage --voice-bottom-height for mobile so VoiceWaveMode and
  // VoiceReviewStrip don't race to set/remove the same CSS variable.
  useEffect(() => {
    const waveActive = voice.state === 'active' || voice.state === 'muted' || voice.state === 'connecting'
    if (!waveActive && !isReviewActive) {
      document.documentElement.style.removeProperty('--voice-bottom-height')
      return
    }
    const h = isReviewActive
      ? 'calc(7rem + env(safe-area-inset-bottom))'
      : 'calc(4rem + env(safe-area-inset-bottom))'
    document.documentElement.style.setProperty('--voice-bottom-height', h)
    return () => {
      document.documentElement.style.removeProperty('--voice-bottom-height')
    }
  }, [voice.state, isReviewActive])

  // Delayed unmount for the desktop strip — keeps it mounted for the
  // voice-strip-exit animation (220ms) before removing from the DOM.
  const [showStrip, setShowStrip] = useState(false)
  const [stripExiting, setStripExiting] = useState(false)
  const stripTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevActive = useRef(false)

  useEffect(() => {
    if (voiceActive && !prevActive.current) {
      if (stripTimerRef.current) clearTimeout(stripTimerRef.current)
      setStripExiting(false)
      setShowStrip(true)
    } else if (!voiceActive && prevActive.current) {
      setStripExiting(true)
      stripTimerRef.current = setTimeout(() => {
        setShowStrip(false)
        setStripExiting(false)
        stripTimerRef.current = null
      }, 260)
    }
    prevActive.current = voiceActive
    return () => {
      if (stripTimerRef.current) clearTimeout(stripTimerRef.current)
    }
  }, [voiceActive])

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  return (
    <>
      <AppHeader
        isOpen={isOpen}
        onOpen={() => setIsOpen(true)}
        voice={{ state: voice.state, onStart: voice.start }}
      />
      <NavDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <BottomBar
        reviewActive={isReviewActive}
        voice={{
          state: voice.state,
          mobileIndicatorRef: voice.mobileIndicatorRef,
          audioTickCallbacksRef: voice.audioTickCallbacksRef,
          onStart: voice.start,
          onMute: voice.toggleMute,
          onEnd: voice.end,
        }}
      />
      {showStrip && (
        <VoiceStrip
          muted={voice.state === 'muted'}
          audioTickCallbacksRef={voice.audioTickCallbacksRef}
          onMute={voice.toggleMute}
          onEnd={voice.end}
          exiting={stripExiting}
          reviewMode={
            voice.reviewState === 'review' || voice.reviewState === 'analysing' || voice.reviewState === 'error'
              ? {
                  durationSecs: voice.durationSecs,
                  saving: voice.reviewState === 'analysing',
                  onSave: voice.save,
                  onDiscard: voice.discard,
                  onResume: voice.resume,
                }
              : undefined
          }
        />
      )}
      <VoiceReviewStrip
        open={isReviewActive}
        durationSecs={voice.durationSecs}
        saving={voice.reviewState === 'analysing'}
        onSave={voice.save}
        onDiscard={voice.discard}
        onResume={voice.resume}
      />
      {voice.toast && (
        <Toast
          message={voice.toast.message}
          toastKey={voice.toastKey}
          action={
            voice.toast.retryable
              ? { label: t('voice.tryAgain'), onClick: voice.start }
              : undefined
          }
        />
      )}
      {voice.discardToast && (
        <Toast
          message={t('voiceSave.discardToast')}
          toastKey={voice.discardToast.key}
          action={{ label: t('voiceSave.discardUndo'), onClick: voice.undoDiscard }}
        />
      )}
      {voice.saveError && (
        <Toast
          message={t('voiceSave.errorSave')}
          toastKey={voice.saveErrorKey}
          action={{ label: t('voice.tryAgain'), onClick: voice.save }}
        />
      )}
    </>
  )
}
