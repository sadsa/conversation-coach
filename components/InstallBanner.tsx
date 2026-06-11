'use client'
import { useEffect, useState } from 'react'
import { useIsInstalled } from '@/hooks/useIsInstalled'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'

const DISMISSED_KEY = 'cc:install-dismissed'

function isMobile() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 767px)').matches
}

export function InstallBanner() {
  const { t } = useTranslation()
  const isInstalled = useIsInstalled()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isInstalled) return
    if (!isMobile()) return
    if (localStorage.getItem(DISMISSED_KEY)) return
    setVisible(true)
  }, [isInstalled])

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  return (
    <div
      role="banner"
      className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm"
    >
      <span className="shrink-0 text-accent-primary" aria-hidden>⬇</span>
      <p className="flex-1 text-text-secondary leading-snug">{t('install.bannerLabel')}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('install.bannerDismiss')}
        className="shrink-0 text-text-tertiary hover:text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 rounded"
      >
        <Icon name="close" className="w-4 h-4" aria-hidden />
      </button>
    </div>
  )
}
