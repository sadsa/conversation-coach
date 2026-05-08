// components/VoiceWaveMode.tsx
//
// Mobile voice session strip — same footprint as the bottom nav.
//
// Architecture: a single 4rem (h-16) row of controls. Left of the row
// holds an <AudioReactiveDots> cluster (7 dots rippling with amplitude).
// A border-t defines the strip's top edge against the page content above.
//
// voiceState variants:
//   'connecting' — dots at rest (no audio yet), spinner in controls row
//   'active'     — oscillating dots + mute/end controls
//   'muted'      — dots clamped to rest height + pressed mute style
//
// CSS variable --voice-bottom-height is written on mount / cleared on
// unmount so <main>'s paddingBottom keeps page content clear of the strip.
'use client'
import { useEffect } from 'react'
import type React from 'react'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'
import { AudioReactiveDots } from '@/components/AudioReactiveDots'
import type { VoiceTickCallback } from '@/components/VoiceController'

// Total strip height matches the bottom-nav footprint exactly (h-16 = 4rem
// of content + safe-area inset). The audio-reactive bar lives at the 2px
// top edge, not in a separate zone.
const TOTAL_HEIGHT = 'calc(4rem + env(safe-area-inset-bottom))'

interface Props {
  voiceState: 'connecting' | 'active' | 'muted'
  audioTickCallbacksRef: React.MutableRefObject<Set<VoiceTickCallback>>
  onMute: () => void
  onEnd: () => void
  exiting?: boolean
}

export function VoiceWaveMode({ voiceState, audioTickCallbacksRef, onMute, onEnd, exiting }: Props) {
  const { t } = useTranslation()
  const connecting = voiceState === 'connecting'
  const muted = voiceState === 'muted'
  const animClass = exiting ? 'voice-wave-exit' : 'voice-wave-anim'

  // Reserve bottom padding on <main> so the strip doesn't overlap content.
  useEffect(() => {
    document.documentElement.style.setProperty('--voice-bottom-height', TOTAL_HEIGHT)
    return () => {
      document.documentElement.style.removeProperty('--voice-bottom-height')
    }
  }, [])

  return (
    <div
      aria-hidden={connecting ? true : undefined}
      className={`md:hidden fixed left-0 right-0 bottom-0 z-[28] ${animClass}`}
      style={{ height: TOTAL_HEIGHT }}
    >
      {/* Surface + top border to define the strip edge against page content. */}
      <div aria-hidden className="absolute inset-0 bg-surface border-t border-border-subtle" />

      {/* Controls row — bottom-nav height (h-16) so the strip replaces the
          nav with the same footprint. */}
      <div
        role={connecting ? undefined : 'region'}
        aria-label={connecting ? undefined : t('voice.regionAria')}
        aria-keyshortcuts={connecting ? undefined : 'Escape Space'}
        className="absolute left-0 right-0 bottom-0"
        style={{
          height: TOTAL_HEIGHT,
          paddingBottom: 'env(safe-area-inset-bottom)',
          pointerEvents: 'auto',
          zIndex: 10,
        }}
      >
        <div className="h-full flex items-center px-6 gap-3">
          {connecting ? (
            <>
              <span className="flex-1 text-sm text-text-secondary select-none">
                {t('voice.connecting')}
              </span>
              <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                <Icon name="spinner" className="w-5 h-5 text-text-secondary" />
              </div>
            </>
          ) : (
            <>
              {/* Oscillating dots — the primary live indicator. Left-anchored
                  so the eye sees the animation before reading the status text. */}
              <AudioReactiveDots audioTickCallbacksRef={audioTickCallbacksRef} />

              <span className="flex-1 text-sm text-text-secondary select-none">
                {muted ? t('voice.statusMuted') : t('voice.statusListening')}
              </span>

              <button
                type="button"
                onClick={onMute}
                aria-label={muted ? t('voice.unmuteAria') : t('voice.muteAria')}
                aria-pressed={muted}
                className="
                  w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0
                  text-text-primary hover:bg-surface-elevated
                  aria-pressed:bg-text-tertiary/15 aria-pressed:text-text-tertiary
                  transition-colors
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
                "
              >
                <Icon name={muted ? 'mic-off' : 'mic'} className="w-5 h-5" />
              </button>

              {/* Pre-press destructive cue: faint rose tint + icon shift on
                  hover, deeper rose on active so intent is visible BEFORE
                  the user commits, not just mid-press. */}
              <button
                type="button"
                onClick={onEnd}
                aria-label={t('voice.endAria')}
                className="
                  ml-2 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0
                  text-text-primary hover:bg-rose-500/8 hover:text-rose-600
                  active:bg-rose-500/15
                  transition-colors
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
                "
              >
                <Icon name="close" className="w-5 h-5" />
              </button>

              <span aria-live="polite" className="sr-only">
                {muted ? t('voice.indicatorMuted') : t('voice.statusListening')}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
