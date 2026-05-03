// components/VoiceTrigger.tsx
//
// Header-anchored mic button that opens a voice session. Sibling to the
// theme toggle in AppHeader's right cluster. Hides itself entirely while a
// session is active — the VoiceStrip below the header is the affordance
// during a session; having both creates a "two mic buttons" problem.
//
// Inner circle uses an accent-tinted fill (bg-accent-chip) instead of the
// neutral surface so it reads as a *primary affordance* rather than a
// passive utility icon — otherwise the eye groups it with the theme
// toggle next to it as a "settings cluster" and the product's headline
// feature ("Ask the coach anything") goes unnoticed by returning users.
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
          h-11 -mr-1 flex items-center gap-1.5 pl-1 pr-1 flex-shrink-0 group
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
          rounded-full
        "
      >
        <span
          className="
            w-8 h-8 rounded-full bg-accent-chip border border-accent-chip-border/40
            flex items-center justify-center text-on-accent-chip
            group-hover:bg-accent-chip group-hover:border-accent-chip-border/70
            group-disabled:opacity-60
            transition-colors
          "
        >
          <Icon
            name={isConnecting ? 'spinner' : 'mic'}
            className="w-4 h-4"
          />
        </span>
        {/* Visible "Connecting…" label on desktop only — gives the user
            reassurance that the silent spinner is working without crowding
            the mobile header. Mobile users get the aria-live announcement
            below for the same signal. */}
        {isConnecting && (
          <span className="hidden md:inline text-xs text-text-secondary pr-1.5 select-none">
            {t('voice.connecting')}
          </span>
        )}
      </button>

      {/* Polite live region — fires whenever connecting flips on so
          screen-reader users hear the same status sighted users see in
          the spinner. The active-state announcement lives in VoiceStrip. */}
      <span aria-live="polite" className="sr-only">
        {isConnecting ? t('voice.connectingAnnouncement') : ''}
      </span>
    </>
  )
}
