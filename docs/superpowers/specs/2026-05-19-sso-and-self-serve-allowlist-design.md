# SSO & Self-Serve Allowlist Design

**Date:** 2026-05-19
**Status:** Approved (design phase)
**Mockups:** [`mockups/sso-and-allowlist.html`](../../../mockups/sso-and-allowlist.html)

## Overview

Replace the manual "tester emails me → I edit `ALLOWED_EMAILS` env var → I redeploy → tester uses magic link" onboarding loop with:

1. **Google SSO** as the primary sign-in path (magic-link kept as fallback).
2. **A DB-backed allowlist** (`allowed_users`) with three states: `pending` | `approved` | `denied`.
3. **A trigger** on `auth.users` insert that auto-records every fresh sign-up as `pending` unless an admin has already pre-approved their email.
4. **An admin page (`/admin`)** that lists pending requests on a phone-first surface and lets the owner approve or deny with one tap.
5. **A push notification** to the owner's existing Web Push subscription whenever a new pending request arrives.
6. **An approval email** sent automatically when the owner approves: a single magic-link CTA that drops the user straight into the app.

The end-state is: new tester goes to the URL → taps "Continue with Google" → lands on a friendly pending screen and closes the tab. Owner gets a push, taps it, sees the request on `/admin`, taps Approve. Tester gets an email with a one-click sign-in link. Zero back-and-forth, zero env-var edits, zero redeploys.

---

## 1. Goals & Non-Goals

### Goals

- **Eliminate the env-var-edit-and-redeploy step** for onboarding new testers.
- **Eliminate the manual email handoff** ("share your email with me first") — testers can self-register via Google or magic-link without prior coordination.
- **Keep cost gating intact** — every approved user incurs real AssemblyAI / Claude / Gemini cost, so the approval gate must remain. This is a private beta, not open signup.
- **Reuse existing infrastructure** wherever possible — Supabase Auth (Google provider), Web Push (VAPID), Supabase email service. No new dependencies.

### Non-Goals (v1)

- **GitHub or Facebook SSO** — Google only. Adding more providers can happen later; each new provider is OAuth config plus a tested code path. YAGNI.
- **Self-serve approval workflows** — only the owner approves. No team / multi-admin support.
- **Per-user push subscriptions** — the current `push_subscriptions` model is a single global row keyed on `id=1`, which happens to map to "the owner's device" today. This is preserved; refactoring it is tracked as a separate, future concern.
- **Email-based notification to the owner** — Web Push to the owner's already-subscribed phone is sufficient. We do not add Resend / Postmark / SendGrid in this work.
- **Rate-limiting / abuse mitigation** — the gate itself is the rate-limit. If abuse becomes real, we layer on Cloudflare Turnstile or similar later.
- **Approval UX for the genuinely-denied path** — denied users continue to see the existing `/access-denied` page (mailto: prompt) unchanged.

---

## 2. Architecture

```
┌─ Login page (mobile + desktop) ───────────────────────────┐
│  [Continue with Google ]   ← new primary CTA              │
│  ─── or use email ───                                     │
│  Email magic-link  ← existing, kept as fallback            │
└────────────────────────────────────────────────────────────┘
                            │
                  Supabase Auth (Google OAuth or OTP)
                            │
                            ▼
              ┌──── auth.users INSERT ─────┐
              │  Postgres trigger fires:    │
              │  upsert into allowed_users  │
              │  with status='pending'      │
              │  (unless email already      │
              │  approved by seed/admin)    │
              └──────────────┬──────────────┘
                             │
                             ▼
               ┌── allowed_users table ──┐
               │  email (pk, lowercase)  │
               │  status: pending|       │
               │          approved|      │
               │          denied         │
               │  user_id, name,         │
               │  avatar_url, source,    │
               │  requested_at,          │
               │  approved_at,           │
               │  approved_by            │
               └────────┬──────┬──────────┘
                        │      │
           ┌────────────┘      └────────────────┐
           ▼                                    ▼
  middleware checks status               Admin page (/admin)
  ─ approved   → into app                ─ Lists pending rows
  ─ pending    → /pending-approval       ─ Approve flips status
  ─ denied     → /access-denied            → triggers signInWithOtp
  ─ no row     → defensive: pending        → fires the email
                                          ─ Deny flips status
                                          ─ Both reversible
                                          ─ Owner-gated server-side
                                          ─ New pending row →
                                            sendAdminPush()
```

