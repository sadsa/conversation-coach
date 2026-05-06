// components/VoiceCoachmark.tsx
//
// One-shot first-run cue anchored below the header mic button. Shown on
// all viewports — previously md:hidden (desktop users had no discovery path
// for the voice feature at all). Mirrors the localStorage one-shot pattern
// of UploadCoachmark, but distilled to a tooltip-style bubble rather than a
// backdrop+spotlight — the trigger is small but discoverable, and a
// heavyweight overlay would over-dramatise it.
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
  /** 'down' (default) = bubble appears below anchor, used in AppHeader.
   *  'up' = bubble appears above anchor, used in BottomBar. */
  direction?: 'down' | 'up'
}

export function VoiceCoachmark({ visible, direction = 'down' }: Props) {
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

  const isUp = direction === 'up'

  return (
    <div
      className={`
        absolute z-40
        ${isUp ? 'bottom-full right-0 mb-3' : 'top-full right-0 mt-2'}
        bg-surface-elevated border border-border rounded-2xl
        px-3 py-2.5 w-52
        shadow-md
        animate-voice-coachmark-in
      `}
      role="dialog"
      aria-label={t('voice.startCoachmark')}
    >
      {isUp ? (
        /* Pointer triangle pointing down-right toward the FAB button.
           right-6 (24px) aligns the tip roughly with the button's
           center when the bubble is right-aligned above it. */
        <span
          aria-hidden="true"
          className="
            absolute -bottom-1.5 right-6 w-3 h-3 rotate-45
            bg-surface-elevated border-r border-b border-border
          "
        />
      ) : (
        /* Pointer triangle — right-14 (56px) aligns with the mic circle
            center: 44px theme-toggle + 4px pr-1 + 16px half of w-8. */
        <span
          aria-hidden="true"
          className="
            absolute -top-1.5 right-14 w-3 h-3 rotate-45
            bg-surface-elevated border-l border-t border-border
          "
        />
      )}
      <div className="relative flex items-center gap-2">
        <span className="flex-1 text-xs font-medium text-text-primary">
          {t('voice.startCoachmark')}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('common.close')}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors"
        >
          <Icon name="close" className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
