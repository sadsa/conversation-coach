'use client'
import { useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

/**
 * Auth callback page for magic-link sign-in.
 *
 * @supabase/ssr v0.9+ overrides flowType to "pkce" regardless of what the
 * browser client is configured with, so the magic link now arrives as
 * ?code=... (PKCE) rather than #access_token=... (implicit). The Supabase
 * client's detectSessionInUrl handles the code exchange automatically on
 * init, then fires SIGNED_IN. We wait for that event, then clear the
 * Next.js router cache before redirecting.
 *
 * Why router.refresh() before replace():
 * While the user is on /login, Next.js prefetches nav links (/, /write,
 * /settings). Those prefetch requests hit middleware unauthenticated and
 * receive 307 redirects to /login. Next.js caches these redirects in its
 * client-side router cache. Without router.refresh(), navigating to / after
 * sign-in would serve the cached redirect instead of making a fresh
 * authenticated request — sending the user straight back to /login.
 *
 * This is intentionally a client page rather than a server route — for PKCE
 * the code exchange can also be done server-side, but the client already
 * handles it via detectSessionInUrl, and keeping this as a client page
 * preserves the implicit-flow fallback path if flowType ever changes again.
 */
function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handled = useRef(false)

  useEffect(() => {
    // Supabase sets ?error=... when the link is invalid or expired.
    // Redirect immediately rather than waiting for the 8-second safety net.
    if (searchParams.get('error')) {
      router.replace('/login')
      return
    }

    const supabase = getSupabaseBrowserClient()

    function redirect(session: { user: { user_metadata?: { target_language?: string } } }) {
      if (handled.current) return
      handled.current = true
      const targetLanguage = session.user.user_metadata?.target_language
      // Invalidate the Next.js router cache so any stale unauthenticated
      // prefetch redirects don't intercept the navigation below.
      router.refresh()
      router.replace(targetLanguage ? '/' : '/onboarding')
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === 'SIGNED_IN' && session) {
        // Guard side-effects with handled so StrictMode double-mount and any
        // other replayed SIGNED_IN events don't fire these more than once.
        if (!handled.current) {
          // Fire-and-forget: notify the admin if this is a fresh pending user.
          // 204 always returned, so we don't await or handle errors.
          const email = session.user.email
          if (email) {
            fetch('/api/access-request/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email }),
            }).catch(() => {/* best-effort */})
          }
          // Remember the identity for the welcome-back surface. The
          // login page reads `cc:login-email` + `cc:login-provider` to
          // render the provider-aware "Continue as" pill. Email is
          // always written here — SIGNED_IN guarantees a real address.
          //
          // Provider is FILLED IN only when missing. The click-time
          // write in login/page.tsx is the source of truth (we know
          // exactly which button was pressed); this callback write is
          // a backstop for users who arrived here without going through
          // our buttons (session restore, deep link to /auth/callback,
          // private-mode write that failed). `app_metadata.provider`
          // can lag, return a stale identity, or report 'email' for a
          // user who has both providers linked — so OVERWRITING with
          // it would re-introduce the bug we're trying to fix (clicked
          // Google, got the email pill back next visit). When the key
          // is unset we fall back to inspecting both `provider` and
          // the `providers` array because the shape varies.
          if (email) {
            try {
              localStorage.setItem('cc:login-email', email)
              if (!localStorage.getItem('cc:login-provider')) {
                const meta = session.user.app_metadata as
                  | { provider?: string; providers?: string[] }
                  | undefined
                const candidate =
                  meta?.provider ??
                  meta?.providers?.find(p => p === 'google' || p === 'email')
                if (candidate === 'google' || candidate === 'email') {
                  localStorage.setItem('cc:login-provider', candidate)
                }
              }
            } catch {
              // Storage unavailable (private mode, quota). Welcome-back
              // pill won't render next time; the first-time view is a
              // safe fallback.
            }
          }
        }
        redirect(session)
      }
    })

    // Fallback: redirect immediately when there is an already-valid session (e.g.
    // the user reloads /auth/callback after a successful exchange). Skip this when
    // ?code= is present — the PKCE exchange is still in-flight and getSession()
    // reads raw cookie storage, which may still hold an old (stale) session from a
    // previous login. Calling redirect() with that stale session fires router.refresh()
    // before the exchange completes, then middleware getUser() tries to use the
    // now-rotated refresh token → "refresh_token_not_found". onAuthStateChange
    // SIGNED_IN is the reliable signal that the exchange actually succeeded.
    if (!searchParams.get('code')) {
      supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
        if (result.data.session) redirect(result.data.session)
      })
    }

    // Safety net: if nothing fires within 8 seconds (bad/expired link), go to login.
    const timeout = setTimeout(() => {
      if (!handled.current) router.replace('/login')
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router, searchParams])

  return null
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <AuthCallbackContent />
    </Suspense>
  )
}
