// components/VoiceTrigger.tsx
//
// Header-anchored voice trigger. Sibling to the theme toggle in
// AppHeader's right cluster. Hides itself entirely while a session is
// active — the VoiceStrip below the header is the affordance during a
// session; having both creates a "two mic buttons" problem.
//
// 2026-05 bolder pass: chip bumped from 32×32 to 36×36 so it reads as
// a primary affordance rather than a settings utility next to the theme
// toggle. Chip-only — no label.
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
        data-sheet-preserve
        onClick={isConnecting ? undefined : onStart}
        aria-label={t('voice.startAria')}
        aria-busy={isConnecting || undefined}
        disabled={isConnecting}
        className="
          group h-11 flex items-center flex-shrink-0 -mr-1
          pl-0.5 pr-0.5 gap-2
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

      </button>

      {/* Polite live region — fires whenever connecting flips on so
          screen-reader users hear the same status sighted users see. */}
      <span aria-live="polite" className="sr-only">
        {isConnecting ? t('voice.connectingAnnouncement') : ''}
      </span>
    </>
  )
}
