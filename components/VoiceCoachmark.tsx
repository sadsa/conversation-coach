// components/VoiceCoachmark.tsx
//
// One-shot first-run cue over the header mic button. Mobile-only (md:hidden)
// because on desktop the trigger sits next to the theme toggle in plain
// view. Mirrors the localStorage one-shot pattern of UploadCoachmark, but
// distilled to a tooltip-style bubble rather than a backdrop+spotlight —
// the trigger is small but discoverable, and a heavyweight overlay would
// over-dramatise it.
'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'

const STORAGE_KEY = 'cc:voice-trigger-coachmark:v1'

interface Props {
  visible: boolean
}

export function VoiceCoachmark({ visible }: Props) {
  const { t } = useTranslation()
  // Default to dismissed so the server-render and the pre-effect render
  // don't briefly flash the coachmark on returning users. The mount effect
  // synchronously reads localStorage and re-evaluates.
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }

  if (!visible || dismissed) return null

  return (
    <div
      className="
        md:hidden fixed top-[calc(var(--header-height)+env(safe-area-inset-top)+8px)]
        right-12 z-40
        bg-surface-elevated border border-border rounded-2xl
        px-3 py-2 flex items-center gap-2
        shadow-md
      "
      role="dialog"
      aria-label={t('voice.startCoachmark')}
    >
      <span className="text-xs font-medium text-text-primary whitespace-nowrap">
        {t('voice.startCoachmark')}
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('common.close')}
        className="w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-text-primary"
      >
        <Icon name="close" className="w-3 h-3" />
      </button>
    </div>
  )
}
