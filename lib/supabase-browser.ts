// lib/supabase-browser.ts
import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          // Implicit flow: session tokens travel in the URL hash rather than
          // requiring a PKCE code-verifier cookie. This is necessary for PWA
          // magic-link sign-in where the email link opens in a different browser
          // context (e.g. Gmail in-app browser) that doesn't share cookies with
          // the PWA session that initiated the sign-in.
          flowType: 'implicit',
        },
      }
    )
  }
  return client
}
