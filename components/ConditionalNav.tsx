// components/ConditionalNav.tsx
'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { NavDrawer } from '@/components/NavDrawer'
import { BottomNav } from '@/components/BottomNav'
import { VoiceStrip } from '@/components/VoiceStrip'
import { VoiceCoachmark } from '@/components/VoiceCoachmark'
import { useVoiceController } from '@/components/VoiceController'
import { Toast } from '@/components/Toast'

const HIDDEN_ON = ['/login', '/access-denied', '/onboarding', '/auth']

export function ConditionalNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const voice = useVoiceController()

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  const voiceActive = voice.state === 'active' || voice.state === 'muted'

  return (
    <>
      <AppHeader
        isOpen={isOpen}
        onOpen={() => setIsOpen(true)}
        voice={{ state: voice.state, onStart: voice.start }}
      />
      <VoiceCoachmark visible={voice.state === 'idle'} />
      <NavDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <BottomNav />
      {voiceActive && (
        <VoiceStrip
          muted={voice.state === 'muted'}
          indicatorRef={voice.indicatorRef}
          onMute={voice.toggleMute}
          onEnd={voice.end}
        />
      )}
      {voice.toast && <Toast message={voice.toast} toastKey={voice.toastKey} />}
    </>
  )
}