**Trust model:** Middleware is the single trust boundary. It calls `supabase.auth.getUser()` (existing pattern, ~one auth network call per request) and then makes **one additional Postgres RPC** to look up `allowed_users` by email. The RPC is a `SECURITY DEFINER` function so it does not require widening service-role usage. Both calls are wrapped at the layout level via the existing `getAuthenticatedUser()` React `cache()` so navigation does not multiply them.

---

## 3. Data Model

### 3.1 New table: `allowed_users`

```sql
create type access_status as enum ('pending', 'approved', 'denied');

create table public.allowed_users (
  email          text primary key,
  status         access_status not null default 'pending',
  requested_at   timestamptz   not null default now(),
  approved_at    timestamptz,
  approved_by    text,                       -- owner email who flipped status
  user_id        uuid references auth.users(id) on delete set null,
  name           text,                       -- best-effort from OAuth profile
  avatar_url     text,                       -- best-effort from OAuth profile
  source         text                        -- 'google' | 'magic_link' | 'seed'
);

create index allowed_users_status_pending_idx
  on public.allowed_users (status, requested_at desc)
  where status = 'pending';
```

**Design choices:**

- **`email` is the primary key, not `user_id`.** The allowlist must work BEFORE `auth.users` exists — the seed migration writes rows for emails that have never signed up. Keying on `user_id` would prevent pre-approval. `user_id` is populated lazily by the trigger on first sign-in.
- **Email is stored lowercase** (the trigger calls `lower()`). Middleware lookups also lowercase. Prevents `Foo@bar.com` vs `foo@bar.com` mismatches.
- **`status` enum, not boolean.** The `denied` state lets the owner block an abusive email without deleting the row (which would allow them to sign up again and re-enter as `pending`).
- **Partial index on `pending` only.** The admin "pending requests" query runs constantly; once a row is approved it drops out of the index. Approved table grows forever without hurting query cost.
- **`name` / `avatar_url`** are populated from `auth.users.raw_user_meta_data` when available (Google supplies both; magic-link does not). Pure UX polish for the admin page — never functional.
- **`source`** distinguishes 'google' / 'magic_link' / 'seed' for analytics ("are testers using SSO?"). No functional impact.

### 3.2 Trigger on `auth.users` insert

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.allowed_users (email, status, user_id, name, avatar_url, source)
  values (
    lower(new.email),
    'pending',
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    case
      when new.raw_app_meta_data->>'provider' = 'google' then 'google'
      else 'magic_link'
    end
  )
  on conflict (email) do update set
    user_id    = excluded.user_id,
    name       = coalesce(public.allowed_users.name, excluded.name),
    avatar_url = coalesce(public.allowed_users.avatar_url, excluded.avatar_url),
    source     = case
                   when public.allowed_users.source = 'seed' then excluded.source
                   else public.allowed_users.source
                 end;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

**Crucial invariant:** the `on conflict do update` **does not touch `status`**. A pre-approved seeded tester signing in for the first time gets their `user_id` / `name` / `avatar_url` filled in but stays `approved`. A previously denied user attempting to re-register stays `denied`. Status only ever transitions via the admin action.

### 3.3 Access-check RPC

```sql
create or replace function public.get_access_status(email_in text)
returns table (status access_status)
language sql
security definer
set search_path = public
as $$
  select status from public.allowed_users where email = lower(email_in);
$$;
```

Called from middleware. Returning the row directly via PostgREST works too; an RPC is preferable so we can later extend it (e.g. log access decisions) without coupling middleware to schema shape.

### 3.4 Seed migration

```sql
insert into public.allowed_users (email, status, source, approved_at, approved_by)
values
  ('josh.biddick@gmail.com',           'approved', 'seed', now(), 'system'),
  ('joshua.biddick@entelect.co.nz',    'approved', 'seed', now(), 'system'),
  ('josh.entelect@gmail.com',          'approved', 'seed', now(), 'system'),
  ('luciano.mateu@hotmail.com',        'approved', 'seed', now(), 'system'),
  ('ruben7are@gmail.com',              'approved', 'seed', now(), 'system'),
  ('josh.biddick+newuser@gmail.com',   'approved', 'seed', now(), 'system'),
  ('nahueabasto@gmail.com',            'approved', 'seed', now(), 'system'),
  ('blueinthecloud12345@outlook.com',  'approved', 'seed', now(), 'system')
on conflict (email) do nothing;
```

