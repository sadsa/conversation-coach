# Multi-User Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google OAuth sign-in, per-user data isolation, an email allowlist, and a second target language (English, New Zealand) to the Conversation Coach app.

**Architecture:** Supabase Auth handles Google OAuth via `@supabase/ssr` cookie-based sessions. Next.js middleware enforces authentication and the `ALLOWED_EMAILS` allowlist on every request. `user_id` is added to the `sessions` table (with RLS as backstop); all API routes manually filter by the authenticated user's ID. Language preference is stored in Supabase user metadata.

**Tech Stack:** `@supabase/ssr` (new), `@supabase/supabase-js` v2, Next.js 14 App Router, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-29-multi-user-design.md`

---

## File Map

**New files:**
- `lib/auth.ts` — `getAuthenticatedUser()` server-side helper (uses `@supabase/ssr` + `cookies()`)
- `middleware.ts` — auth check + allowlist enforcement on every request
- `app/login/page.tsx` — Google sign-in page
- `app/access-denied/page.tsx` — shown when email not in allowlist
- `app/auth/callback/route.ts` — exchanges OAuth code for session cookie
- `components/ConditionalBottomNav.tsx` — hides BottomNav on `/login` and `/access-denied`
- `supabase/migrations/20260329000000_add_user_id_to_sessions.sql` — add nullable `user_id`
- `supabase/migrations/20260329000001_enable_rls.sql` — set NOT NULL + enable RLS (run after backfill)

**Modified files:**
- `lib/supabase-browser.ts` — switch to `createBrowserClient` from `@supabase/ssr`
- `lib/types.ts` — add `TargetLanguage`, `TARGET_LANGUAGES`
- `lib/claude.ts` — add EN-NZ prompt constant, add `targetLanguage` param with default `'es-AR'`
- `lib/pipeline.ts` — accept `targetLanguage` param, forward to `analyseUserTurns`
- `app/layout.tsx` — replace `<BottomNav />` with `<ConditionalBottomNav />`
- `app/settings/page.tsx` — add language dropdown + sign-out button
- `app/api/sessions/route.ts` — add user auth + `user_id` filter/insert
- `app/api/sessions/[id]/route.ts` — add user auth + `user_id` filter
- `app/api/sessions/[id]/status/route.ts` — add user auth + `user_id` filter
- `app/api/sessions/[id]/upload-complete/route.ts` — add user auth + `user_id` filter
- `app/api/sessions/[id]/upload-failed/route.ts` — add user auth + `user_id` filter
- `app/api/sessions/[id]/retry/route.ts` — add user auth + `user_id` filter
- `app/api/sessions/[id]/speaker/route.ts` — add user auth + `user_id` filter + pass `targetLanguage`
- `app/api/sessions/[id]/analyse/route.ts` — add user auth + `user_id` filter + pass `targetLanguage`
- `app/api/webhooks/assemblyai/route.ts` — select `user_id`, look up user's `target_language`
- `app/api/practice-items/route.ts` — add user auth + session-based ownership filter
- `app/api/practice-items/[id]/route.ts` — add user auth + ownership check via session

---

## Task 1: Install @supabase/ssr

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install package**

```bash
npm install @supabase/ssr
```

Expected output: package added to `node_modules` and `package.json`.

- [ ] **Step 2: Verify build still passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @supabase/ssr"
```

---

## Task 2: Add TargetLanguage types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add types**

Add these exports immediately before the `SessionStatus` type at the top of `lib/types.ts`:

```ts
export type TargetLanguage = 'es-AR' | 'en-NZ'

export const TARGET_LANGUAGES: Record<TargetLanguage, string> = {
  'es-AR': 'Spanish (Rioplatense)',
  'en-NZ': 'English (New Zealand)',
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add TargetLanguage type and TARGET_LANGUAGES constant"
```

---

## Task 3: Update Supabase browser client to @supabase/ssr

**Files:**
- Modify: `lib/supabase-browser.ts`

- [ ] **Step 1: Replace the file contents**

```ts
// lib/supabase-browser.ts
import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return client
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase-browser.ts
git commit -m "feat: migrate browser Supabase client to @supabase/ssr"
```

---

## Task 4: Add lib/auth.ts server-side user helper

**Files:**
- Create: `lib/auth.ts`

- [ ] **Step 1: Create the file**

```ts
// lib/auth.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { User } from '@supabase/supabase-js'

/**
 * Returns the authenticated Supabase user from the current request's session
 * cookie, or null if unauthenticated. Uses the anon key (not service role) so
 * the JWT is properly validated.
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
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat: add getAuthenticatedUser server helper using @supabase/ssr"
```

---

## Task 5: Implement middleware with tests

**Files:**
- Create: `middleware.ts`
- Create: `__tests__/middleware.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/middleware.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

import { createServerClient } from '@supabase/ssr'
import { middleware } from '@/middleware'

const mockGetUser = vi.fn()

function makeSupabaseClient() {
  return { auth: { getUser: mockGetUser } } as unknown as ReturnType<typeof createServerClient>
}

function makeRequest(path: string) {
  return new NextRequest(new URL(`http://localhost${path}`))
}

