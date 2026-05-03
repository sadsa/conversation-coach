// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { log } from '@/lib/logger'

const PUBLIC_PREFIXES = ['/login', '/auth', '/access-denied', '/api/webhooks']

/**
 * Header names used to forward the verified user identity from middleware
 * down to Server Components, layouts, and API route handlers.
 *
 * Why: `supabase.auth.getUser()` is a network call to the Supabase Auth
 * server (it validates the JWT, not just decodes it). Without this
 * passthrough, every navigation re-validates twice — once in middleware,
 * once in the layout — and every API route validates a third time.
 *
 * Middleware is the single trust boundary for auth in this app, so it's
 * safe for downstream code to trust these headers. They're set on the
 * *request* (not the response) so they're never visible to the client.
 */
export const USER_ID_HEADER = 'x-cc-user-id'
export const USER_EMAIL_HEADER = 'x-cc-user-email'
export const USER_TARGET_LANGUAGE_HEADER = 'x-cc-user-target-language'
/**
 * Set on request headers by middleware for public paths (login, auth/callback,
 * access-denied, webhooks). The root layout's getAuthenticatedUser() checks
 * for this header to skip the verifyFromCookie() fallback on public paths.
 *
 * Why this matters: verifyFromCookie() calls supabase.auth.getUser() which
 * can trigger a server-side token refresh (rotating the refresh token). In a
 * Server Component, setAll() cannot write the new cookies back to the browser,
 * so the browser is left with the old (now-consumed) refresh token. The next
 * request that uses those stale cookies gets refresh_token_not_found, which
 * manifests as a redirect to /login immediately after clicking the magic link.
 */
export const PUBLIC_PATH_HEADER = 'x-cc-is-public'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes bypass auth entirely. Mark them with a request header so
  // the root layout knows to skip verifyFromCookie() — see PUBLIC_PATH_HEADER.
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.delete(PUBLIC_PATH_HEADER) // strip any forged value first
    requestHeaders.set(PUBLIC_PATH_HEADER, '1')
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Strip any forged auth headers from the incoming request before we set
  // our own. A client that sets `x-cc-user-id: <victim>` would otherwise
  // be trusted by downstream code. Cheap defense in depth.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete(USER_ID_HEADER)
  requestHeaders.delete(USER_EMAIL_HEADER)
  requestHeaders.delete(USER_TARGET_LANGUAGE_HEADER)
  requestHeaders.delete(PUBLIC_PATH_HEADER)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError) {
    log.error('middleware: getUser failed', { path: pathname, error: authError.message, status: authError.status })
  }

  if (!user) {
    // Forward any cookie mutations Supabase made during getUser() (e.g. clearing
    // an invalid/rotated session) so the browser doesn't keep stale auth cookies.
    // Without this, a bad session persists across the /login redirect and causes
    // repeated refresh_token_not_found errors on every subsequent request.
    const redirectResponse = NextResponse.redirect(new URL('/login', request.url))
    for (const cookie of supabaseResponse.headers.getSetCookie()) {
      redirectResponse.headers.append('Set-Cookie', cookie)
    }
    return redirectResponse
  }

  const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)

  if (!allowedEmails.includes(user.email ?? '')) {
    return NextResponse.redirect(new URL('/access-denied', request.url))
  }

  // Capture any Set-Cookie headers that setAll() wrote during getUser() (token refresh).
  // We must do this BEFORE recreating the response below, otherwise they're lost.
  const refreshCookies = supabaseResponse.headers.getSetCookie()

  // Forward the verified identity as *request* headers so downstream RSCs and
  // API routes can read them without re-calling getUser().
  requestHeaders.set(USER_ID_HEADER, user.id)
  if (user.email) requestHeaders.set(USER_EMAIL_HEADER, user.email)
  const targetLanguage = (user.user_metadata?.target_language as string | undefined) ?? ''
  if (targetLanguage) requestHeaders.set(USER_TARGET_LANGUAGE_HEADER, targetLanguage)

  // Rebuild with the identity-enriched requestHeaders.
  supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  // Restore any refresh cookies so the browser receives the new tokens.
  // Without this, a token-refresh cycle during middleware would silently
  // discard the new credentials — the user would be signed out on their
  // very next request despite passing auth just now.
  for (const cookie of refreshCookies) {
    supabaseResponse.headers.append('Set-Cookie', cookie)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.svg|icon.svg|manifest.json|sw.js|icons|apple-touch-icon.png|icon-192.png|icon-512.png).*)',
  ],
}