The 8 emails are the current contents of `ALLOWED_EMAILS`. After this seed runs, every existing tester continues to sign in identically (magic-link → middleware → DB lookup returns `approved` → into app). `on conflict do nothing` makes the migration safe to re-run.

### 3.5 RLS

`allowed_users` has RLS enabled with no `select` / `insert` / `update` / `delete` policies for authenticated users. All access goes through `SECURITY DEFINER` functions (`get_access_status`) or the service-role client (admin API routes). The client never reads from this table directly.

---

## 4. Middleware Changes

Modify `middleware.ts` to replace the env-var check (lines 96–103 of the current file) with a DB lookup. Pseudocode:

```ts
// existing: after getUser() succeeds, before forwarding identity headers
const email = user.email?.toLowerCase()
if (!email) {
  // No email on the user record (shouldn't happen with the providers we support,
  // but defensive). Treat as denied.
  return NextResponse.redirect(new URL('/access-denied', request.url))
}

const { data: rows } = await supabase.rpc('get_access_status', { email_in: email })
const status = rows?.[0]?.status ?? null

switch (status) {
  case 'approved':
    // fall through into the existing identity-header forwarding block
    break
  case 'pending':
    return NextResponse.redirect(new URL('/pending-approval', request.url))
  case 'denied':
    return NextResponse.redirect(new URL('/access-denied', request.url))
  default:
    // No row yet — the trigger should have run, but be defensive.
    // Most likely a brand-new user whose trigger ran in a different transaction.
    return NextResponse.redirect(new URL('/pending-approval', request.url))
}
```

`PUBLIC_PREFIXES` gains `/pending-approval`:

```ts
const PUBLIC_PREFIXES = ['/login', '/auth', '/access-denied', '/pending-approval', '/api/webhooks']
```

`ALLOWED_EMAILS` is removed from the file. The env var itself stays defined in Vercel for one week post-deploy as a rollback aid, then is removed once we're confident.

**Cost:** one extra RPC round-trip per protected request. The RPC hits a unique-indexed `text` PK lookup — sub-ms server-side. The network hop is the same Supabase URL already used by `getUser()`, so the TCP/TLS cost is amortised. We expect <10ms of overhead per request.

---

## 5. Login Page Changes

### 5.1 UI additions

`app/login/page.tsx` gains a primary "Continue with Google" button **above** the existing flow. Layout (matching the mockup in `sso-and-allowlist.html`):

```
LogoMark (robot)
CONVERSATION COACH wordmark
H1 — "Sign in"        (or "Welcome back" when savedEmail exists)

┌─ Primary CTA ─────────────────────────┐
│  Continue with Google                 │  ← new
└───────────────────────────────────────┘

──── or use email ────                   ← divider

(existing): "Continue as X" (saved-email quick-select)
            — or —
            Email input + "Email me a link"

(existing): "Use a different email" text link
```

**Returning users with a remembered email** see "Continue as X" as the primary CTA (preserving the existing one-tap pattern), with Google offered second. This avoids forcing existing testers to switch providers — Google is an option, not a migration.

**Brand choice:** the Google button is rendered as dark-on-cream rather than Google's standard blue/white. Google's brand guidelines permit dark and neutral variants; using blue here would clash with the violet accent (`--color-accent-primary`) and emerald voice palette. Inside the button, the Google "G" multi-colour glyph is preserved for recognisability.

### 5.2 Client-side handler

```ts
async function continueWithGoogle() {
  setLoading(true)
  setError(null)
  const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) {
    setLoading(false)
    setError(friendlyError(error, t))
  }
  // On success Supabase navigates away; no further state to manage.
}
```

The existing `/auth/callback` page works unchanged — `detectSessionInUrl` already handles both PKCE-code (magic-link) and OAuth-code (SSO) exchanges. The `router.refresh()` then `router.replace()` flow that flushes stale prefetch cache is reused.

