'use client'

/**
 * Client-side auth callback handler.
 *
 * Why client-side instead of a Route Handler:
 * Email clients (Gmail, Outlook) pre-fetch URLs in received emails for safety
 * scanning. A server-side Route Handler would exchange the magic-link code
 * during that pre-fetch, consuming the single-use token before the user ever
 * clicks. The user then arrives and the code is spent → redirect to /login.
 *
 * A client-side page returns only HTML+JS during the pre-fetch. The code
 * exchange only runs when the user's browser executes the JS — safe.
 *
 * iOS note:
 * On iOS, home-screen web apps run in an isolated WKWebView — they don't share
 * cookies with Safari. When a magic link opens in Safari (or Gmail's in-app
 * browser), the session is set in Safari's cookie store, not the PWA's. We
 * detect this case and show a "go back to your home screen" hint so the user
 * knows to open Coach manually. On iOS 16.4+, cookies ARE shared between
 * Safari and home-screen web apps, so simply opening Coach after authenticating
 * in Safari should work.
 */

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { t } from '@/lib/i18n'

type State = 'loading' | 'ios-browser' | 'error'

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    async function exchange() {
      const code = searchParams.get('code')
      if (!code) {
        router.replace('/login')
        return
      }

      const { data, error } = await getSupabaseBrowserClient().auth.exchangeCodeForSession(code)
      if (error || !data.user) {
        router.replace('/login')
        return
      }

      // On iOS, if we're in a regular browser (not the installed PWA), the
      // session cookie may not carry over to the home-screen app automatically.
      // Show guidance instead of an invisible redirect that leaves the user
      // stranded in Safari.
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
      const isStandalone =
        (navigator as Navigator & { standalone?: boolean }).standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches

      if (isIOS && !isStandalone) {
        setState('ios-browser')
        return
      }

      const targetLanguage = data.user.user_metadata?.target_language as string | undefined
      router.replace(targetLanguage ? '/' : '/onboarding')
    }

    exchange()
  }, [router, searchParams])

  if (state === 'ios-browser') {
    // Language isn't known yet (user may not have completed onboarding), so
    // default to English — this screen is transitional and rarely seen.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6 text-accent-primary"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold text-text-primary">{t('auth.signedIn', 'en')}</p>
          <p className="text-sm text-text-secondary">{t('auth.openAppHint', 'en')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  )
}
