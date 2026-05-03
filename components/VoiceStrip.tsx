// components/VoiceStrip.tsx
//
// 44px status strip rendered between AppHeader and <main> while a voice
// session is active. Owns the audio-flow indicator (driven by RMS refs in
// VoiceController via `indicatorRef`), the language pill, mute, and end.
//
// Surface side-effect: on mount the strip writes `--voice-strip-height` so
// `<main>`'s top margin grows in lockstep with the strip's appearance.
// Cleared on unmount. The strip itself is fixed below the header via CSS
// rather than affecting layout flow — `<main>` learns about its presence
// purely through the CSS variable.
'use client'
import { useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  muted: boolean
  indicatorRef: React.RefObject<HTMLDivElement | null>
  onMute: () => void
  onEnd: () => void
}

export function VoiceStrip({ muted, indicatorRef, onMute, onEnd }: Props) {
  const { t, targetLanguage } = useTranslation()
  const pillKey = targetLanguage === 'en-NZ' ? 'voice.languagePill.enNZ' : 'voice.languagePill.esAR'

  useEffect(() => {
    document.documentElement.style.setProperty('--voice-strip-height', '2.75rem')
    return () => {
      document.documentElement.style.removeProperty('--voice-strip-height')
    }
  }, [])

  return (
    <div
      role="region"
      aria-label={t('voice.regionAria')}
      className="
        fixed left-0 right-0 z-30
        h-11
        border-b border-border-subtle
      "
      style={{
        top: 'calc(var(--header-height) + env(safe-area-inset-top))',
        background:
          'color-mix(in oklch, var(--color-surface-elevated) 92%, var(--color-accent-primary) 8%)',
      }}
    >
      <div
        role="toolbar"
        aria-label={t('voice.toolbarAria')}
        className="h-full max-w-2xl mx-auto px-4 md:px-10 flex items-center gap-2"
      >
        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <div ref={indicatorRef} className="voice-indicator" data-speaker="idle" data-muted={muted ? 'true' : 'false'} />
        </div>

        <span className="text-xs font-medium text-text-primary whitespace-nowrap">
          {t('voice.coachTitle')}
        </span>

        <span
          className="
            text-[10px] font-medium uppercase tracking-wider
            text-on-accent-chip bg-accent-chip
            border border-accent-chip-border/40
            px-2 py-0.5 rounded-full whitespace-nowrap
          "
        >
          {t(pillKey)}
        </span>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onMute}
          aria-label={muted ? t('voice.unmuteAria') : t('voice.muteAria')}
          aria-pressed={muted}
          className="
            w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            text-text-secondary hover:text-text-primary
            aria-pressed:bg-error-surface aria-pressed:text-on-error-surface
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
        >
          <Icon name={muted ? 'mic-off' : 'mic'} className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onEnd}
          aria-label={t('voice.endAria')}
          className="
            w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            text-text-secondary hover:text-text-primary
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
        >
          <Icon name="close" className="w-4 h-4" />
        </button>
      </div>

      <span aria-live="polite" className="sr-only">
        {t('voice.connectedAnnouncement')}
      </span>
    </div>
  )
}
