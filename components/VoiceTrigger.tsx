// components/VoiceTrigger.tsx
//
// Header-anchored mic button that opens a voice session. Sibling to the
// theme toggle in AppHeader's right cluster. Hides itself entirely while a
// session is active — the VoiceStrip below the header is the affordance
// during a session; having both creates a "two mic buttons" problem.
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
    <button
      type="button"
      onClick={isConnecting ? undefined : onStart}
      aria-label={t('voice.startAria')}
      aria-busy={isConnecting || undefined}
      disabled={isConnecting}
      className="
        w-11 h-11 -mr-1 flex items-center justify-center flex-shrink-0 group
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary
        rounded-full
      "
    >
      <span
        className="
          w-8 h-8 rounded-full border border-border-subtle bg-surface
          flex items-center justify-center text-accent-primary
          group-hover:border-border transition-colors
          group-disabled:opacity-60
        "
      >
        <Icon
          name={isConnecting ? 'spinner' : 'mic'}
          className="w-4 h-4"
        />
      </span>
    </button>
  )
}
