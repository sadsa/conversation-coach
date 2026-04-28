'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

/**
 * Auth callback page for magic-link sign-in (implicit flow).
 *
 * With implicit flow, Supabase places the session tokens in the URL hash
 * (#access_token=...&refresh_token=...). The @supabase/ssr browser client
 * detects this hash on init and fires SIGNED_IN. We wait for that event,
 * write the session to cookies, then redirect.
 *
 * This is intentionally a client page rather than a server route — the
 * hash fragment is never sent to the server, so only client-side JS can
 * read it.
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
