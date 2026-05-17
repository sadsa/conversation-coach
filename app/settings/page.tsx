// app/settings/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { TARGET_LANGUAGES, type TargetLanguage } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'
import { Toast } from '@/components/Toast'
import { Wordmark } from '@/components/Wordmark'

const MIN = 14
const MAX = 22
const STEP = 2
const KEY = 'fontSize'
const SHA = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)
const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE ?? ''
const VERSION = BUILD_DATE ? `${SHA} · ${BUILD_DATE}` : SHA

export default function SettingsPage() {
  const [size, setSize] = useState<number>(16)
  const [signOutError, setSignOutError] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutRetry, setSignOutRetry] = useState(0)
  const router = useRouter()
  const { targetLanguage, setTargetLanguage, t } = useTranslation()

  useEffect(() => {
    const stored = localStorage.getItem(KEY)
    if (stored) setSize(parseInt(stored, 10))
  }, [])

  function apply(newSize: number) {
    setSize(newSize)
    document.documentElement.style.fontSize = newSize + 'px'
    localStorage.setItem(KEY, String(newSize))
  }

  async function signOut() {
    setSigningOut(true)
    setSignOutError(false)
    const { error } = await getSupabaseBrowserClient().auth.signOut()
    if (!error) {
      router.push('/login')
    } else {
      setSigningOut(false)
      setSignOutError(true)
      setSignOutRetry(n => n + 1)
    }
  }

  return (
    // Settings inherits the page's reading column from <main> in
    // app/layout.tsx — no inner max-width override. Individual form
    // controls cap their own width below where the visual rhythm wants it
    // (the +/- text-size cluster, the language <select>) so the form
    // doesn't stretch absurdly across a 672px column.
    //
    // space-y-8 matches /, /review, /write — same inter-section rhythm
    // across all four bottom-nav tabs. Was space-y-10 (40px); the bump
    // down to 32px keeps Settings calm without it feeling looser than
    // its siblings.
    <div className="space-y-8">
      <h1 className="font-display text-3xl md:text-4xl font-medium text-text-primary">
        {t('settings.title')}
      </h1>

      {/* Preferences: text size + language as labelled form fields, no section header */}
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-text-secondary">{t('settings.textSize')}</p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => apply(size - STEP)}
              disabled={size <= MIN}
              aria-label="Decrease text size"
              className="w-9 h-9 rounded border border-border text-text-secondary hover:border-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              −
            </button>
            <span className="text-base font-mono w-12 text-center">{size}px</span>
            <button
              onClick={() => apply(size + STEP)}
              disabled={size >= MAX}
              aria-label="Increase text size"
              className="w-9 h-9 rounded border border-border text-text-secondary hover:border-text-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              +
            </button>
          </div>
          {/* Preview card capped at a typical reading width so the sample
              sentence wraps the way it would in a real transcript snippet. */}
          <div className="max-w-sm border border-border-subtle rounded-lg p-4 space-y-3">
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wide mb-1">{t('settings.previewYou')}</p>
              <span className="text-sm leading-relaxed">{t('settings.previewSentence')}</span>
            </div>
            <div>
              <p className="text-xs text-text-tertiary uppercase tracking-wide mb-1">{t('settings.previewThem')}</p>
              <span className="text-sm leading-relaxed text-text-tertiary">{t('settings.previewResponse')}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="lang-select" className="block text-sm font-medium text-text-secondary">
            {t('settings.targetLanguage')}
          </label>
          <select
            id="lang-select"
            value={targetLanguage}
            onChange={e => setTargetLanguage(e.target.value as TargetLanguage)}
            // Capped to the same width as the preview card above so the
            // form rows feel like a column of related controls rather
            // than stretching across the whole reading column.
            className="w-full max-w-sm px-3 py-2 rounded border border-border bg-surface text-text-primary text-sm focus:outline-none focus:border-text-secondary focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {(Object.entries(TARGET_LANGUAGES) as [TargetLanguage, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{t('settings.account')}</h2>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="py-1 -my-1 text-sm text-text-secondary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {signingOut ? '…' : t('settings.signOut')}
        </button>
      </div>

      {/* Footer — quietly stamps the brand alongside the version. The
          wordmark on its own would feel decorative; pairing it with the
          build SHA + date keeps the slot informational while still
          carrying the brand on a surface that previously had none. */}
      <div className="pt-2 space-y-1">
        <Wordmark />
        <p className="text-xs text-text-tertiary tabular-nums">{VERSION}</p>
      </div>

      {signOutError && (
        <Toast message={t('settings.signOutError')} toastKey={`sign-out-error-${signOutRetry}`} />
      )}
    </div>
  )
}
