// components/ConditionalNav.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { NavDrawer } from '@/components/NavDrawer'
import { BottomBar } from '@/components/BottomBar'
import { VoiceStrip } from '@/components/VoiceStrip'
import { useVoiceController } from '@/components/VoiceController'
import { useTranslation } from '@/components/LanguageProvider'
import { Toast } from '@/components/Toast'

const HIDDEN_ON = ['/login', '/access-denied', '/onboarding', '/auth']

export function ConditionalNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const voice = useVoiceController()
  const { t } = useTranslation()

  const voiceActive = voice.state === 'active' || voice.state === 'muted'

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
        voice={{
          state: voice.state,
          mobileIndicatorRef: voice.mobileIndicatorRef,
          audioTickCallbackRef: voice.audioTickCallbackRef,
          onStart: voice.start,
          onMute: voice.toggleMute,
          onEnd: voice.end,
        }}
      />
      {showStrip && (
        <VoiceStrip
          muted={voice.state === 'muted'}
          indicatorRef={voice.indicatorRef}
          onMute={voice.toggleMute}
          onEnd={voice.end}
          exiting={stripExiting}
        />
      )}
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
    </>
  )
}
