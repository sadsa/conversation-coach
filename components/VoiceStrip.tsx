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
}

export function VoiceStrip({ muted, indicatorRef, onMute, onEnd }: Props) {
  const { t } = useTranslation()

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
      aria-keyshortcuts="Escape Space"
      className="
        voice-strip-anim
        fixed left-0 right-0 z-30
        h-11
        border-b border-border-subtle
      "
      style={{
        top: 'calc(var(--header-height) + env(safe-area-inset-top))',
        // Bumped from 8% to 12% so the "session is live" cue holds up in
        // bright sunlight on cheap displays without shouting indoors.
        background:
          'color-mix(in oklch, var(--color-surface-elevated) 88%, var(--color-accent-primary) 12%)',
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

        <div className="flex-1" />

        {/* Keyboard shortcut hint — desktop only because the strip is roomy
            there. Mobile users don't have a keyboard so the chrome cost
            isn't worth the signal. Tertiary tone keeps it as a sidenote
            rather than a competing element. */}
        <span className="hidden md:inline text-[11px] text-text-tertiary mr-1 select-none whitespace-nowrap">
          {t('voice.shortcutHint')}
        </span>

        <button
          type="button"
          onClick={onMute}
          aria-label={muted ? t('voice.unmuteAria') : t('voice.muteAria')}
          aria-pressed={muted}
          className="
            w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            text-text-secondary hover:text-text-primary
            aria-pressed:bg-text-tertiary/15 aria-pressed:text-text-tertiary
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
        >
          <Icon name={muted ? 'mic-off' : 'mic'} className="w-4 h-4" />
        </button>

        {/* End — destructive. Tinted in error-text so the user reads the
            red-on-the-X as "this kills the session" rather than as a
            generic close affordance. Hover deepens the bg without changing
            the foreground tone (it's already saying everything it needs). */}
        <button
          type="button"
          onClick={onEnd}
          aria-label={t('voice.endAria')}
          className="
            w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            text-on-error-surface hover:bg-error-surface
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
