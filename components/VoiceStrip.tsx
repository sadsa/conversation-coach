// components/VoiceStrip.tsx
//
// 44px status strip rendered between AppHeader and <main> while a voice
// session is active. Owns the audio-flow indicator (driven by RMS refs in
// VoiceController via `indicatorRef`), mute, and end.
//
// Distilled in 2026-05: dropped the static "Voice coach" title and the
// always-on language pill. Both restated context the user already had
// (the tinted strip + pulsing dot already say "voice session active"),
// and the language pill never earned its space for users who never
// switch target language. The dot becomes the headline; chrome quiets.
//
// Surface side-effect: on mount the strip writes `--voice-strip-height` so
// `<main>`'s top margin grows in lockstep with the strip's appearance.
// Cleared on unmount. The strip itself is fixed below the header via CSS
// rather than affecting layout flow — `<main>` learns about its presence
// purely through the CSS variable. Pairs with `.voice-strip-anim` (slide
// down + fade) and the matching margin-top transition on `<main>` so the
// arrival is choreographed instead of janky.
'use client'
import { useEffect } from 'react'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  muted: boolean
  indicatorRef: React.RefObject<HTMLDivElement>
  onMute: () => void
  onEnd: () => void
  exiting?: boolean
}

export function VoiceStrip({ muted, indicatorRef, onMute, onEnd, exiting }: Props) {
  const { t } = useTranslation()

  useEffect(() => {
    // Only shift <main> on desktop — on mobile the BottomBar handles session
    // controls and this strip is hidden (md:block), so no offset is needed.
    if (!window.matchMedia('(min-width: 768px)').matches) return
    document.documentElement.style.setProperty('--voice-strip-height', '2.75rem')
    return () => {
      document.documentElement.style.removeProperty('--voice-strip-height')
    }
  }, [])

  return (
    <div
      role="region"
      aria-label={t('voice.regionAria')}
      aria-keyshortcuts="Escape Space"
      className={`
        voice-strip--solid ${exiting ? 'voice-strip-exit' : 'voice-strip-anim'}
        hidden md:block
        fixed left-0 right-0 z-30
        h-11
        border-b border-white/20
      `}
      style={{
        top: 'calc(var(--header-height) + env(safe-area-inset-top))',
        background: 'var(--color-accent-primary)',
      }}
    >
      <div
        role="toolbar"
        aria-label={t('voice.toolbarAria')}
        className="h-full max-w-2xl mx-auto px-4 md:px-10 flex items-center gap-2"
      >
        {/* Indicator: outer div provides 32px hit-area spacing; inner div is
            the CSS-driven status dot. voice-strip--solid overrides the dot
            colours so it remains legible on the solid accent background. */}
        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
          <div
            ref={indicatorRef}
            className="voice-indicator"
            data-speaker="idle"
            data-muted={muted ? 'true' : 'false'}
            aria-hidden="true"
          />
        </div>

        {/* Status label */}
        <div className="flex-1 min-w-0">
          <span className="text-[11px] text-white/70 select-none">
            {muted ? t('voice.statusMuted') : t('voice.statusListening')}
          </span>
        </div>

        {/* Keyboard shortcut hint — desktop only. Kept quiet so it reads
            as a footnote, not a competing element. */}
        <span className="hidden md:inline text-[11px] text-white/40 mr-1 select-none whitespace-nowrap">
          {t('voice.shortcutHint')}
        </span>

        <button
          type="button"
          onClick={onMute}
          aria-label={muted ? t('voice.unmuteAria') : t('voice.muteAria')}
          aria-pressed={muted}
          className="
            w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            text-white/80 hover:text-white hover:bg-white/15
            aria-pressed:bg-white/20 aria-pressed:text-white/50
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
          "
        >
          <Icon name={muted ? 'mic-off' : 'mic'} className="w-4 h-4" />
        </button>

        {/* End — ml-2 = 16px total separation from Mute. Red hover tint
            confirms destructive intent on interaction. */}
        <button
          type="button"
          onClick={onEnd}
          aria-label={t('voice.endAria')}
          className="
            ml-2 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            text-white/80 hover:text-white hover:bg-white/15 active:bg-rose-500/25
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
          "
        >
          <Icon name="close" className="w-4 h-4" />
        </button>
      </div>

      {/* Session-connected announcement — fires once on mount. */}
      <span aria-live="polite" className="sr-only">
        {t('voice.connectedAnnouncement')}
      </span>
      {/* Mute-state announcement — announce both directions so SR users
          hear confirmation when unmuting as well as muting. */}
      <span aria-live="polite" className="sr-only">
        {muted ? t('voice.indicatorMuted') : t('voice.statusListening')}
      </span>
    </div>
  )
}
