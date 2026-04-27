// app/settings/page.tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { TARGET_LANGUAGES, type TargetLanguage } from '@/lib/types'
import {
  getAutoOpenFirstCorrectionPreference,
  setAutoOpenFirstCorrectionPreference,
} from '@/lib/settings'
import { useTranslation } from '@/components/LanguageProvider'

const MIN = 14
const MAX = 22
const STEP = 2
const KEY = 'fontSize'
const SHA = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)
const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE ?? ''
const VERSION = BUILD_DATE ? `${SHA} · ${BUILD_DATE}` : SHA

export default function SettingsPage() {
  const [size, setSize] = useState<number>(16)
  const [autoOpenFirstCorrection, setAutoOpenFirstCorrection] = useState(false)
  const router = useRouter()
  const { targetLanguage, setTargetLanguage, t } = useTranslation()
  useEffect(() => {
    const stored = localStorage.getItem(KEY)
    if (stored) setSize(parseInt(stored, 10))
    setAutoOpenFirstCorrection(getAutoOpenFirstCorrectionPreference())
  }, [])

  function apply(newSize: number) {
    setSize(newSize)
    document.documentElement.style.fontSize = newSize + 'px'
    localStorage.setItem(KEY, String(newSize))
  }

  async function signOut() {
    const { error } = await getSupabaseBrowserClient().auth.signOut()
    if (!error) router.push('/login')
  }

  return (
    <div className="space-y-8 max-w-sm">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t('settings.textSize')}</h2>

        <div className="flex items-center gap-4">
          <button
            onClick={() => apply(size - STEP)}
            disabled={size <= MIN}
            aria-label="−"
            className="w-9 h-9 rounded border border-border text-text-secondary hover:border-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            −
          </button>
          <span className="text-base font-mono w-12 text-center">{size}px</span>
          <button
            onClick={() => apply(size + STEP)}
            disabled={size >= MAX}
            aria-label="+"
            className="w-9 h-9 rounded border border-border text-text-secondary hover:border-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            +
          </button>
        </div>

        <div className="mt-4 border border-border-subtle rounded-lg p-4 space-y-3">
          <p className="text-xs text-text-tertiary uppercase tracking-wide">{t('settings.preview')}</p>
          <div>
            <p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">{t('settings.previewYou')}</p>
            <span className="text-sm leading-relaxed">
              {t('settings.previewSentence')}
            </span>
          </div>
          <div className="opacity-40">
            <p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">{t('settings.previewThem')}</p>
            <span className="text-sm leading-relaxed">{t('settings.previewResponse')}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t('settings.targetLanguage')}</h2>
        <select
          value={targetLanguage}
          onChange={e => setTargetLanguage(e.target.value as TargetLanguage)}
          className="w-full px-3 py-2 rounded border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-text-secondary"
        >
          {(Object.entries(TARGET_LANGUAGES) as [TargetLanguage, string][]).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t('settings.review')}</h2>
        <label className="flex items-start justify-between gap-4 border border-border-subtle rounded-lg p-4 cursor-pointer">
          <div className="space-y-1">
            <p className="text-sm text-text-primary">{t('settings.autoOpenFirstCorrection')}</p>
            <p className="text-xs text-text-tertiary">{t('settings.autoOpenFirstCorrectionHelp')}</p>
          </div>
          <span className="relative inline-flex h-6 w-11 items-center">
            <input
              type="checkbox"
              role="switch"
              checked={autoOpenFirstCorrection}
              onChange={e => {
                const enabled = e.target.checked
                setAutoOpenFirstCorrection(enabled)
                setAutoOpenFirstCorrectionPreference(enabled)
              }}
              aria-label={t('settings.autoOpenFirstCorrection')}
              className="peer sr-only"
            />
            <span className="absolute inset-0 rounded-full border border-border bg-surface-elevated transition-colors peer-checked:bg-accent-primary peer-checked:border-accent-primary" />
            <span className="absolute left-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t('settings.account')}</h2>
        <button
          onClick={signOut}
          className="w-full px-4 py-2 rounded border border-border bg-surface hover:bg-surface-elevated transition-colors text-sm text-left"
        >
          {t('settings.signOut')}
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {t('settings.help')}
        </h2>
        <div className="space-y-2">
          <Link
            href="/onboarding?step=1&revisit=true"
            className="block w-full px-4 py-2 rounded border border-border bg-surface hover:bg-surface-elevated transition-colors text-sm text-left text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t('settings.howToUpload')}
          </Link>
          <Link
            href="/onboarding?step=2&revisit=true"
            className="block w-full px-4 py-2 rounded border border-border bg-surface hover:bg-surface-elevated transition-colors text-sm text-left text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t('settings.howToShare')}
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t('settings.app')}</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">{t('settings.version')}</span>
          <span className="font-mono text-xs text-text-tertiary">{VERSION}</span>
        </div>
      </div>
    </div>
  )
}