### 5.3 Supabase provider configuration

Done in the Supabase Dashboard, not in code:

- Auth → Providers → Google → enabled, Client ID + Client Secret from a Google Cloud Console OAuth 2.0 credential.
- Authorised redirect URI in Google Cloud: `https://<project-ref>.supabase.co/auth/v1/callback`.
- Authorised JavaScript origins: production domain + `localhost:3000` for dev.

**Scopes:** default (`openid`, `email`, `profile`). `profile` gives us name + avatar.

### 5.4 i18n

New translation keys in `lib/i18n.ts`:

- `auth.continueWithGoogle` — "Continue with Google" / "Continuar con Google"
- `auth.orUseEmail` — "or use email" / "o usar email"
- `auth.welcomeBack` — "Welcome back" / "Hola de nuevo"
- `auth.invitedNote` is **rewritten** to drop the "invited testers" framing — see section 12.

---

## 6. Pending-Approval Screen

New route at `/pending-approval`. Client component (no DB data needed beyond `auth.user.email`).

### 6.1 Surface

See mockup section 02. Treatment:

- **Amber pulsing ring** around a small hourglass icon — uses the existing `oa-pulse` keyframe vocabulary at a longer duration (3.2s). `prefers-reduced-motion` suppresses the ring; the static hourglass remains.
- **Source Serif 4 H1** — "Your access request is in"
- **Patient body copy** — "I review new sign-ups personally — usually within a day. You'll get an email with a one-click sign-in link the moment you're approved. No need to come back here."
- **A "Requested as" detail card** showing the user's email (so they can spot a typo, e.g. they signed in with the wrong Google account).
- **Single secondary action:** "Sign out".

No "Email me to ask why" — that copy belongs on `/access-denied`. The pending state is patient; the denied state is recovery-oriented.

### 6.2 Why amber

`.impeccable.md` reserves amber strictly for warnings. This is a borrow — pending is the closest thing to "paused / waiting" the system has. Red would mis-signal rejection. Neutral surface would read as broken. Amber is the deliberate choice; the design context note will be updated to add "paused" as a permitted amber use.

### 6.3 Routing

