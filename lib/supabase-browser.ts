// lib/supabase-browser.ts
import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    // @supabase/ssr v0.9+ hardcodes flowType: 'pkce' inside createBrowserClient,
    // overriding any flowType passed in options.auth. We previously configured
    // implicit flow to handle PWA magic-link sign-in where the email link opens
    // in a different browser context (e.g. Gmail in-app browser) that doesn't
    // share cookies with the PWA session. That setting was being silently
    // ignored, so we now let the library default (PKCE) apply.
    //
    // PKCE works on desktop and same-browser contexts. For iOS Gmail WebView
    // (isolated cookie store), PKCE code-verifier is unavailable in the WebView
    // — that path relies on the 8-second timeout in auth/callback falling back
    // to /login, which is the same behaviour the implicit flow produced in that
    // context (also failing, since the browser context switch lost the tokens).
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}
