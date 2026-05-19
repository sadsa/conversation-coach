'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useTranslation } from '@/components/LanguageProvider'
import { Wordmark } from '@/components/Wordmark'
import { LogoMark } from '@/components/LogoMark'
import { Button } from '@/components/Button'

export default function PendingApprovalPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    getSupabaseBrowserClient().auth.getUser().then(({ data }: { data: { user: { email?: string } | null } }) => {
      setEmail(data.user?.email ?? null)
    })
  }, [])

  async function signOut() {
    setSigningOut(true)
    await getSupabaseBrowserClient().auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="flex items-center justify-center flex-1 px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2">
          <LogoMark size={64} />
          <Wordmark />
        </div>

        {/* Amber hourglass with looping ring */}
        <div className="flex justify-center">
          <div className="relative inline-flex items-center justify-center">
            {/* Pulsing ring — suppressed by prefers-reduced-motion (global 0.01ms duration) */}
            <span
              className="pending-ring absolute inset-0 rounded-full border-2 border-amber-400"
              aria-hidden="true"
            />
            <span
              className="pending-ring absolute inset-0 rounded-full border-2 border-amber-400 [animation-delay:1.6s]"
              aria-hidden="true"
            />
            <div className="relative w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-center">
              <svg
                width="28"
                height="28"
                viewBox="0 0 256 256"
                fill="currentColor"
                stroke="none"
                className="text-amber-500"
                aria-hidden="true"
              >
                {/* Phosphor hourglass-medium fill */}
                <path d="M200,75.64V40a16,16,0,0,0-16-16H72A16,16,0,0,0,56,40V75.64a16.07,16.07,0,0,0,6.4,12.8L114.67,128,62.4,167.56A16.07,16.07,0,0,0,56,180.36V216a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V180.36a16.07,16.07,0,0,0-6.4-12.8L141.33,128,193.6,88.44A16.07,16.07,0,0,0,200,75.64ZM184,215.1,72,216V180.36l56-42,56,42ZM72,75.64V40l112-.1V75.64l-56,42Z"/>
              </svg>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="font-display text-2xl font-medium text-text-primary">
            {t('pending.title')}
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            {t('pending.body')}
          </p>
        </div>

        {email && (
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <span className="text-text-tertiary">{t('pending.requestedAs')}</span>
            {' '}
            <span className="text-text-primary font-medium">{email}</span>
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          fullWidth
          disabled={signingOut}
          onClick={signOut}
        >
          {t('pending.signOut')}
        </Button>
      </div>
    </div>
  )
}
