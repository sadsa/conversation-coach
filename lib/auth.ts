// lib/auth.ts
import { headers, cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { cache } from 'react'
import {
  USER_ID_HEADER,
  USER_EMAIL_HEADER,
  USER_TARGET_LANGUAGE_HEADER,
  PUBLIC_PATH_HEADER,
} from '@/middleware'

/**
 * Lean shape of an authenticated user. We don't return the full Supabase
 * `User` because the only fields callers actually use are id, email, and
 * the target_language metadata field — and those are all forwarded by
 * middleware via request headers, so we never need a network round-trip
 * to populate them.
 */
export interface AuthenticatedUser {
  id: string
  email: string | null
  targetLanguage: string | null
}

/**
 * Returns the authenticated user for the current request.
 *
 * Fast path (the only path you'll see in normal browser-driven traffic):
 * read the user identity that middleware already verified and forwarded
 * via request headers. Zero network calls.
 *
 * Slow path (defensive — fires only if middleware didn't run, e.g. a
 * route that was somehow added to the public-prefix list but still calls
 * this function): validate the session cookie via Supabase Auth.
 *
 * Wrapped in React `cache()` so multiple calls within a single request
 * (layout + page + nested components) share one result.
 */
export const getAuthenticatedUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const headerList = headers()
  const id = headerList.get(USER_ID_HEADER)
  if (id) {
    return {
      id,
      email: headerList.get(USER_EMAIL_HEADER),
      targetLanguage: headerList.get(USER_TARGET_LANGUAGE_HEADER),
    }
  }
  // Middleware explicitly bypassed auth for this path (login, auth/callback,
  // access-denied, webhooks). Do NOT fall through to verifyFromCookie() — that
  // calls supabase.auth.getUser() which can silently rotate the refresh token
  // server-side. Because Server Components can't write cookies, the new token
  // can't be persisted, and the browser is left with a consumed/invalid refresh
  // token. The next request fails with refresh_token_not_found → /login redirect.
  if (headerList.get(PUBLIC_PATH_HEADER) === '1') return null
  return verifyFromCookie()
})

/**
 * Cookie-based fallback. Only used when middleware headers are absent —
 * e.g. unit tests, or routes that were carved out of the middleware
 * matcher but still need auth. The try/catch in setAll is intentional:
 * cookies are read-only inside Server Components.
 */
async function verifyFromCookie(): Promise<AuthenticatedUser | null> {
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
  if (!user) return null
  return {
    id: user.id,
    email: user.email ?? null,
    targetLanguage: (user.user_metadata?.target_language as string | undefined) ?? null,
  }
}
