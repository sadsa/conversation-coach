// components/VoiceStrip.tsx
//
// Desktop-only 44px status strip rendered between AppHeader and <main>
// while a voice session is active. Owns mute, end, and an audio-reactive
// bar at the bottom edge (mirroring the mobile VoiceWaveMode pattern).
//
// 2026-05 colorize pass: dropped the solid violet `voice-strip--solid`
// band and the white-on-violet treatment. The strip now matches the
// mobile aesthetic — bg-surface fill, semantic-token text/icons, and
// the same <AudioReactiveBar> at its bottom edge that mobile uses at
// its top edge. The dot indicator was removed in favour of the bar so
// both surfaces speak one visual language for the same data signal.
//
// 2026-05 distill pass: the keyboard shortcut hint is now first-3-sessions
// only (gated by a localStorage counter). aria-keyshortcuts stays in place
// so AT users always get the announcement.
//
// Surface side-effect: on mount the strip writes `--voice-strip-height` so
// `<main>`'s top margin grows in lockstep with the strip's appearance.
// Cleared on unmount. The strip itself is fixed below the header via CSS
// rather than affecting layout flow — `<main>` learns about its presence
// purely through the CSS variable. Pairs with `.voice-strip-anim` (slide
// down + fade) and the matching margin-top transition on `<main>` so the
// arrival is choreographed instead of janky.
'use client'
import { useEffect, useState } from 'react'
import type React from 'react'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'
import { AudioReactiveDots } from '@/components/AudioReactiveDots'
import type { VoiceTickCallback } from '@/components/VoiceController'

const SHORTCUT_HINT_LIMIT_KEY = 'cc:voice-shortcut-hint-seen'
const SHORTCUT_HINT_LIMIT = 3

interface Props {
  muted: boolean
  audioTickCallbacksRef: React.MutableRefObject<Set<VoiceTickCallback>>
  onMute: () => void
  onEnd: () => void
  exiting?: boolean
}

export function VoiceStrip({ muted, audioTickCallbacksRef, onMute, onEnd, exiting }: Props) {
  const { t } = useTranslation()
  const [showShortcutHint, setShowShortcutHint] = useState(false)

  useEffect(() => {
    if (!window.matchMedia('(min-width: 768px)').matches) return
    document.documentElement.style.setProperty('--voice-strip-height', '2.75rem')
    return () => {
      document.documentElement.style.removeProperty('--voice-strip-height')
    }
  }, [])

  // Distill: surface the keyboard-shortcut hint only for the first
  // SHORTCUT_HINT_LIMIT sessions, then auto-graduate. Power users learn
  // the shortcuts within their first couple of sessions; permanent hint
  // text is just chrome by then. The aria-keyshortcuts attribute stays
  // unconditionally so screen-reader users always get the announcement.
  useEffect(() => {
    try {
      const seen = parseInt(window.localStorage.getItem(SHORTCUT_HINT_LIMIT_KEY) || '0', 10)
      setShowShortcutHint(seen < SHORTCUT_HINT_LIMIT)
      window.localStorage.setItem(SHORTCUT_HINT_LIMIT_KEY, String(seen + 1))
    } catch {
      // localStorage unavailable (private mode, quotas, etc.) — show
      // the hint anyway. Worst case: the user keeps seeing it. Better
      // than hiding it from someone who hasn't learned it yet.
      setShowShortcutHint(true)
    }
  }, [])

  return (
    <div
      role="region"
      aria-label={t('voice.regionAria')}
      aria-keyshortcuts="Escape Space"
      className={`
        ${exiting ? 'voice-strip-exit' : 'voice-strip-anim'}
        hidden md:block
        fixed left-0 right-0 z-30
        h-11
        bg-surface border-b border-border-subtle
      `}
      style={{
        top: 'calc(var(--header-height) + env(safe-area-inset-top))',
      }}
    >
      <div
        role="toolbar"
        aria-label={t('voice.toolbarAria')}
        className="h-full max-w-2xl mx-auto px-4 md:px-10 flex items-center gap-2"
      >
        {/* Oscillating dots — compact variant for the 44px strip. */}
        <AudioReactiveDots
          audioTickCallbacksRef={audioTickCallbacksRef}
          compact
        />

        <div className="flex-1 min-w-0">
          <span className="text-xs text-text-secondary select-none">
            {muted ? t('voice.statusMuted') : t('voice.statusListening')}
          </span>
        </div>

        {/* Keyboard shortcut hint — first-N-sessions only. Quieter token
            than before so it reads as a footnote, not a competing element. */}
        {showShortcutHint && (
          <span className="text-xs text-text-tertiary mr-1 select-none whitespace-nowrap">
            {t('voice.shortcutHint')}
          </span>
        )}

        <button
          type="button"
          onClick={onMute}
          aria-label={muted ? t('voice.unmuteAria') : t('voice.muteAria')}
          aria-pressed={muted}
          className="
            w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            text-text-primary hover:bg-surface-elevated
            aria-pressed:bg-text-tertiary/15 aria-pressed:text-text-tertiary
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
        >
          <Icon name={muted ? 'mic-off' : 'mic'} className="w-4 h-4" />
        </button>

        {/* End — pre-press destructive cue (faint rose on hover, deeper on
            active). Now that the strip lives on cream rather than violet,
            the warm-cool clash that prevented this earlier is gone. */}
        <button
          type="button"
          onClick={onEnd}
          aria-label={t('voice.endAria')}
          className="
            ml-2 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
            text-text-primary hover:bg-rose-500/8 hover:text-rose-600
            active:bg-rose-500/15
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
        >
          <Icon name="close" className="w-4 h-4" />
        </button>
      </div>

      {/* Session-connected announcement — fires once on mount. */}
      <span aria-live="polite" className="sr-only">
        {t('voice.connectedAnnouncement')}
      </span>
      {/* Mute-state announcement — announces both directions so SR users
          hear confirmation when unmuting as well as muting. */}
      <span aria-live="polite" className="sr-only">
        {muted ? t('voice.indicatorMuted') : t('voice.statusListening')}
      </span>
    </div>
  )
}
