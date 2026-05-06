// components/ConditionalNav.tsx
'use client'
import { useState } from 'react'
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

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  const voiceActive = voice.state === 'active' || voice.state === 'muted'

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
          onStart: voice.start,
          onMute: voice.toggleMute,
          onEnd: voice.end,
        }}
      />
      {voiceActive && (
        <VoiceStrip
          muted={voice.state === 'muted'}
          indicatorRef={voice.indicatorRef}
          onMute={voice.toggleMute}
          onEnd={voice.end}
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
