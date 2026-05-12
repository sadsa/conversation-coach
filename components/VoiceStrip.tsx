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

        {muted && (
          <span className="flex-1 min-w-0 text-xs font-medium select-none text-amber-600 dark:text-amber-400">
            {t('voice.statusMuted')}
          </span>
        )}
        {!muted && <div className="flex-1" />}

        {/* Keyboard shortcut hint — first-N-sessions only. Quieter token
            than before so it reads as a footnote, not a competing element. */}
        {showShortcutHint && (
          <span className="text-xs text-text-tertiary mr-1 select-none whitespace-nowrap">
            {t('voice.shortcutHint')}
          </span>
        )}

        {/* Mute — amber when muted so the silenced state is immediately
            legible ("you're muted, the coach can't hear you"), not just a
            slightly dimmed icon that blends into the toolbar at a glance. */}
        <button
          type="button"
          onClick={onMute}
          aria-label={muted ? t('voice.unmuteAria') : t('voice.muteAria')}
          aria-pressed={muted}
          className="
            inline-flex items-center justify-center gap-1.5
            h-8 px-2.5 rounded-full flex-shrink-0
            text-text-secondary hover:bg-surface-elevated hover:text-text-primary
            active:opacity-75
            aria-pressed:bg-amber-500/15 aria-pressed:text-amber-600
            dark:aria-pressed:text-amber-400
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
        >
          <Icon name={muted ? 'mic-off' : 'mic'} className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-medium select-none">
            {muted ? t('voice.unmuteLabel') : t('voice.muteLabel')}
          </span>
        </button>

        {/* End — phone-hangup icon (not X/close, which reads as "dismiss
            this strip") with rose at rest so the destructive intent is
            clear before hover, not discovered on hover. */}
        <button
          type="button"
          onClick={onEnd}
          aria-label={t('voice.endAria')}
          className="
            ml-1 inline-flex items-center justify-center gap-1.5
            h-8 px-2.5 rounded-full flex-shrink-0
            text-rose-600 dark:text-rose-400
            hover:bg-rose-500/20
            active:bg-rose-500/30
            transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          "
        >
          <Icon name="phone-hangup" className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-medium select-none">
            {t('voice.endLabel')}
          </span>
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
