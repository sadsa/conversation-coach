// components/VoiceTrigger.tsx
//
// Header-anchored voice trigger. Sibling to the theme toggle in
// AppHeader's right cluster. Hides itself entirely while a session is
// active — the VoiceStrip below the header is the affordance during a
// session; having both creates a "two mic buttons" problem.
//
// 2026-05 bolder pass: on `lg:` breakpoints (≥1024px) the trigger
// expands into a labelled pill — chip on the left, "Talk it through"
// label on the right, both wrapped in a single accent-tinted pill. This
// gives the desktop trigger the visual weight it deserves: it's the
// product's headline feature ("Ask the coach anything"), not a settings
// utility. Below `lg` the chip-only treatment stays.
//
// Inner chip uses an accent-tinted fill (bg-accent-chip) so it reads as
// a *primary affordance* rather than a passive utility icon — otherwise
// the eye groups it with the theme toggle next to it as a "settings
// cluster" and the headline feature goes unnoticed by returning users.
'use client'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'

export type VoiceTriggerState = 'idle' | 'connecting' | 'active' | 'muted'

interface Props {
  state: VoiceTriggerState
  onStart: () => void
}

export function VoiceTrigger({ state, onStart }: Props) {
  const { t } = useTranslation()

  if (state === 'active' || state === 'muted') return null

  const isConnecting = state === 'connecting'

  return (
    <>
      <button
        type="button"
        onClick={isConnecting ? undefined : onStart}
        aria-label={t('voice.startAria')}
        aria-busy={isConnecting || undefined}
        disabled={isConnecting}
        className="
          group h-11 flex items-center flex-shrink-0 -mr-1
          pl-0.5 pr-0.5 lg:pr-3 gap-2
          rounded-full
          disabled:opacity-60
          transition-colors
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
        "
      >
        {/* Chip — always visible. Slightly larger (36px) than the theme
            toggle's 32px so the eye reads voice as primary, not utility. */}
        <span
          className="
            w-9 h-9 rounded-full
            bg-accent-chip border border-accent-chip-border/40
            flex items-center justify-center text-on-accent-chip
            group-hover:border-accent-chip-border/70
            transition-colors
          "
        >
          {isConnecting ? (
            <Icon name="spinner" className="w-4 h-4" />
          ) : (
            <Icon name="waveform" className="w-4 h-4" />
          )}
        </span>

        {/* Label — `lg:` and up. The pill's expanded state. Below lg the
            chip stands alone (mobile is hidden via the AppHeader wrapper).
            During connecting, swap the label to "Connecting…" so the
            spinner has matching copy. */}
        <span className="hidden lg:inline text-sm font-medium text-text-primary select-none whitespace-nowrap">
          {isConnecting ? t('voice.connecting') : t('voice.startLabel')}
        </span>
      </button>

      {/* Polite live region — fires whenever connecting flips on so
          screen-reader users hear the same status sighted users see. */}
      <span aria-live="polite" className="sr-only">
        {isConnecting ? t('voice.connectingAnnouncement') : ''}
      </span>
    </>
  )
}
