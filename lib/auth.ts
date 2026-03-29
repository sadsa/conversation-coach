// lib/auth.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

/**
 * Returns the authenticated Supabase user from the current request's session
 * cookie, or null if no valid session exists. Uses the anon key so the session
 * JWT is validated against Supabase Auth (not bypassed like the service role key).
 * The try/catch in setAll is intentional — cookies are read-only in Server Components.
 */
export async function getAuthenticatedUser(): Promise<User | null> {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore errors in Server Components where cookies are read-only
          }
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