- Authenticated users with `status='pending'` are middleware-redirected here.
- Authenticated users with any other status who navigate directly to `/pending-approval` see the same page if `status='pending'`, or are redirected back into the app if `status='approved'`, or to `/access-denied` if denied. (Implemented in the route's own RSC — defensive.)
- Unauthenticated users hitting `/pending-approval` are redirected to `/login`.

---

## 7. Admin Page

### 7.1 Route & access control

Route: **`/admin`** (top-level).

Server-side gating in `app/admin/page.tsx`:

```ts
const user = await getAuthenticatedUser()
if (!user) redirect('/login')
const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL?.toLowerCase()
if (!OWNER_EMAIL || user.email?.toLowerCase() !== OWNER_EMAIL) notFound()
```

`NEXT_PUBLIC_OWNER_EMAIL` is reused from the existing `/access-denied` page. A server-side `notFound()` (rather than 403) means a non-owner cannot detect that `/admin` exists.

Middleware does **not** need a special case — `/admin` is a normal protected route, and the owner's email is always `approved` so they get through the standard middleware path.

### 7.2 Layout

See mockup section 03. Three groups, top-to-bottom:

1. **Pending (N waiting)** — each request is a card with avatar, name (or "No name yet"), email, "Requested X ago", a "Google" / "Email link" provider pill, an `Approve` primary button, and a `Deny` secondary outline button.
2. **Approved (N testers)** — collapsed by default into a quiet card; expand to see a list of approved emails with their approval timestamps.
3. **Denied (N)** — same treatment as Approved; usually empty.

Phone-first design — the owner will approve from their phone after a push notification.

### 7.3 Data loading

Loader in `lib/loaders.ts`:

```ts
export async function loadAllowedUsers() {
  const db = createServiceRoleClient()
  const { data, error } = await db
    .from('allowed_users')
    .select('email, status, name, avatar_url, source, requested_at, approved_at')
    .order('requested_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
```

Used by the RSC. No client-side fetch on initial render.

### 7.4 Approve / Deny actions

API routes (gated server-side by owner email):

- `POST /api/admin/access/[email]/approve` — sets `status='approved'`, `approved_at=now()`, `approved_by=ownerEmail`. Triggers a magic-link email send (see section 9).
- `POST /api/admin/access/[email]/deny` — sets `status='denied'`. No email sent (denied users hit `/access-denied` on next attempt; that page already explains the recourse).

Both routes:

1. Re-verify the caller is the owner.
2. URL-decode and lowercase the email param.
3. Update the row via service-role client.
4. Return `{ ok: true, status }`.

Client side: optimistic UI — the row removes itself from Pending immediately on tap; if the API call fails, the row reappears with an inline error toast.

### 7.5 Animation

The row crossing from Pending to Approved uses the existing `stage-in` keyframe family (the same one pipeline stages use). Reduced-motion users see an instant swap.

---

## 8. Admin Push Notification

### 8.1 Mechanism

Whenever a row is inserted into `allowed_users` with `status='pending'`, a push notification is sent to the owner's device. **Triggered from application code, not a Postgres trigger** — keeps the push logic out of the DB layer where we have no good way to handle failures or retries.

Wiring: the **auth callback page** (`/auth/callback`) already runs on every sign-in. After `SIGNED_IN` fires we POST to a new endpoint:

```
POST /api/access-request/notify
Body: { email: string }
```

The endpoint:

1. Looks up the email in `allowed_users`.
2. If the row is `status='pending'` AND `requested_at` is within the last 60 seconds (defends against double-fire on page reloads), calls `sendAdminPush()`.
3. Returns 204 unconditionally (don't leak whether the user is pending vs approved).

### 8.2 `lib/push.ts` extension

Refactor the existing helper to support both notification types:

```ts
// Existing: rename and keep signature
export async function sendSessionReadyPush(sessionId: string, title: string)

// New
export async function sendAdminPush(args: {
  title: string
  body: string
  url: string
})
```

Both call into a shared private `sendToOwnerDevice(payload)` that reads `push_subscriptions` row `id=1`. The single-row model is preserved — when push subscriptions later become per-user, `sendAdminPush` will need to look up the owner's subscription explicitly (tracked as a follow-up; documented in `CLAUDE.md` after this ships).

### 8.3 Service worker

`public/sw.js` currently handles `push` events by routing to `/sessions/[id]`. Generalise to read `payload.url` if present and fall back to the session URL pattern otherwise:

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url
              ?? `/sessions/${event.notification.data?.sessionId}`
  event.waitUntil(clients.openWindow(url))
})
```

### 8.4 Notification copy

- **Title:** "New access request" (always — predictable, scannable)
- **Body:** `${email} signed in via ${provider}. Tap to review.`
- **URL:** `/admin`

### 8.5 Failure modes

- **Owner not subscribed** (`push_subscriptions` empty): the helper logs a warning and returns silently. The admin page is still functional; the owner just doesn't get notified out-of-band. Eventually they'll see the request when they next open `/admin`.
- **Push delivery fails** (e.g. expired subscription): logged. No retry queue in v1 — this is a notification, not a transactional event.

---

## 9. Approval Email

### 9.1 Mechanism

When the admin Approve action succeeds, the API route calls Supabase's server-side OTP API:

```ts
const supabase = createServiceRoleClient()
await supabase.auth.signInWithOtp({
  email: targetEmail,
  options: {
    emailRedirectTo: `${process.env.APP_URL}/auth/callback`,
    shouldCreateUser: false,    // user already exists in auth.users
  },
})
```

Supabase's email service sends a magic-link email using the same template / SMTP configuration already in use for the login magic-link path. **No new email service / dependency is introduced.**

**Why not `auth.admin.inviteUserByEmail`:** that API is for users who do NOT yet exist in `auth.users`. By the time the owner approves, the user has already signed in (which is what created the pending row). `inviteUserByEmail` would fail with "user already registered". `signInWithOtp` is the correct call.

### 9.2 Email content

The email body is controlled by the Supabase Auth → Email Templates → "Magic Link" template. We update that template to match the on-brand design (mockup section 05):

- **Sender:** "Conversation Coach <noreply@…>" (already configured)
- **Subject:** "You're in — sign in to Conversation Coach"
- **Body:** serif H2 headline, two short Hanken paragraphs, single violet CTA button, fine-print fallback line ("link valid for one hour")

Supabase's template language supplies `{{ .ConfirmationURL }}` for the magic link. The full template HTML is drafted as part of the implementation PR against the mockup design (section 05). Supabase does not yet support template-as-code, so the HTML is applied via the Dashboard during deploy and a copy is committed to `docs/email-templates/magic-link.html` for tracking.

### 9.3 Edge cases

- **Approve fires the email, then the link expires:** the user comes back to the app, clicks "Continue with Google" or requests a new magic-link, and is now `approved` in the DB → straight in. The email is a convenience, not the only path. Copy reflects this.
- **Subject line collision with the login magic-link:** Supabase only has one "Magic Link" template. We accept that the post-approval email and a re-login magic-link share the same subject; the body copy differentiates them sufficiently.

---

## 10. Migration & Rollout Plan

### 10.1 Migration sequence

1. **`supabase/migrations/20260520000000_allowed_users.sql`** — creates the type, table, partial index, trigger function, trigger, and `get_access_status` RPC.
2. **`supabase/migrations/20260520000001_allowed_users_seed.sql`** — inserts the 8 current emails as `approved`.
3. **Code change PR** — middleware + login page + admin page + push extension + new routes. Ship behind no feature flag (the env-var path is fully replaced atomically — there's no half-state).
4. **Supabase Dashboard config** — enable Google provider, update Magic Link email template.
5. **Verify** — sign out, sign back in via existing magic-link path (smoke test); sign in fresh with a new Google account on a test device, observe the pending screen, approve from `/admin`, observe the email arriving and one-click sign-in working.
6. **Cleanup after 1 week** — remove `ALLOWED_EMAILS` from Vercel env (code already ignores it).

### 10.2 Rollback

The change is a single PR. Revert reverts everything. The DB table stays in place (idle); the env var was kept as a safety net for the week post-ship, so middleware just gets restored to reading it. Single-commit rollback, ~5 minutes.

---

## 11. Testing Strategy

### 11.1 Unit / integration (Vitest)

- **`__tests__/middleware.test.ts`** — extend existing tests with the new branches. Mock `supabase.rpc('get_access_status')`. Cases:
  - `approved` → passes through with identity headers set
  - `pending` → redirects to `/pending-approval`
  - `denied` → redirects to `/access-denied`
  - No row → redirects to `/pending-approval` (defensive)
  - `/pending-approval` itself is a public prefix
- **`__tests__/app/login.test.tsx`** — Google button renders, fires `signInWithOAuth` with `provider: 'google'` and the correct `redirectTo`.
- **`__tests__/app/admin.test.tsx`** — owner sees the page; non-owner gets `notFound()`; pending rows render with Approve / Deny buttons; approved/denied groups render collapsed.
- **`__tests__/api/admin/access.test.ts`** — POST to approve as owner: row updates, magic-link sent, push notification fired. POST as non-owner: 403. POST to deny: row updates, no email. Idempotent re-approve / re-deny.
- **`__tests__/api/access-request/notify.test.ts`** — only fires `sendAdminPush` when row is pending AND fresh.
- **`__tests__/lib/push.test.ts`** — extend with `sendAdminPush` tests.

### 11.2 DB integration (manual)

The existing test harness does not spin up a live Supabase instance, so the DB-level behaviours are exercised against a local Supabase project as a manual checklist before the migration ships:

- **Trigger behaviour:** insert into `auth.users` (via local Supabase Studio or `supabase.auth.admin.createUser`), verify the matching row appears in `allowed_users` with `status='pending'`. Insert a second user with an already-approved email, verify the existing row keeps `status='approved'` (only `user_id` / `name` get filled in).
- **Seed migration:** run against a fresh local Supabase instance, verify 8 rows appear as `approved`. Re-run, verify `on conflict do nothing` makes it a safe no-op.
- **`get_access_status` RPC:** call with a lowercase, uppercase, and mixed-case email — all three return the same row.

### 11.3 Pre-deploy manual checklist

- [ ] Sign in with existing magic-link email — lands in app, no behaviour change.
- [ ] Sign in with brand-new Google account — lands on pending screen, push notification arrives.
- [ ] Tap Approve in `/admin` from owner's phone — row moves, email arrives at test address.
- [ ] Click magic-link in approval email — drops straight into the app.
- [ ] Sign in with a denied email — lands on `/access-denied`.
- [ ] Sign out and back in repeatedly — push notification does not double-fire (debounce works).
- [ ] Test on the PWA installed standalone (the iOS share-target context) — auth flow works there too.

---

## 12. Copy & i18n Changes

Existing login-page copy referenced "invited testers", which is no longer accurate (anyone can now request access). Updates required in `lib/i18n.ts`:

- `auth.invitedNote` → `auth.requestAccessNote`: **"New here? Sign in with Google or your email and I'll review your request within a day."** (en) / Spanish equivalent.
- `auth.signInTitle` stays "Sign in" / "Iniciar sesión". For returning users (savedEmail present) it switches to **"Welcome back"** / **"Hola de nuevo"** via a new `auth.welcomeBack` key.
- New keys: `auth.continueWithGoogle`, `auth.orUseEmail`, `auth.welcomeBack`.
- New keys for `/pending-approval`: `pending.title`, `pending.body`, `pending.requestedAs`, `pending.signOut`.
- New keys for `/admin`: `admin.eyebrow`, `admin.title`, `admin.pending`, `admin.approved`, `admin.denied`, `admin.approve`, `admin.deny`, `admin.requestedAgo`, `admin.viaGoogle`, `admin.viaEmail`, `admin.nameUnknown`, `admin.emptyDenied`.

Spanish copy is the owner's responsibility (he is the user) and will be drafted in the implementation PR.

---

## 13. Updates to `.impeccable.md`

Add a short note under "Decision log":

> **Amber permits a "paused / waiting" use, narrowly:** the `/pending-approval` screen uses an amber pulsing ring + hourglass to signal that a fresh sign-up is queued. This is the only non-warning surface that uses amber, justified because pending IS the closest emotional register to a warning the design system has (red would mis-signal rejection; neutral would read as broken). Do not extend the borrow elsewhere — keep amber decoratively reserved everywhere except this one screen and the existing warning surfaces.

Add the `/admin` route under "Surface constraints" with a one-line note that it's owner-only and phone-first.

---

## 14. Updates to `CLAUDE.md`

After ship, add these notes to `CLAUDE.md`:

- **Allowlist is in the DB, not the env:** `allowed_users` table is the source of truth. `ALLOWED_EMAILS` env var is deprecated and unread.
- **Trigger writes `allowed_users` on every `auth.users` insert:** seeded approved emails are protected by `on conflict do update` that intentionally does not touch `status`.
- **Owner identity:** `NEXT_PUBLIC_OWNER_EMAIL` is the single source of truth for "who is the admin". Used by `/access-denied`, `/admin`, and `lib/push.ts` for the admin notification path.
- **`push_subscriptions` row id=1 is the owner's device:** known limitation, holds for now. The `sendAdminPush` helper assumes this; revisit when push goes per-user.
- **Approval email reuses Supabase's Magic Link template:** subject line is shared with the login magic-link path. Acceptable trade-off — body copy differentiates.

---

## 15. Open Questions / Future Work

- **Multi-admin support** — if multiple owners ever need approve permissions, replace the `NEXT_PUBLIC_OWNER_EMAIL` env check with an `is_admin` column on `allowed_users` (or a separate `admins` table). Not needed in v1.
- **Per-user push subscriptions** — current model is single global; admin push relies on this incidentally. When push goes per-user, `sendAdminPush` must look up the owner's subscription explicitly via `NEXT_PUBLIC_OWNER_EMAIL`.
- **Self-serve denial reason** — could let the owner attach a short reason on deny, surfaced on `/access-denied`. Out of scope for v1.
- **GitHub / Facebook providers** — add later if a real tester is blocked from Google sign-in. Each new provider is OAuth config + minimal code (`signInWithOAuth({ provider: 'github' })`).
- **Approval queue analytics** — useful future surface: "average time-to-approve", "approval rate by provider". The `source`, `requested_at`, `approved_at` columns are deliberately retained to support this without a schema change.
- **Auto-restore of denied users after N days** — `allowed_users.denied_at` could be added to support "denials soft-expire after 90 days". Not needed yet.
