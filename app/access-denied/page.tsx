'use client'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'

const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL || ''

export default function AccessDeniedPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  async function signOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function copyEmail() {
    if (!OWNER_EMAIL) return
    try {
      await navigator.clipboard.writeText(OWNER_EMAIL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — silently no-op; the mailto button is the primary path
    }
  }

  const subject = encodeURIComponent(t('accessDenied.requestSubject'))
  const body = encodeURIComponent(t('accessDenied.requestBody'))

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-7rem)] px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {t('accessDenied.title')}
          </h1>
          <p className="text-sm text-text-secondary">
            {t('accessDenied.subtitle')}
          </p>
        </div>

        {OWNER_EMAIL ? (
          <div className="space-y-3">
            <a
              href={`mailto:${OWNER_EMAIL}?subject=${subject}&body=${body}`}
              className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white font-medium text-sm transition-colors"
            >
              {t('accessDenied.emailButton')}
            </a>
            <button
              type="button"
              onClick={copyEmail}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {copied
                ? t('accessDenied.copied')
                : t('accessDenied.copyPrefix', { email: OWNER_EMAIL })}
            </button>
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">
            {t('accessDenied.fallback')}
          </p>
        )}

        <button
          type="button"
          onClick={signOut}
          className="w-full px-4 py-2.5 rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors text-sm font-medium"
        >
          {t('accessDenied.signOut')}
        </button>
      </div>
    </div>
  )
}
