import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    // Collect cookies emitted by exchangeCodeForSession so we can apply them
    // to whichever redirect response we ultimately return. Using cookies()
    // from next/headers here causes the cookies to be set on an internal
    // response object, not on the NextResponse we return — so the session is
    // lost and the user is redirected to /login again.
    const pendingCookies: Parameters<SetAllCookies>[0] = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) { pendingCookies.push(...cookiesToSet) },
        },
      }
    )

    const { data } = await supabase.auth.exchangeCodeForSession(code)
    const targetLanguage = data.user?.user_metadata?.target_language
    const redirectTo = targetLanguage ? '/' : '/onboarding'
    const response = NextResponse.redirect(new URL(redirectTo, request.url))
    pendingCookies.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options)
    )
    return response
  }

  return NextResponse.redirect(new URL('/', request.url))
}
