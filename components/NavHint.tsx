// components/NavHint.tsx
//
// First-open onboarding chip rendered inside DockedSheet bodies (annotation +
// write review). It teaches the prev/next chevrons + arrow-key nav, which only
// exist on the desktop sheet header (`hidden md:flex`). The chip is therefore
// DESKTOP-ONLY (`hidden md:flex`): on mobile there are no chevron buttons and
// no hardware arrow keys to tap, so a "← →" cue would point at affordances
// that aren't there. Surfaced exactly once per browser; dismissed via a
// one-tap "Got it" or a 6-second auto-fade.
//
// The dismiss flag is shared across BOTH sheets: a user who learns the nav
// model on one surface shouldn't be re-taught on the other. The shared
// localStorage key is bumped if the cue ever needs to reappear (e.g. after
// the nav contract changes meaningfully).

'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'

const NAV_HINT_STORAGE_KEY = 'cc:sheet-nav-hint:v1'

export function NavHint() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.localStorage.getItem(NAV_HINT_STORAGE_KEY) === '1') return
    setVisible(true)
    const timer = window.setTimeout(() => dismiss(), 6000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    setVisible(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(NAV_HINT_STORAGE_KEY, '1')
    }
  }

  if (!visible) return null

  return (
    <div className="hidden md:flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-bg border border-border-subtle text-xs text-text-secondary motion-safe:animate-[fadein_220ms_ease-out_both]">
      <span className="flex items-center gap-0.5 text-text-tertiary shrink-0" aria-hidden="true">
        <Icon name="chevron-left" className="w-3.5 h-3.5" />
        <Icon name="chevron-right" className="w-3.5 h-3.5" />
      </span>
      <span className="flex-1 leading-snug">{t('sheet.navHintFirst')}</span>
      <button
        type="button"
        onClick={dismiss}
        className="text-text-tertiary hover:text-text-secondary text-xs font-medium px-1.5 py-0.5 rounded shrink-0"
      >
        {t('sheet.navHintDismiss')}
      </button>
    </div>
  )
}
