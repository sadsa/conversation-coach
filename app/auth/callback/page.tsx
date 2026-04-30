'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
export default function AuthCallbackPage() {
  const router = useRouter()
  const handled = useRef(false)

  useEffect(() => {
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
      if (event === 'SIGNED_IN' && session) redirect(session)
    })

    // Fallback: if the client already has a session (e.g. page reload), redirect now.
    supabase.auth.getSession().then((result: { data: { session: Session | null } }) => {
      if (result.data.session) redirect(result.data.session)
    })

    // Safety net: if nothing fires within 8 seconds (bad/expired link), go to login.
    const timeout = setTimeout(() => {
      if (!handled.current) router.replace('/login')
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  return null
}
