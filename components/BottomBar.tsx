// components/BottomBar.tsx
//
// Mobile-only bottom chrome: navigation tabs + voice session controls.
//
// State machine for the bottom zone:
//   idle       — Voice FAB (bottom-right) + nav tabs
//   connecting — VoiceWaveMode (connecting variant: gradient + spinner) +
//                nav tabs slide away
//   active     — VoiceWaveMode (wave canvas + mute/end controls) +
//                nav tabs slide away
//   muted      — same as active
//   [exiting]  — VoiceWaveMode plays voice-wave-exit (280ms), then unmounts;
//                nav tabs slide back in once wave is gone
//
// VoiceWaveMode mounts for all non-idle states so the gradient bleed appears
// immediately on connect — eliminating the jarring idle→immersive jump that
// occurred when it only mounted on active/muted.
'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { NAV_TABS, isTabActive } from '@/components/nav-tabs'
import { VoiceCoachmark } from '@/components/VoiceCoachmark'
import { VoiceWaveMode } from '@/components/VoiceWaveMode'
import { Icon } from '@/components/Icon'
import type { VoiceTriggerState } from '@/components/VoiceTrigger'
import type { VoiceTickCallback } from '@/components/VoiceController'
import type React from 'react'

interface Props {
  voice: {
    state: VoiceTriggerState
    mobileIndicatorRef: React.RefObject<HTMLDivElement>
    audioTickCallbacksRef: React.MutableRefObject<Set<VoiceTickCallback>>
    onStart: () => void
    onMute: () => void
    onEnd: () => void
  }
}

export function BottomBar({ voice }: Props) {
  const pathname = usePathname() ?? ''
  const { t } = useTranslation()

  const showWaveModeNow = voice.state !== 'idle'

  // Delayed unmount — keep VoiceWaveMode mounted for the exit animation
  // duration (280ms) after the session returns to idle.
  const [showWave, setShowWave] = useState(false)
  const [waveExiting, setWaveExiting] = useState(false)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevShowWave = useRef(false)

  useEffect(() => {
    if (showWaveModeNow && !prevShowWave.current) {
      // Session started — mount immediately, cancel any pending exit.
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
      setWaveExiting(false)
      setShowWave(true)
    } else if (!showWaveModeNow && prevShowWave.current) {
      // Session ended — play exit animation then unmount.
      setWaveExiting(true)
      exitTimerRef.current = setTimeout(() => {
        setShowWave(false)
        setWaveExiting(false)
        exitTimerRef.current = null
      }, 300)
    }
    prevShowWave.current = showWaveModeNow
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [showWaveModeNow])

  const voiceState = voice.state === 'idle' ? 'active' : voice.state // fallback unused (showWave guards render)

  return (
    <>
      {/* Wave mode — mounts on first non-idle state, exits with animation. */}
      {showWave && (
        <VoiceWaveMode
          voiceState={voiceState as 'connecting' | 'active' | 'muted'}
          audioTickCallbacksRef={voice.audioTickCallbacksRef}
          onMute={voice.onMute}
          onEnd={voice.onEnd}
          exiting={waveExiting}
        />
      )}

      {/* Voice FAB — only while fully idle (guard both the direct state and
          the delayed showWave flag to avoid a one-render flash during the
          idle→connecting transition before the effect has fired). */}
      {voice.state === 'idle' && !showWave && !pathname?.startsWith('/practice') && (
        <div
          className="md:hidden fixed right-4 z-10"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            data-sheet-preserve
            onClick={voice.onStart}
            aria-label={t('voice.startAria')}
            className="
              w-14 h-14 rounded-full flex items-center justify-center
              bg-accent-primary text-white shadow-lg
              transition-[box-shadow,transform] hover:bg-accent-primary-hover active:scale-95
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
            "
          >
            <Icon name="waveform" className="w-6 h-6" aria-hidden />
          </button>

          <VoiceCoachmark visible={voice.state === 'idle'} direction="up" />
        </div>
      )}

      {/* Navigation tabs — slide off-screen while wave mode is showing
          (including during exit animation) so they don't peek behind the
          fading gradient. Slide back in once the wave is fully gone. */}
      <nav
        className={`
          md:hidden fixed bottom-0 left-0 right-0 z-30
          bg-surface border-t border-border-subtle
          transition-transform duration-200 ease-in-out
          ${showWave ? 'translate-y-full' : 'translate-y-0'}
        `}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label={t('nav.quickNavAria')}
      >
        <div className="flex h-16 max-w-2xl mx-auto">
          {NAV_TABS.map(tab => {
            const active = isTabActive(tab, pathname)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-accent-primary' : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {tab.iconLg}
                <span className="text-xs font-medium">{t(tab.labelKey)}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Hidden div keeps mobileIndicatorRef valid for the controller's
          applyIndicator() call. The dot is invisible but the ref is live. */}
      <div
        ref={voice.mobileIndicatorRef}
        className="sr-only"
        aria-hidden
        data-speaker="idle"
        data-muted="false"
      />
    </>
  )
}
