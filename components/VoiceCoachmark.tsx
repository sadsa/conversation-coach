// components/VoiceCoachmark.tsx
//
// One-shot first-run cue over the header mic button. Mobile-only (md:hidden)
// because on desktop the trigger sits next to the theme toggle in plain
// view. Mirrors the localStorage one-shot pattern of UploadCoachmark, but
// distilled to a tooltip-style bubble rather than a backdrop+spotlight —
// the trigger is small but discoverable, and a heavyweight overlay would
// over-dramatise it.
//
// Anchoring: rendered as an absolutely-positioned child of AppHeader's
// right cluster (which is `relative`). Previously this used a fixed
// position with hard-coded `right-12`, which broke any time the header's
// right cluster grew or shrank. Now its position derives from the cluster
// itself, so future icons added beside the trigger don't break the cue.
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
        md:hidden absolute top-full right-0 mt-2 z-40
        bg-surface-elevated border border-border rounded-2xl
        px-3 py-2 flex items-center gap-2
        shadow-md whitespace-nowrap
        animate-coachmark-in
      "
      role="dialog"
      aria-label={t('voice.startCoachmark')}
    >
      {/* Pointer triangle — connects bubble visually to the trigger above
          it. Without this the floating bubble reads as orphaned chrome. */}
      <span
        aria-hidden="true"
        className="
          absolute -top-1.5 right-6 w-3 h-3 rotate-45
          bg-surface-elevated border-l border-t border-border
        "
      />
      <span className="relative text-xs font-medium text-text-primary">
        {t('voice.startCoachmark')}
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('common.close')}
        className="relative w-6 h-6 flex items-center justify-center text-text-tertiary hover:text-text-primary"
      >
        <Icon name="close" className="w-3 h-3" />
      </button>
    </div>
  )
}
