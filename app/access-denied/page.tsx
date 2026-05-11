'use client'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Button, buttonStyles } from '@/components/Button'

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
    <div className="flex items-center justify-center flex-1 px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-medium text-text-primary">
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
              className={buttonStyles({ variant: 'primary', size: 'sm', fullWidth: true })}
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

        <Button variant="secondary" size="sm" fullWidth onClick={signOut}>
          {t('accessDenied.signOut')}
        </Button>
      </div>
    </div>
  )
}
