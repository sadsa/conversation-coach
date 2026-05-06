// components/BottomBar.tsx
//
// Mobile-only bottom chrome: navigation tabs + voice session controls.
// Replaces the separate BottomNav + header-anchored voice trigger pattern —
// both surfaces live here where they're thumb-reachable.
//
// Voice FAB: accent-tinted pill, same right-4 bottom-right position as the
// former Upload FAB, so returning users find a familiar affordance in a
// familiar place. Replaced by an inline session-controls strip (above the
// nav bar) when a voice session is live — the FAB disappears and mute/end
// take its slot visually, leaving the nav tabs always accessible below.
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { NAV_TABS, isTabActive } from '@/components/nav-tabs'
import { VoiceCoachmark } from '@/components/VoiceCoachmark'
import { Icon } from '@/components/Icon'
import type { VoiceTriggerState } from '@/components/VoiceTrigger'

interface Props {
  voice: {
    state: VoiceTriggerState
    mobileIndicatorRef: React.RefObject<HTMLDivElement>
    onStart: () => void
    onMute: () => void
    onEnd: () => void
  }
}

export function BottomBar({ voice }: Props) {
  const pathname = usePathname() ?? ''
  const { t } = useTranslation()

  const voiceActive = voice.state === 'active' || voice.state === 'muted'
  const isConnecting = voice.state === 'connecting'

  return (
    <>
      {/* Session controls strip — slides in above the nav bar when a voice
          session is live. Mirrors the desktop VoiceStrip visually (same
          accent-tinted background, same mute/end controls) but lives at
          the bottom instead of below the header. The voice FAB is hidden
          while this strip is shown so there's never two concurrent
          "manage session" surfaces on screen. */}
      {voiceActive && (
        <div
          role="region"
          aria-label={t('voice.regionAria')}
          className="md:hidden fixed left-0 right-0 z-30 h-11 flex items-center gap-2 px-4 border-t border-border-subtle voice-strip-anim"
          style={{
            bottom: 'calc(4rem + env(safe-area-inset-bottom))',
            background:
              'color-mix(in oklch, var(--color-surface-elevated) 88%, var(--color-accent-primary) 12%)',
          }}
        >
          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
            <div
              ref={voice.mobileIndicatorRef}
              className="voice-indicator"
              data-speaker="idle"
              data-muted={voice.state === 'muted' ? 'true' : 'false'}
              aria-hidden="true"
            />
          </div>

          <span className="flex-1 text-[11px] text-text-tertiary select-none">
            {voice.state === 'muted' ? t('voice.statusMuted') : t('voice.statusListening')}
          </span>

          <button
            type="button"
            onClick={voice.onMute}
            aria-label={voice.state === 'muted' ? t('voice.unmuteAria') : t('voice.muteAria')}
            aria-pressed={voice.state === 'muted'}
            className="
              w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
              text-text-secondary hover:text-text-primary
              aria-pressed:bg-text-tertiary/15 aria-pressed:text-text-tertiary
              transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
            "
          >
            <Icon name={voice.state === 'muted' ? 'mic-off' : 'mic'} className="w-4 h-4" />
          </button>

          {/* ml-2 adds 8px on top of gap-2 = 16px total separation from
              Mute, reducing accidental taps. Destructive tint signals intent. */}
          <button
            type="button"
            onClick={voice.onEnd}
            aria-label={t('voice.endAria')}
            className="
              ml-2 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
              text-on-error-surface hover:bg-error-surface
              transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
            "
          >
            <Icon name="close" className="w-4 h-4" />
          </button>

          <span aria-live="polite" className="sr-only">
            {voice.state === 'muted' ? t('voice.indicatorMuted') : ''}
          </span>
        </div>
      )}

      {/* Voice FAB — accent-tinted circle above the bottom-right of the nav
          bar, same position the Upload FAB held. Hidden when a session is
          active (the strip above takes over). The `fixed` wrapper is the
          containing block for VoiceCoachmark's `absolute` positioning, so
          the bubble appears anchored to this button. */}
      {!voiceActive && (
        <div
          className="md:hidden fixed right-4 z-40"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={isConnecting ? undefined : voice.onStart}
            disabled={isConnecting}
            aria-label={t('voice.startAria')}
            aria-busy={isConnecting || undefined}
            className="
              w-14 h-14 rounded-full flex items-center justify-center
              bg-accent-primary text-white shadow-lg
              transition-[box-shadow,transform] hover:bg-accent-primary-hover active:scale-95
              disabled:cursor-wait
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
            "
          >
            {isConnecting ? (
              <Icon name="spinner" className="w-5 h-5" aria-hidden />
            ) : (
              /* Waveform — 5 vertical bars in a bell-curve shape.
                 Visually distinct from the recordings-tab microphone:
                 that icon = input, this icon = audio/conversation. */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width={22}
                height={22}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="4"  y1="11" x2="4"  y2="13" />
                <line x1="8"  y1="8"  x2="8"  y2="16" />
                <line x1="12" y1="5"  x2="12" y2="19" />
                <line x1="16" y1="8"  x2="16" y2="16" />
                <line x1="20" y1="11" x2="20" y2="13" />
              </svg>
            )}
          </button>

          {/* Coachmark — direction='up' positions the bubble above this
              button, right-aligned so it doesn't clip the right viewport edge. */}
          <VoiceCoachmark visible={voice.state === 'idle'} direction="up" />
        </div>
      )}

      {/* Navigation tabs — always visible on mobile regardless of voice state. */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border-subtle"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Quick navigation"
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
    </>
  )
}