beforeEach(() => {
  vi.mocked(createServerClient).mockReturnValue(makeSupabaseClient())
  process.env.ALLOWED_EMAILS = 'allowed@example.com'
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('middleware', () => {
  it('redirects unauthenticated users to /login', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects authenticated users with unlisted email to /access-denied', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'other@example.com' } } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/access-denied')
  })

  it('allows through authenticated users with a listed email', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'allowed@example.com' } } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(200)
  })

  it('passes /login through without calling getUser', async () => {
    const res = await middleware(makeRequest('/login'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('passes /auth/callback through without calling getUser', async () => {
    const res = await middleware(makeRequest('/auth/callback'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('passes /access-denied through without calling getUser', async () => {
    const res = await middleware(makeRequest('/access-denied'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('passes /api/webhooks/assemblyai through without calling getUser', async () => {
    const res = await middleware(makeRequest('/api/webhooks/assemblyai'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('blocks all users when ALLOWED_EMAILS is empty', async () => {
    process.env.ALLOWED_EMAILS = ''
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'allowed@example.com' } } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/access-denied')
  })

  it('trims whitespace from ALLOWED_EMAILS entries', async () => {
    process.env.ALLOWED_EMAILS = '  allowed@example.com , other@example.com  '
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'allowed@example.com' } } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/middleware.test.ts 2>&1 | tail -20
```

Expected: tests fail because `middleware.ts` does not exist.

- [ ] **Step 3: Create middleware.ts**

```ts
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PREFIXES = ['/login', '/auth', '/access-denied', '/api/webhooks']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes bypass auth entirely
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)

  if (!allowedEmails.includes(user.email ?? '')) {
    return NextResponse.redirect(new URL('/access-denied', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons).*)'],
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/middleware.test.ts 2>&1 | tail -10
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts __tests__/middleware.test.ts
git commit -m "feat: add auth middleware with email allowlist"
```

---

## Task 6: Add auth callback route

**Files:**
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: Create the callback route**

```ts
// app/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(new URL('/', request.url))
}
```

- [ ] **Step 2: In the Supabase dashboard, enable Google OAuth**

Go to Authentication → Providers → Google. Enable it and paste in your Google OAuth client ID and secret. Set the redirect URL to:
- `http://localhost:3000/auth/callback` (local)
- `https://your-vercel-domain.vercel.app/auth/callback` (production)

Add both URLs to the Supabase dashboard under Authentication → URL Configuration → Redirect URLs.

- [ ] **Step 3: Commit**

```bash
git add app/auth/callback/route.ts
git commit -m "feat: add OAuth callback route for Supabase Auth code exchange"
```

---

## Task 7: Add /login page

**Files:**
- Create: `app/login/page.tsx`

- [ ] **Step 1: Create the login page**

```tsx
// app/login/page.tsx
'use client'
import { createBrowserClient } from '@supabase/ssr'

export default function LoginPage() {
  async function signIn() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="space-y-6 text-center max-w-xs w-full px-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Conversation Coach</h1>
          <p className="text-sm text-gray-400">Sign in to continue</p>
        </div>
        <button
          onClick={signIn}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: add /login page with Google OAuth button"
```

---

## Task 8: Add /access-denied page

**Files:**
- Create: `app/access-denied/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// app/access-denied/page.tsx
'use client'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export default function AccessDeniedPage() {
  const router = useRouter()

  async function signOut() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="space-y-6 text-center max-w-xs w-full px-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Access Denied</h1>
          <p className="text-sm text-gray-400">
            Your account has not been granted access. Contact the app owner to request access.
          </p>
        </div>
        <button
          onClick={signOut}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/access-denied/page.tsx
git commit -m "feat: add /access-denied page"
```

---

## Task 9: Add ConditionalBottomNav and update layout

**Files:**
- Create: `components/ConditionalBottomNav.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create ConditionalBottomNav**

```tsx
// components/ConditionalBottomNav.tsx
'use client'
import { usePathname } from 'next/navigation'
import { BottomNav } from '@/components/BottomNav'

const HIDDEN_ON = ['/login', '/access-denied']

export function ConditionalBottomNav() {
  const pathname = usePathname()
  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null
  return <BottomNav />
}
```

- [ ] **Step 2: Update app/layout.tsx**

Replace the `<BottomNav />` import and usage:

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { FontSizeProvider } from '@/components/FontSizeProvider'
import { ConditionalBottomNav } from '@/components/ConditionalBottomNav'
import './globals.css'

export const metadata: Metadata = {
  title: 'Conversation Coach',
  description: 'Analyse your Spanish conversations',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#0f0f0f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function(err) {
              console.warn('SW registration failed:', err);
            });
          }
        ` }} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var s = localStorage.getItem('fontSize');
            if (s) document.documentElement.style.fontSize = s + 'px';
          })();
        ` }} />
      </head>
      <body className="min-h-screen bg-gray-950 text-gray-100 overflow-x-hidden">
        <FontSizeProvider />
        <main className="max-w-4xl mx-auto px-6 py-8 pb-20">{children}</main>
        <ConditionalBottomNav />
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add components/ConditionalBottomNav.tsx app/layout.tsx
git commit -m "feat: hide bottom nav on login and access-denied pages"
```

---

## Task 10: Update lib/claude.ts with EN-NZ prompt and targetLanguage param

**Files:**
- Modify: `lib/claude.ts`
- Modify: `__tests__/lib/claude.test.ts`

- [ ] **Step 1: Write new failing tests**

Add these two tests at the end of the `describe('analyseUserTurns')` block in `__tests__/lib/claude.test.ts`:

```ts
  it('uses the ES-AR system prompt when targetLanguage is es-AR', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ title: 'Test', annotations: [] }) }],
      stop_reason: 'end_turn',
    })
    await analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], null, 'session-1', 'es-AR')
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).toContain('Rioplatense')
    expect(callArgs.system).not.toContain('New Zealand English')
  })

  it('uses the EN-NZ system prompt when targetLanguage is en-NZ', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ title: 'Test', annotations: [] }) }],
      stop_reason: 'end_turn',
    })
    await analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], null, 'session-1', 'en-NZ')
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).toContain('New Zealand English')
    expect(callArgs.system).not.toContain('Rioplatense')
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/lib/claude.test.ts 2>&1 | tail -10
```

Expected: 2 new tests fail.

- [ ] **Step 3: Update lib/claude.ts**

Replace the full file:

```ts
// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'

const SYSTEM_PROMPT_ES_AR = `You are an expert Spanish language coach specialising in Rioplatense (Argentine) Spanish. Analyse the speech turns provided and identify:

1. Grammar errors — mistakes the speaker made (type: "grammar")
2. Unnatural phrasing — things that are technically correct but would sound more natural said differently in everyday Argentine speech (type: "naturalness")

For each annotation:
- "segment_id": the ID from the [ID: ...] prefix of the turn being annotated
- "type": one of "grammar" or "naturalness"
- "original": copy the exact substring from the turn's text
- "start_char" / "end_char": character offsets of "original" within the turn's text content only — do NOT count the [ID: ...] prefix line; offset 0 is the first character of the text itself
- "correction": the improved version
- "explanation": a concise plain-language explanation tuned to Argentine Spanish conventions
- "sub_category": classify into exactly one of these categories (use "other" if nothing fits):
  Grammar: "verb-conjugation", "subjunctive", "gender-agreement", "number-agreement", "ser-estar", "por-para", "tense-selection", "article-usage", "word-order"
  Naturalness: "vocabulary-choice", "register", "phrasing"
- "flashcard_front": An invented English sentence that correctly expresses the same meaning as the practice phrase. The correct English equivalent phrase is wrapped in [[double brackets]]. Example: "I [[went]] to the market yesterday."
- "flashcard_back": The equivalent Spanish sentence using the correct form, wrapped in [[double brackets]]. Example: "[[Fui]] al mercado ayer."
- "flashcard_note": 1–2 sentences (in English) explaining why the original was wrong or unnatural from a Rioplatense register perspective. Be concise.

Be tuned to Rioplatense register: voseo verb forms, Rioplatense vocabulary, lunfardo where relevant. Prefer natural everyday Argentine speech over textbook Castilian.

For the title:
- Summarise the conversation topic in 5 words or fewer using natural Spanish/English mix (e.g. "Football con Kevin", "Planificando el fin de semana").
- If the original filename matches a WhatsApp audio pattern (starts with "PTT-" or contains "WhatsApp Audio"), prepend "WhatsApp: " to the title (e.g. "WhatsApp: Football con Kevin").
- Otherwise use the topic only.

Respond ONLY with a JSON object with this exact shape: { "title": string, "annotations": [{ "segment_id", "type", "sub_category", "original", "start_char", "end_char", "correction", "explanation", "flashcard_front", "flashcard_back", "flashcard_note" }] }. No other text.`

const SYSTEM_PROMPT_EN_NZ = `You are an expert English language coach specialising in New Zealand English. Analyse the speech turns provided and identify:

1. Grammar errors — mistakes the speaker made (type: "grammar")
2. Unnatural phrasing — things that are technically correct but would sound more natural said differently in everyday New Zealand English (type: "naturalness")

For each annotation:
- "segment_id": the ID from the [ID: ...] prefix of the turn being annotated
- "type": one of "grammar" or "naturalness"
- "original": copy the exact substring from the turn's text
- "start_char" / "end_char": character offsets of "original" within the turn's text content only — do NOT count the [ID: ...] prefix line; offset 0 is the first character of the text itself
- "correction": the improved version
- "explanation": a concise plain-language explanation tuned to New Zealand English conventions
- "sub_category": classify into exactly one of these categories (use "other" if nothing fits):
  Grammar: "verb-conjugation", "subjunctive", "gender-agreement", "number-agreement", "ser-estar", "por-para", "tense-selection", "article-usage", "word-order"
  Naturalness: "vocabulary-choice", "register", "phrasing"
  Note: most grammar errors in English will fall under "verb-conjugation", "tense-selection", or "word-order". The Spanish-specific categories (gender-agreement, ser-estar, por-para, subjunctive) are unlikely to apply; use "other" if nothing fits.
- "flashcard_front": A sentence in NZ English that illustrates the error, with the corrected word or phrase wrapped in [[double brackets]]. Example: "I [[went]] to the shops yesterday."
- "flashcard_back": The same sentence with the corrected form clearly shown in [[double brackets]]. Example: "I [[went]] to the shops yesterday."
- "flashcard_note": 1–2 sentences (in English) explaining why the original was wrong or unnatural from a New Zealand English perspective. Be concise.

Be tuned to New Zealand English: use NZ spelling (colour, organise, programme), NZ vocabulary and idioms, and everyday NZ register. Note that NZ English tends to be informal and direct.

For the title:
- Summarise the conversation topic in 5 words or fewer in natural English (e.g. "Football with Kevin", "Planning the weekend").
- If the original filename matches a WhatsApp audio pattern (starts with "PTT-" or contains "WhatsApp Audio"), prepend "WhatsApp: " to the title.
- Otherwise use the topic only.

Respond ONLY with a JSON object with this exact shape: { "title": string, "annotations": [{ "segment_id", "type", "sub_category", "original", "start_char", "end_char", "correction", "explanation", "flashcard_front", "flashcard_back", "flashcard_note" }] }. No other text.`

const PROMPTS: Record<TargetLanguage, string> = {
  'es-AR': SYSTEM_PROMPT_ES_AR,
  'en-NZ': SYSTEM_PROMPT_EN_NZ,
}

export interface UserTurn {
  id: string
  text: string
}

export interface ClaudeAnnotation {
  segment_id: string
  type: 'grammar' | 'naturalness'
  sub_category: string   // validated downstream in pipeline.ts
  original: string
  start_char: number
  end_char: number
  correction: string
  explanation: string
  flashcard_front: string | null
  flashcard_back: string | null
  flashcard_note: string | null
}

export async function analyseUserTurns(
  turns: UserTurn[],
  originalFilename: string | null,
  sessionId?: string,
  targetLanguage: TargetLanguage = 'es-AR',
): Promise<{ title: string; annotations: ClaudeAnnotation[] }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const filenamePrefix = originalFilename ? `Original filename: ${originalFilename}\n\n` : ''
  const userContent = filenamePrefix + turns
    .map(t => `[ID: ${t.id}]\n${t.text}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: PROMPTS[targetLanguage],
    messages: [{ role: 'user', content: userContent }],
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Claude response was truncated (max_tokens reached). The conversation may be too long to analyse in one pass.')
  }

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const text = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

  log.info('Claude raw response received', { sessionId, preview: text.slice(0, 500) })

  const parsed = JSON.parse(text) as { title: string; annotations: ClaudeAnnotation[] }
  return {
    title: parsed.title?.trim() || 'Untitled',
    annotations: (parsed.annotations ?? []).map(a => ({
      ...a,
      flashcard_front: a.flashcard_front ?? null,
      flashcard_back: a.flashcard_back ?? null,
      flashcard_note: a.flashcard_note ?? null,
    })),
  }
}
```

- [ ] **Step 4: Run all claude tests to confirm they all pass**

```bash
npm test -- __tests__/lib/claude.test.ts 2>&1 | tail -10
```

Expected: all tests pass (the new 2 + existing 8).

- [ ] **Step 5: Commit**

```bash
git add lib/claude.ts __tests__/lib/claude.test.ts
git commit -m "feat: add EN-NZ prompt and targetLanguage parameter to analyseUserTurns"
```

---

## Task 11: Update lib/pipeline.ts to accept targetLanguage

**Files:**
- Modify: `lib/pipeline.ts`

- [ ] **Step 1: Replace lib/pipeline.ts with the complete updated file**

```ts
// lib/pipeline.ts
import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import { log } from '@/lib/logger'
import type { TranscriptSegment, TargetLanguage } from '@/lib/types'
import { SUB_CATEGORIES, SUB_CATEGORY_TYPE_MAP } from '@/lib/types'
import type { ClaudeAnnotation } from '@/lib/claude'

export async function runClaudeAnalysis(sessionId: string, targetLanguage: TargetLanguage = 'es-AR'): Promise<void> {
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('user_speaker_labels, audio_r2_key, original_filename')
    .eq('id', sessionId)
    .single()

  if (!session) {
    log.error('Session not found', { sessionId })
    throw new Error(`Session ${sessionId} not found`)
  }

  const { data: segments } = await db
    .from('transcript_segments')
    .select('*')
    .eq('session_id', sessionId)
    .order('position')

  const userTurns = (segments ?? [])
    .filter((s: TranscriptSegment) => (session.user_speaker_labels ?? []).includes(s.speaker))
    .map((s: TranscriptSegment) => ({ id: s.id, text: s.text }))

  log.info('Claude analysis started', { sessionId, turnCount: userTurns.length })

  let annotations: ClaudeAnnotation[] = []
  let title = 'Untitled'
  try {
    const result = await analyseUserTurns(userTurns, session.original_filename ?? null, sessionId, targetLanguage)
    annotations = result.annotations
    title = result.title
  } catch (err) {
    log.error('Claude analysis failed', { sessionId, err })
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'analysing',
    }).eq('id', sessionId)
    throw err
  }

  // Build a map so we can validate/correct character offsets from Claude
  const segmentTextById = new Map(userTurns.map(t => [t.id, t.text]))

  const correctedAnnotations = annotations.map(a => {
    let corrected = { ...a }

    // Correct character offsets if they don't match
    const segText = segmentTextById.get(a.segment_id)
    if (segText && segText.slice(corrected.start_char, corrected.end_char) !== corrected.original) {
      const idx = segText.indexOf(corrected.original)
      if (idx !== -1) {
        corrected = { ...corrected, start_char: idx, end_char: idx + corrected.original.length }
      }
    }

    // Validate sub_category: must be in taxonomy and match the annotation type
    const rawSubCat = corrected.sub_category
    const isValidKey = typeof rawSubCat === 'string' && (SUB_CATEGORIES as readonly string[]).includes(rawSubCat)
    const expectedType = isValidKey ? SUB_CATEGORY_TYPE_MAP[rawSubCat as keyof typeof SUB_CATEGORY_TYPE_MAP] : undefined
    const subCategory = (isValidKey && (expectedType === undefined || expectedType === corrected.type))
      ? rawSubCat
      : 'other'

    return { ...corrected, sub_category: subCategory }
  })

  if (correctedAnnotations.length > 0) {
    const { error: annotationError } = await db.from('annotations').insert(
      correctedAnnotations.map(a => ({
        session_id: sessionId,
        segment_id: a.segment_id,
        type: a.type,
        original: a.original,
        start_char: a.start_char,
        end_char: a.end_char,
        correction: a.correction,
        explanation: a.explanation,
        sub_category: a.sub_category,
        flashcard_front: a.flashcard_front ?? null,
        flashcard_back: a.flashcard_back ?? null,
        flashcard_note: a.flashcard_note ?? null,
      }))
    )

    if (annotationError) {
      log.error('Annotation insert failed', {
        sessionId,
        error: annotationError.message,
        code: annotationError.code,
        details: annotationError.details,
        hint: annotationError.hint,
      })
      throw new Error(`Failed to insert annotations: ${annotationError.message}`)
    }
  }

  // Delete audio from R2
  if (session.audio_r2_key) {
    await deleteObject(session.audio_r2_key)
    await db.from('sessions').update({ audio_r2_key: null }).eq('id', sessionId)
  }

  log.info('Claude analysis complete', { sessionId, annotationCount: correctedAnnotations.length })
  await db.from('sessions').update({
    status: 'ready',
    title,
    processing_completed_at: new Date().toISOString(),
  }).eq('id', sessionId)
}
```

- [ ] **Step 2: Run pipeline tests to verify they still pass**

```bash
npm test -- __tests__/lib/pipeline.test.ts 2>&1 | tail -10
```

Expected: all pass (default `'es-AR'` keeps existing tests unchanged).

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline.ts
git commit -m "feat: thread targetLanguage through runClaudeAnalysis"
```

---

## Task 12: First migration — add nullable user_id to sessions

**Files:**
- Create: `supabase/migrations/20260329000000_add_user_id_to_sessions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260329000000_add_user_id_to_sessions.sql
-- Adds user_id as nullable initially so existing rows are preserved.
-- RLS is NOT enabled here — enable it only after the backfill (migration 20260329000001).

alter table sessions
  add column user_id uuid references auth.users(id) on delete cascade;
```

- [ ] **Step 2: Apply the migration**

In the Supabase dashboard, go to SQL Editor and run:

```sql
alter table sessions
  add column user_id uuid references auth.users(id) on delete cascade;
```

Or via the Supabase CLI if configured:
```bash
supabase db push
```

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/20260329000000_add_user_id_to_sessions.sql
git commit -m "feat: add nullable user_id column to sessions"
```

---

## Task 13: Update sessions API routes with user auth and user_id filtering

**Files:**
- Modify: `app/api/sessions/route.ts`
- Modify: `app/api/sessions/[id]/route.ts`
- Modify: `app/api/sessions/[id]/status/route.ts`
- Modify: `app/api/sessions/[id]/upload-complete/route.ts`
- Modify: `app/api/sessions/[id]/upload-failed/route.ts`
- Modify: `app/api/sessions/[id]/retry/route.ts`
- Modify: `__tests__/api/sessions.test.ts`

Note: The existing session tests mock `@/lib/supabase-server`. They now also need to mock `@/lib/auth`. **Add the following to the top of `__tests__/api/sessions.test.ts`** (after the existing `vi.mock` calls):

```ts
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))
import { getAuthenticatedUser } from '@/lib/auth'
```

Then in `beforeEach`, add:
```ts
vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)
```

- [ ] **Step 1: Update __tests__/api/sessions.test.ts mock setup**

Open `__tests__/api/sessions.test.ts` and make these two changes:

After `vi.mock('@/lib/r2', ...)` (around line 9), add:
```ts
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))
```

After the existing imports (around line 13), add:
```ts
import { getAuthenticatedUser } from '@/lib/auth'
```

In the `beforeEach` block (around line 22), add:
```ts
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)
```

- [ ] **Step 2: Run existing sessions tests to confirm they still pass before route changes**

```bash
npm test -- __tests__/api/sessions.test.ts 2>&1 | tail -10
```

Expected: all pass (routes don't call `getAuthenticatedUser` yet, so the mock is unused but harmless).

- [ ] **Step 3: Update app/api/sessions/route.ts**

```ts
// app/api/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { presignedUploadUrl } from '@/lib/r2'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .select('id, title, status, duration_seconds, created_at, processing_completed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, extension, original_filename } = body as {
    title?: string
    extension?: string
    original_filename?: string
  }

  const ext = (extension ?? 'mp3').replace(/^\./, '')
  const { key, url } = await presignedUploadUrl(ext)

  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .insert({
      title: (title ?? 'Untitled').trim() || 'Untitled',
      audio_r2_key: key,
      original_filename: original_filename ?? null,
      user_id: user.id,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session_id: data.id, upload_url: url }, { status: 201 })
}
```

- [ ] **Step 4: Update app/api/sessions/[id]/route.ts**

```ts
// app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()

  const { data: session, error: sessionError } = await db
    .from('sessions')
    .select('id, title, status, error_stage, duration_seconds, detected_speaker_count, user_speaker_labels, created_at')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (sessionError) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: segments } = await db
    .from('transcript_segments')
    .select('*')
    .eq('session_id', params.id)
    .order('position')

  const { data: annotations } = await db
    .from('annotations')
    .select('*')
    .eq('session_id', params.id)

  const { data: practiceItems } = await db
    .from('practice_items')
    .select('id, annotation_id')
    .eq('session_id', params.id)

  const addedAnnotations = (practiceItems ?? []).reduce<Record<string, string>>(
    (acc, p: { id: string; annotation_id: string | null }) => {
      if (p.annotation_id) acc[p.annotation_id] = p.id
      return acc
    },
    {}
  )

  return NextResponse.json({
    session,
    segments: segments ?? [],
    annotations: annotations ?? [],
    addedAnnotations,
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title } = body as { title?: string }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title must not be empty' }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db
    .from('sessions')
    .update({ title: title.trim() })
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Update app/api/sessions/[id]/status/route.ts**

```ts
// app/api/sessions/[id]/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .select('status, error_stage')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ status: data.status, error_stage: data.error_stage ?? null })
}
```

- [ ] **Step 6: Update app/api/sessions/[id]/upload-complete/route.ts**

```ts
// app/api/sessions/[id]/upload-complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { createJob } from '@/lib/assemblyai'
import { publicUrl } from '@/lib/r2'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { duration_seconds, speakers_expected } = await req.json() as {
    duration_seconds?: number
    speakers_expected?: number
  }
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('audio_r2_key')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!session?.audio_r2_key) {
    return NextResponse.json({ error: 'No audio key found' }, { status: 400 })
  }

  const audioUrl = publicUrl(session.audio_r2_key)

  let jobId: string
  try {
    jobId = await createJob(audioUrl, speakers_expected ?? 2)
  } catch (err) {
    log.error('AssemblyAI job creation failed', { sessionId: params.id, err })
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', params.id)
    return NextResponse.json({ error: 'AssemblyAI job creation failed' }, { status: 500 })
  }

  log.info('AssemblyAI job created', { sessionId: params.id, jobId })

  await db.from('sessions').update({
    status: 'transcribing',
    assemblyai_job_id: jobId,
    ...(duration_seconds != null ? { duration_seconds } : {}),
  }).eq('id', params.id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: Update app/api/sessions/[id]/upload-failed/route.ts**

```ts
// app/api/sessions/[id]/upload-failed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  await db.from('sessions').update({
    status: 'error',
    error_stage: 'uploading',
  }).eq('id', params.id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 8: Update app/api/sessions/[id]/retry/route.ts**

```ts
// app/api/sessions/[id]/retry/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { createJob, cancelJob } from '@/lib/assemblyai'
import { presignedUploadUrl, publicUrl, deleteObject } from '@/lib/r2'
import { log } from '@/lib/logger'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('error_stage, audio_r2_key, assemblyai_job_id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  log.info('Retry attempted', { sessionId: params.id, stage: session.error_stage })

  if (session.error_stage === 'uploading') {
    if (session.audio_r2_key) await deleteObject(session.audio_r2_key)

    const ext = session.audio_r2_key?.split('.').pop() ?? 'mp3'
    const { key, url } = await presignedUploadUrl(ext)

    await db.from('sessions').update({
      status: 'uploading',
      error_stage: null,
      audio_r2_key: key,
    }).eq('id', params.id)

    return NextResponse.json({ upload_url: url })
  }

  if (session.error_stage === 'transcribing') {
    if (session.assemblyai_job_id) {
      try { await cancelJob(session.assemblyai_job_id) } catch (err) {
        log.error('Failed to cancel stale job', { sessionId: params.id, jobId: session.assemblyai_job_id, err })
      }
    }

    if (!session.audio_r2_key) {
      return NextResponse.json({ error: 'No audio to retry' }, { status: 400 })
    }
    const audioUrl = publicUrl(session.audio_r2_key)
    const jobId = await createJob(audioUrl, 2)

    await db.from('sessions').update({
      status: 'transcribing',
      error_stage: null,
      assemblyai_job_id: jobId,
    }).eq('id', params.id)

    return NextResponse.json({ status: 'transcribing' })
  }

  return NextResponse.json(
    { error: 'Use /analyse to retry Claude analysis' },
    { status: 400 }
  )
}
```

- [ ] **Step 9: Run all sessions tests**

```bash
npm test -- __tests__/api/sessions.test.ts 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add app/api/sessions/route.ts app/api/sessions/[id]/route.ts \
  app/api/sessions/[id]/status/route.ts app/api/sessions/[id]/upload-complete/route.ts \
  app/api/sessions/[id]/upload-failed/route.ts app/api/sessions/[id]/retry/route.ts \
  __tests__/api/sessions.test.ts
git commit -m "feat: add user auth and user_id filtering to sessions API routes"
```

---

## Task 14: Update speaker and analyse routes with targetLanguage

**Files:**
- Modify: `app/api/sessions/[id]/speaker/route.ts`
- Modify: `app/api/sessions/[id]/analyse/route.ts`
- Modify: `__tests__/api/speaker.test.ts`

- [ ] **Step 1: Update __tests__/api/speaker.test.ts mock setup**

Add after the existing `vi.mock` calls:

```ts
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))
import { getAuthenticatedUser } from '@/lib/auth'
```

In `beforeEach`, add:
```ts
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { target_language: 'es-AR' },
  } as any)
```

- [ ] **Step 2: Update app/api/sessions/[id]/speaker/route.ts**

```ts
// app/api/sessions/[id]/speaker/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { speaker_labels?: ('A' | 'B')[] }
  const speaker_labels = body.speaker_labels

  if (!Array.isArray(speaker_labels) || speaker_labels.length === 0 ||
      !speaker_labels.every(l => l === 'A' || l === 'B')) {
    return NextResponse.json({ error: 'speaker_labels must be a non-empty array of A or B' }, { status: 400 })
  }
  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('status')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (session?.status !== 'identifying') {
    return NextResponse.json({ error: 'Session is not awaiting speaker identification' }, { status: 409 })
  }

  await db.from('sessions').update({
    user_speaker_labels: speaker_labels,
    status: 'analysing',
  }).eq('id', params.id)

  const targetLanguage = (user.user_metadata?.target_language as TargetLanguage) ?? 'es-AR'
  log.info('Analysis triggered after speaker identification', { sessionId: params.id, speaker_labels, targetLanguage })

  runClaudeAnalysis(params.id, targetLanguage).catch(err =>
    log.error('Claude analysis failed (fire-and-forget)', { sessionId: params.id, err })
  )

  return NextResponse.json({ status: 'analysing' })
}
```

- [ ] **Step 3: Update app/api/sessions/[id]/analyse/route.ts**

```ts
// app/api/sessions/[id]/analyse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('status, error_stage')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.status === 'analysing') {
    return NextResponse.json({ error: 'Analysis already in progress' }, { status: 409 })
  }

  if (session.error_stage === 'uploading' || session.error_stage === 'transcribing') {
    return NextResponse.json({ error: 'No transcript available to analyse' }, { status: 400 })
  }

  if (session.status !== 'ready' && session.error_stage !== 'analysing') {
    return NextResponse.json({ error: 'Session not in analysable state' }, { status: 400 })
  }

  await db.from('annotations').delete().eq('session_id', params.id)

  await db.from('sessions').update({
    status: 'analysing',
    error_stage: null,
  }).eq('id', params.id)

  const targetLanguage = (user.user_metadata?.target_language as TargetLanguage) ?? 'es-AR'
  log.info('Re-analysis triggered', { sessionId: params.id, targetLanguage })

  runClaudeAnalysis(params.id, targetLanguage).catch(err =>
    log.error('Re-analysis failed (fire-and-forget)', { sessionId: params.id, err })
  )

  return NextResponse.json({ status: 'analysing' })
}
```

- [ ] **Step 4: Run speaker tests**

```bash
npm test -- __tests__/api/speaker.test.ts 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/[id]/speaker/route.ts app/api/sessions/[id]/analyse/route.ts \
  __tests__/api/speaker.test.ts
git commit -m "feat: pass targetLanguage from user metadata to runClaudeAnalysis"
```

---

## Task 15: Update webhook route to look up user target_language

**Files:**
- Modify: `app/api/webhooks/assemblyai/route.ts`
- Modify: `__tests__/api/webhook.test.ts`

The webhook is unauthenticated (called by AssemblyAI). To get the user's language preference, it reads `user_id` from the session and looks it up via the Supabase admin API.

- [ ] **Step 1: Replace app/api/webhooks/assemblyai/route.ts with the complete updated file**

```ts
// app/api/webhooks/assemblyai/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServerClient } from '@/lib/supabase-server'
import { parseWebhookBody, getTranscript } from '@/lib/assemblyai'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'

/** Verify webhook using the custom shared-secret header (set on the transcript job at submit time). */
function verifyCustomHeader(headerValue: string | null, secret: string): boolean {
  if (!headerValue || !secret) return false
  const a = Buffer.from(headerValue, 'utf8')
  const b = Buffer.from(secret, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const customHeader = req.headers.get('x-webhook-secret')
  const assemblyaiSig = req.headers.get('x-assemblyai-signature')
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET ?? ''

  const authorized = verifyCustomHeader(customHeader, secret) || !!assemblyaiSig
  if (!authorized) {
    log.warn('Webhook rejected: missing valid auth header')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = JSON.parse(raw) as Record<string, unknown>
  const jobId = body.transcript_id as string

  log.info('Webhook received', { jobId })

  const db = createServerClient()

  const { data: session, error } = await db
    .from('sessions')
    .select('id, user_id')
    .eq('assemblyai_job_id', jobId)
    .single()

  if (error || !session) {
    return NextResponse.json({ ok: true })
  }

  let fullTranscript: Record<string, unknown>
  try {
    fullTranscript = await getTranscript(jobId)
  } catch (err) {
    log.error('getTranscript failed', { sessionId: session.id, jobId, err })
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', session.id)
    return NextResponse.json({ ok: true })
  }

  let parsed
  try {
    parsed = parseWebhookBody(fullTranscript)
  } catch (err) {
    log.error('parseWebhookBody failed', { sessionId: session.id, jobId, err })
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', session.id)
    return NextResponse.json({ ok: true })
  }

  const { error: insertError } = await db.from('transcript_segments').insert(
    parsed.segments.map(s => ({
      session_id: session.id,
      speaker: s.speaker,
      text: s.text,
      start_ms: s.start_ms,
      end_ms: s.end_ms,
      position: s.position,
    }))
  )
  if (insertError) log.error('Segment insert failed', { sessionId: session.id, error: insertError.message })

  log.info('Speaker count determined', { sessionId: session.id, speakerCount: parsed.speakerCount })

  if (parsed.speakerCount === 1) {
    const { error: updateError } = await db.from('sessions').update({
      status: 'analysing',
      detected_speaker_count: 1,
      user_speaker_labels: ['A'],
    }).eq('id', session.id)
    if (updateError) log.error('Status update failed', { sessionId: session.id, error: updateError.message })

    // Look up the user's target language via the admin API
    const { data: { user: sessionUser } } = await db.auth.admin.getUserById(session.user_id ?? '')
    const targetLanguage = (sessionUser?.user_metadata?.target_language as TargetLanguage) ?? 'es-AR'

    runClaudeAnalysis(session.id, targetLanguage).catch(err =>
      log.error('Claude analysis failed (fire-and-forget)', { sessionId: session.id, err })
    )
  } else {
    const { error: updateError } = await db.from('sessions').update({
      status: 'identifying',
      detected_speaker_count: parsed.speakerCount,
    }).eq('id', session.id)
    if (updateError) log.error('Status update failed', { sessionId: session.id, error: updateError.message })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Run webhook tests**

```bash
npm test -- __tests__/api/webhook.test.ts 2>&1 | tail -10
```

Expected: all pass (the mock for `runClaudeAnalysis` doesn't care about arguments).

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/assemblyai/route.ts __tests__/api/webhook.test.ts
git commit -m "feat: look up user target_language in webhook before calling runClaudeAnalysis"
```

---

## Task 16: Update practice-items API routes

**Files:**
- Modify: `app/api/practice-items/route.ts`
- Modify: `app/api/practice-items/[id]/route.ts`
- Modify: `__tests__/api/practice-items.test.ts`

- [ ] **Step 1: Update __tests__/api/practice-items.test.ts mock setup**

Read the current test file first:
```bash
head -30 __tests__/api/practice-items.test.ts
```

Add after the existing `vi.mock` calls:
```ts
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))
import { getAuthenticatedUser } from '@/lib/auth'
```

In `beforeEach`, add:
```ts
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)
```

- [ ] **Step 2: Run existing practice-items tests before route changes**

```bash
npm test -- __tests__/api/practice-items.test.ts 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 3: Update app/api/practice-items/route.ts**

```ts
// app/api/practice-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(_req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()

  // practice_items has no user_id — filter via the user's sessions
  const { data: userSessions } = await db
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)

  const sessionIds = (userSessions ?? []).map((s: { id: string }) => s.id)
  if (sessionIds.length === 0) return NextResponse.json([])

  const { data, error } = await db
    .from('practice_items')
    .select('id, session_id, annotation_id, type, sub_category, original, correction, explanation, reviewed, created_at, updated_at, flashcard_front, flashcard_back, flashcard_note')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()

  // Verify the session belongs to this user before inserting
  const { data: session } = await db
    .from('sessions')
    .select('id')
    .eq('id', body.session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const { data, error } = await db
    .from('practice_items')
    .insert(body)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Update app/api/practice-items/[id]/route.ts**

```ts
// app/api/practice-items/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

type Params = { params: { id: string } }

async function verifyOwnership(db: ReturnType<typeof createServerClient>, itemId: string, userId: string) {
  const { data: item } = await db
    .from('practice_items')
    .select('session_id')
    .eq('id', itemId)
    .single()

  if (!item) return false

  const { data: session } = await db
    .from('sessions')
    .select('id')
    .eq('id', item.session_id)
    .eq('user_id', userId)
    .single()

  return !!session
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const owned = await verifyOwnership(db, params.id, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { reviewed } = await req.json() as { reviewed: boolean }
  const { error } = await db
    .from('practice_items')
    .update({ reviewed })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const owned = await verifyOwnership(db, params.id, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await db
    .from('practice_items')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run practice-items tests**

```bash
npm test -- __tests__/api/practice-items.test.ts 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/practice-items/route.ts app/api/practice-items/[id]/route.ts \
  __tests__/api/practice-items.test.ts
git commit -m "feat: add user auth and ownership checks to practice-items routes"
```

---

## Task 17: Update Settings page — language dropdown + sign-out

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Replace app/settings/page.tsx**

```tsx
// app/settings/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { TARGET_LANGUAGES, type TargetLanguage } from '@/lib/types'

const MIN = 14
const MAX = 22
const STEP = 2
const KEY = 'fontSize'

export default function SettingsPage() {
  const [size, setSize] = useState<number>(16)
  const [language, setLanguage] = useState<TargetLanguage>('es-AR')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    const stored = localStorage.getItem(KEY)
    if (stored) setSize(parseInt(stored, 10))
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const lang = user?.user_metadata?.target_language as TargetLanguage | undefined
      if (lang && lang in TARGET_LANGUAGES) setLanguage(lang)
    })
  }, [supabase])

  function apply(newSize: number) {
    setSize(newSize)
    document.documentElement.style.fontSize = newSize + 'px'
    localStorage.setItem(KEY, String(newSize))
  }

  async function updateLanguage(lang: TargetLanguage) {
    setLanguage(lang)
    await supabase.auth.updateUser({ data: { target_language: lang } })
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="space-y-8 max-w-sm">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Text Size</h2>

        <div className="flex items-center gap-4">
          <button
            onClick={() => apply(size - STEP)}
            disabled={size <= MIN}
            aria-label="−"
            className="w-9 h-9 rounded border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            −
          </button>
          <span className="text-base font-mono w-12 text-center">{size}px</span>
          <button
            onClick={() => apply(size + STEP)}
            disabled={size >= MAX}
            aria-label="+"
            className="w-9 h-9 rounded border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            +
          </button>
        </div>

        <div className="mt-4 border border-gray-800 rounded-lg p-4 space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Preview</p>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">You</p>
            <span className="text-sm leading-relaxed">
              Hoy fui al mercado y compré muchas cosas para la semana.
            </span>
          </div>
          <div className="opacity-40">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Them</p>
            <span className="text-sm leading-relaxed">¿Y qué compraste?</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Target Language</h2>
        <select
          value={language}
          onChange={e => updateLanguage(e.target.value as TargetLanguage)}
          className="w-full px-3 py-2 rounded border border-gray-700 bg-gray-900 text-gray-100 text-sm focus:outline-none focus:border-gray-500"
        >
          {(Object.entries(TARGET_LANGUAGES) as [TargetLanguage, string][]).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Account</h2>
        <button
          onClick={signOut}
          className="w-full px-4 py-2 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 transition-colors text-sm text-left"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: add language dropdown and sign-out button to Settings"
```

---

## Task 18: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

```bash
npm run lint 2>&1 | tail -10
```

Expected: no errors.

---

## Task 19: Add ALLOWED_EMAILS to environment and deploy

- [ ] **Step 1: Add ALLOWED_EMAILS to .env.local**

Add to `.env.local`:
```
ALLOWED_EMAILS=your@gmail.com,friend@gmail.com
```

- [ ] **Step 2: Add ALLOWED_EMAILS to Vercel**

In the Vercel dashboard → Project Settings → Environment Variables, add:
- Key: `ALLOWED_EMAILS`
- Value: `your@gmail.com,friend@gmail.com`
- Environment: Production, Preview

- [ ] **Step 3: Deploy**

```bash
git push origin main
```

Verify the Vercel build completes successfully.

---

## Task 20: Post-deploy backfill and enable RLS

> **This task runs after deploying and signing in for the first time.**

**Files:**
- Create: `supabase/migrations/20260329000001_enable_rls.sql`

- [ ] **Step 1: Find your user UUID**

Sign in to the app with Google. Then in the Supabase dashboard → Authentication → Users, copy your UUID.

- [ ] **Step 2: Run the backfill in Supabase SQL Editor**

```sql
update sessions set user_id = '<your-uuid-here>' where user_id is null;
```

Verify with:
```sql
select count(*) from sessions where user_id is null;
```

Expected: `0`.

- [ ] **Step 3: Create and apply the RLS migration**

Create `supabase/migrations/20260329000001_enable_rls.sql`:

```sql
-- supabase/migrations/20260329000001_enable_rls.sql
-- Run this AFTER backfilling user_id on all existing sessions.

alter table sessions alter column user_id set not null;

alter table sessions enable row level security;

create policy "Users see own sessions"
  on sessions for all
  using (auth.uid() = user_id);
```

Apply in Supabase SQL Editor:

```sql
alter table sessions alter column user_id set not null;
alter table sessions enable row level security;
create policy "Users see own sessions" on sessions for all using (auth.uid() = user_id);
```

- [ ] **Step 4: Verify the app still works**

Navigate to the home page. Confirm your sessions are visible. Confirm the session list loads correctly.

- [ ] **Step 5: Commit the migration file**

```bash
git add supabase/migrations/20260329000001_enable_rls.sql
git commit -m "feat: enable RLS on sessions table (apply after backfill)"
git push origin main
```
