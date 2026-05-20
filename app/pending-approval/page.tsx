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
