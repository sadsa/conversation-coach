# SSO & Self-Serve Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `ALLOWED_EMAILS` env-var allowlist + magic-link-only login with a DB-backed allowlist (pending | approved | denied), Google SSO as the primary sign-in path, and an owner-gated `/admin` surface that approves requests with one tap.

**Architecture:** A new `allowed_users` table is the source of truth for access state. A trigger on `auth.users` insert auto-records every fresh sign-up as `pending`. Middleware looks up status via a SECURITY DEFINER RPC. The owner approves on `/admin`; approval triggers Supabase's `signInWithOtp` to send a one-click magic-link email. The owner is notified of new requests via the existing Web Push pipeline.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + Auth + email service), `@supabase/ssr`, `@supabase/supabase-js`, web-push (VAPID), Vitest + React Testing Library, Tailwind CSS.

**Spec:** [`docs/superpowers/specs/2026-05-19-sso-and-self-serve-allowlist-design.md`](../specs/2026-05-19-sso-and-self-serve-allowlist-design.md)
**Mockups:** [`mockups/sso-and-allowlist.html`](../../../mockups/sso-and-allowlist.html)

---

## File Structure

**Create:**
- `supabase/migrations/20260520000000_allowed_users.sql` — table, enum, index, trigger function, trigger, RPC
- `supabase/migrations/20260520000001_allowed_users_seed.sql` — seed 8 existing testers
- `app/pending-approval/page.tsx` — friendly waiting room (client component)
- `app/admin/page.tsx` — RSC, owner-gated, hands off to `AdminClient`
- `components/AdminClient.tsx` — client island with approve/deny optimistic UI
- `app/api/admin/access/[email]/approve/route.ts` — POST: flips to approved + sends magic-link email
- `app/api/admin/access/[email]/deny/route.ts` — POST: flips to denied
- `app/api/access-request/notify/route.ts` — POST: fires push to owner when row is fresh-pending
- `docs/email-templates/magic-link.html` — committed copy of the Supabase Magic Link template HTML
- `__tests__/pages/PendingApprovalPage.test.tsx`
- `__tests__/pages/AdminPage.test.tsx`
- `__tests__/components/AdminClient.test.tsx`
- `__tests__/api/admin-access-approve.test.ts`
- `__tests__/api/admin-access-deny.test.ts`
- `__tests__/api/access-request-notify.test.ts`

**Modify:**
- `middleware.ts` — replace `ALLOWED_EMAILS` parsing with `get_access_status` RPC; add `/pending-approval` to `PUBLIC_PREFIXES`
- `lib/push.ts` — add `sendAdminPush(args)` alongside existing `sendPushNotification`
- `lib/loaders.ts` — add `loadAllowedUsers()`
- `lib/i18n.ts` — add login / pending / admin keys (en + es)
- `app/login/page.tsx` — add primary "Continue with Google" CTA; reorder for returning users
- `app/auth/callback/page.tsx` — POST to `/api/access-request/notify` on `SIGNED_IN`
- `public/sw.js` — read `payload.url` and fall back to session URL pattern
- `.impeccable.md` — add amber-borrow note in Decision log; add `/admin` to Surface constraints
- `CLAUDE.md` — add allowlist + trigger + owner-identity notes after ship
- `__tests__/middleware.test.ts` — extend with new branches; mock the RPC

**No changes required:**
- `app/access-denied/page.tsx` (kept for the genuinely-denied case)
- `lib/supabase-server.ts` (`createServerClient` already returns a service-role client)
- `lib/auth.ts` (the header-passthrough fast-path already works for the new routes)

---

## Task Ordering

Tasks run in this order to keep the app deployable at every checkpoint:

1. DB schema migration (no code consumes it yet)
2. DB seed migration (8 existing emails marked approved)
3. Middleware cutover (existing testers continue working via seeded approval)
4. `sendAdminPush` helper
5. `/api/access-request/notify` endpoint
6. Auth callback wires the notify call
7. Service worker URL generalisation
8. i18n keys
9. Login page: Google CTA
10. `/pending-approval` page
11. `loadAllowedUsers` loader
12. `/api/admin/access/[email]/approve` (with magic-link email)
13. `/api/admin/access/[email]/deny`
14. `/admin` RSC + `AdminClient` component
15. Docs updates
16. Supabase Dashboard config (manual checklist)

---

## Task 1: Database schema migration

**Files:**
- Create: `supabase/migrations/20260520000000_allowed_users.sql`

The migration creates the table, enum, partial index, trigger function, trigger on `auth.users`, and the `get_access_status` RPC.

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260520000000_allowed_users.sql

-- Access state enum. Three states are the minimum useful set:
-- pending → trigger inserted the row from a fresh signup
-- approved → admin tapped Approve (or seeded as approved)
-- denied → admin tapped Deny; user lands on /access-denied with no recourse
create type access_status as enum ('pending', 'approved', 'denied');

-- Primary key is `email`, not `user_id`, so the seed migration and any
-- future "pre-approve this email before signup" flow can write rows for
-- users who do not exist in auth.users yet. The trigger fills in user_id
-- lazily on first sign-in via on conflict do update.
create table public.allowed_users (
  email          text primary key,
  status         access_status not null default 'pending',
  requested_at   timestamptz   not null default now(),
  approved_at    timestamptz,
  approved_by    text,
  user_id        uuid references auth.users(id) on delete set null,
  name           text,
  avatar_url     text,
  source         text
);

-- The admin "pending requests" query runs every page load on /admin.
-- A partial index keeps it cheap forever — approved rows drop out.
create index allowed_users_status_pending_idx
  on public.allowed_users (status, requested_at desc)
  where status = 'pending';

-- Lock down direct table access. All reads/writes go through SECURITY
-- DEFINER functions (this file) or the service-role client (admin routes).
alter table public.allowed_users enable row level security;
-- Intentionally no policies — RLS denies everything by default for non-
-- service-role roles. Authenticated users can still call the RPC below.

-- SECURITY DEFINER → runs as the table owner so it bypasses RLS for the
-- upsert. search_path is pinned to prevent search-path-hijack attacks.
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
    -- Preserve the seeded name/avatar if any; otherwise take what OAuth gave us.
    name       = coalesce(public.allowed_users.name, excluded.name),
    avatar_url = coalesce(public.allowed_users.avatar_url, excluded.avatar_url),
    -- Source is sticky once set to anything other than 'seed', so an
    -- approved-via-seed tester signing in via Google later gets re-tagged
    -- as 'google' for analytics. Approved status itself is NEVER touched
    -- by this trigger — only the admin's approve/deny endpoints flip it.
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

-- Middleware calls this on every protected request. Returning a row
-- (not a scalar) lets callers extend the result later without breaking
-- the wire protocol.
create or replace function public.get_access_status(email_in text)
returns table (status access_status)
language sql
security definer
set search_path = public
as $$
  select au.status from public.allowed_users au where au.email = lower(email_in);
$$;

-- Allow anon + authenticated to call the RPC. The function is SECURITY
-- DEFINER so callers don't need direct table privileges.
grant execute on function public.get_access_status(text) to anon, authenticated;
```

- [ ] **Step 2: Apply the migration to a local Supabase instance**

```bash
supabase db push
```

Expected: migration applied without error. Run `supabase db query --linked "select tablename from pg_tables where tablename = 'allowed_users'"` and verify one row returns.

- [ ] **Step 3: Verify the trigger on a sample insert**

In Supabase Studio (or via `supabase db query --linked`):

```sql
-- Insert a synthetic auth user
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values (
  gen_random_uuid(),
  'TestUser@Example.COM',
  '{"full_name": "Test User", "avatar_url": "https://example.com/a.png"}'::jsonb,
  '{"provider": "google"}'::jsonb
);

-- Verify the row landed lowercase, pending, with name+avatar
select email, status, name, avatar_url, source from public.allowed_users
where email = 'testuser@example.com';
```

Expected: one row with `status='pending'`, `name='Test User'`, `source='google'`, email lowercase.

- [ ] **Step 4: Verify the RPC**

```sql
select * from public.get_access_status('TESTUSER@example.com');
```

Expected: one row, `status='pending'` (case-insensitive match works).

- [ ] **Step 5: Clean up the synthetic insert**

```sql
delete from auth.users where email = 'TestUser@Example.COM';
-- The allowed_users row stays (FK is on delete set null, not cascade — intentional;
-- denials should persist even if the user is deleted). Clean it manually:
delete from public.allowed_users where email = 'testuser@example.com';
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260520000000_allowed_users.sql
git commit -m "feat(auth): add allowed_users table with trigger + RPC"
```

---

## Task 2: Seed migration for existing testers

**Files:**
- Create: `supabase/migrations/20260520000001_allowed_users_seed.sql`

The seed inserts the 8 emails currently in `ALLOWED_EMAILS` as `status='approved'`. `on conflict do nothing` makes it re-runnable.

- [ ] **Step 1: Write the seed migration**

```sql
-- supabase/migrations/20260520000001_allowed_users_seed.sql
--
-- Seed the allowlist from the previous ALLOWED_EMAILS env var. After this
-- runs, existing testers continue to sign in (via magic-link or Google)
-- exactly as they did before, with middleware now consulting the DB
-- instead of the env var.
--
-- on conflict do nothing makes this safe to re-run if a tester's email
-- somehow lands in the table first (e.g. they sign in before this seed
-- migration runs in production). In that case the trigger-inserted
-- pending row stays — the admin will need to approve via the admin page.

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

- [ ] **Step 2: Apply and verify**

```bash
supabase db push
```

Verify:

```bash
supabase db query --linked "select count(*) from public.allowed_users where status='approved'"
```

Expected: `count = 8`.

- [ ] **Step 3: Verify re-running is idempotent**

```bash
supabase db query --linked "$(cat supabase/migrations/20260520000001_allowed_users_seed.sql)"
supabase db query --linked "select count(*) from public.allowed_users"
```

Expected: still `8`. No errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260520000001_allowed_users_seed.sql
git commit -m "feat(auth): seed allowed_users with existing testers"
```

---

## Task 3: Middleware cutover from env var to RPC

**Files:**
- Modify: `middleware.ts`
- Modify: `__tests__/middleware.test.ts`

Replace the `ALLOWED_EMAILS` parsing block with a call to `get_access_status` RPC. Add `/pending-approval` to `PUBLIC_PREFIXES`.

- [ ] **Step 1: Add the failing test cases**

Append to `__tests__/middleware.test.ts` inside the existing `describe('middleware', ...)` block:

```ts
// Helpers to mock the get_access_status RPC alongside getUser
const mockRpc = vi.fn()

function makeSupabaseClientWithRpc() {
  return {
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  } as unknown as ReturnType<typeof createServerClient>
}

describe('middleware allowlist (DB-backed)', () => {
  beforeEach(() => {
    vi.mocked(createServerClient).mockReturnValue(makeSupabaseClientWithRpc())
    delete process.env.ALLOWED_EMAILS
  })

  it('lets approved users through', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'ok@example.com' } } })
    mockRpc.mockResolvedValueOnce({ data: [{ status: 'approved' }], error: null })

    const res = await middleware(makeRequest('/'))

    expect(mockRpc).toHaveBeenCalledWith('get_access_status', { email_in: 'ok@example.com' })
    expect(res.status).toBe(200)
  })

  it('redirects pending users to /pending-approval', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'p@example.com' } } })
    mockRpc.mockResolvedValueOnce({ data: [{ status: 'pending' }], error: null })

    const res = await middleware(makeRequest('/'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/pending-approval')
  })

  it('redirects denied users to /access-denied', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'd@example.com' } } })
    mockRpc.mockResolvedValueOnce({ data: [{ status: 'denied' }], error: null })

    const res = await middleware(makeRequest('/'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/access-denied')
  })

  it('redirects users with no row to /pending-approval (defensive)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'new@example.com' } } })
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const res = await middleware(makeRequest('/'))

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/pending-approval')
  })

  it('lowercases the email before calling the RPC', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'MixedCase@Example.COM' } } })
    mockRpc.mockResolvedValueOnce({ data: [{ status: 'approved' }], error: null })

    await middleware(makeRequest('/'))

    expect(mockRpc).toHaveBeenCalledWith('get_access_status', { email_in: 'mixedcase@example.com' })
  })

  it('passes /pending-approval through without calling getUser', async () => {
    const res = await middleware(makeRequest('/pending-approval'))
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
})
```

Also remove or update the old `'redirects authenticated users with unlisted email to /access-denied'` test — it relied on `ALLOWED_EMAILS` parsing which is gone. Replace its expectation to use the DB-denied path (the new test above already covers it). Same for `'allows through authenticated users with a listed email'` — replaced by the new approved test.

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- __tests__/middleware.test.ts
```

Expected: the new tests FAIL because the RPC path isn't implemented yet.

- [ ] **Step 3: Update `middleware.ts`**

Replace the `ALLOWED_EMAILS` block (currently lines 96–103) with the RPC call. Add `/pending-approval` to `PUBLIC_PREFIXES`.

```ts
// At the top, update PUBLIC_PREFIXES:
const PUBLIC_PREFIXES = ['/login', '/auth', '/access-denied', '/pending-approval', '/api/webhooks']

// Inside middleware(), AFTER the existing `if (!user) { ... redirectResponse }`
// block and BEFORE the `// Capture any Set-Cookie headers ...` line, REPLACE
// the env-var check with:

const email = user.email?.toLowerCase()
if (!email) {
  // No email on the auth.users record — shouldn't happen with Google or
  // magic-link, but defensive. Treat as denied so the user lands somewhere
  // with recourse copy rather than a silent loop.
  return NextResponse.redirect(new URL('/access-denied', request.url))
}

const { data: statusRows, error: rpcError } = await supabase.rpc('get_access_status', {
  email_in: email,
})

if (rpcError) {
  log.error('middleware: get_access_status failed', { email, error: rpcError.message })
  // Fail closed — if we can't determine status, don't risk granting access.
  return NextResponse.redirect(new URL('/access-denied', request.url))
}

const status = statusRows?.[0]?.status ?? null

if (status === 'denied') {
  return NextResponse.redirect(new URL('/access-denied', request.url))
}
if (status !== 'approved') {
  // pending OR no row at all (trigger may not have run yet in a race) →
  // patient waiting room, not a hard denial.
  return NextResponse.redirect(new URL('/pending-approval', request.url))
}

// status === 'approved' → fall through to the existing identity-header
// forwarding block below.
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- __tests__/middleware.test.ts
```

Expected: all tests PASS, including the existing public-prefix and identity-header tests.

- [ ] **Step 5: Run the full lint pass to catch any stale ALLOWED_EMAILS references**

```bash
npm run lint
```

Expected: no errors. (If `ALLOWED_EMAILS` is referenced elsewhere, sweep it.)

- [ ] **Step 6: Commit**

```bash
git add middleware.ts __tests__/middleware.test.ts
git commit -m "feat(auth): middleware reads allowlist from allowed_users RPC"
```

---

## Task 4: Extend `lib/push.ts` with `sendAdminPush`

**Files:**
- Modify: `lib/push.ts`
- Modify: `__tests__/lib/push.test.ts`

Add a second exported helper for admin-targeted notifications. Refactor minimally — keep the existing `sendPushNotification` signature untouched so callers don't churn.

- [ ] **Step 1: Add the failing test**

Append to `__tests__/lib/push.test.ts`:

```ts
import { sendAdminPush } from '@/lib/push'

describe('sendAdminPush', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pubkey'
    process.env.VAPID_PRIVATE_KEY = 'privkey'
    process.env.VAPID_CONTACT = 'mailto:test@example.com'
  })

  it('returns early when no subscription row exists', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)

    await sendAdminPush({ title: 'New access request', body: 'a@b.com', url: '/admin' })

    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('sends with the correct payload including url', async () => {
    const sub = { endpoint: 'https://fcm.example', p256dh: 'abc', auth: 'def' }
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: sub, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as any)

    await sendAdminPush({
      title: 'New access request',
      body: 'luciano@example.com signed in via Google. Tap to review.',
      url: '/admin',
    })

    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://fcm.example', keys: { p256dh: 'abc', auth: 'def' } },
      JSON.stringify({
        title: 'New access request',
        body: 'luciano@example.com signed in via Google. Tap to review.',
        url: '/admin',
      }),
    )
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- __tests__/lib/push.test.ts
```

Expected: FAIL — `sendAdminPush` is not exported.

- [ ] **Step 3: Implement `sendAdminPush` in `lib/push.ts`**

Refactor `lib/push.ts` to extract the subscription lookup into a private helper, then add `sendAdminPush`:

```ts
import webpush from 'web-push'
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

// Existing session-ready notification. Signature unchanged.
export async function sendPushNotification(sessionId: string, title: string): Promise<void> {
  await sendToOwnerDevice({
    title,
    body: 'Your session is ready to review.',
    sessionId,
  })
}

// New admin-targeted notification. The url overrides the default
// /sessions/[id] route in the service worker — see public/sw.js.
export async function sendAdminPush(args: {
  title: string
  body: string
  url: string
}): Promise<void> {
  await sendToOwnerDevice(args)
}

// Single source of truth for "deliver to the owner's device". For now
// push_subscriptions is a single-row table keyed on id=1 — that single
// row happens to be the owner's device subscription. When push goes
// per-user, this helper will look up the owner explicitly via
// NEXT_PUBLIC_OWNER_EMAIL.
async function sendToOwnerDevice(payload: Record<string, unknown>): Promise<void> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidContact = process.env.VAPID_CONTACT
  if (!vapidPublicKey || !vapidPrivateKey || !vapidContact) {
    log.error('VAPID config not set — skipping push notification', { payload })
    return
  }

  webpush.setVapidDetails(vapidContact, vapidPublicKey, vapidPrivateKey)

  const db = createServerClient()
  const { data: sub } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('id', 1)
    .single()

  if (!sub) return

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    )
    log.info('Push notification sent', { payload })
  } catch (err) {
    log.error('Push notification failed', { payload, error: err })
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- __tests__/lib/push.test.ts
```

Expected: all tests PASS (existing `sendPushNotification` tests + new `sendAdminPush` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/push.ts __tests__/lib/push.test.ts
git commit -m "feat(push): add sendAdminPush helper for admin notifications"
```

---

## Task 5: `/api/access-request/notify` endpoint

**Files:**
- Create: `app/api/access-request/notify/route.ts`
- Create: `__tests__/api/access-request-notify.test.ts`

POST endpoint that the auth callback page calls after a fresh sign-in. If the email's row is `pending` AND `requested_at` is within the last 60 seconds, fire `sendAdminPush`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/access-request-notify.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/push', () => ({ sendAdminPush: vi.fn() }))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { createServerClient } from '@/lib/supabase-server'
import { sendAdminPush } from '@/lib/push'
import { POST } from '@/app/api/access-request/notify/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/access-request/notify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function mockSingleResult(data: any) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
  }
}

describe('POST /api/access-request/notify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fires sendAdminPush when the row is pending and fresh', async () => {
    vi.mocked(createServerClient).mockReturnValue(
      mockSingleResult({
        email: 'new@example.com',
        status: 'pending',
        requested_at: new Date().toISOString(),
        source: 'google',
      }) as any,
    )
    const res = await POST(makeRequest({ email: 'new@example.com' }))
    expect(res.status).toBe(204)
    expect(sendAdminPush).toHaveBeenCalledWith(expect.objectContaining({
      title: 'New access request',
      body: expect.stringContaining('new@example.com'),
      url: '/admin',
    }))
  })

  it('does not push when the row is older than the freshness window', async () => {
    vi.mocked(createServerClient).mockReturnValue(
      mockSingleResult({
        email: 'old@example.com',
        status: 'pending',
        requested_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        source: 'google',
      }) as any,
    )
    const res = await POST(makeRequest({ email: 'old@example.com' }))
    expect(res.status).toBe(204)
    expect(sendAdminPush).not.toHaveBeenCalled()
  })

  it('does not push when the row is approved', async () => {
    vi.mocked(createServerClient).mockReturnValue(
      mockSingleResult({
        email: 'ok@example.com',
        status: 'approved',
        requested_at: new Date().toISOString(),
        source: 'google',
      }) as any,
    )
    const res = await POST(makeRequest({ email: 'ok@example.com' }))
    expect(res.status).toBe(204)
    expect(sendAdminPush).not.toHaveBeenCalled()
  })

  it('returns 204 (not 404) when no row exists, without pushing', async () => {
    vi.mocked(createServerClient).mockReturnValue(mockSingleResult(null) as any)
    const res = await POST(makeRequest({ email: 'unknown@example.com' }))
    expect(res.status).toBe(204)
    expect(sendAdminPush).not.toHaveBeenCalled()
  })

  it('rejects requests with a missing or invalid email body', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    expect(sendAdminPush).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- __tests__/api/access-request-notify.test.ts
```

Expected: FAIL — route file does not exist.

- [ ] **Step 3: Implement the route**

```ts
// app/api/access-request/notify/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sendAdminPush } from '@/lib/push'
import { log } from '@/lib/logger'

// How recently must `requested_at` be for us to consider this a fresh
// signup worth notifying about? Sixty seconds covers a slow Google OAuth
// redirect plus a sluggish callback page round-trip without ever firing
// twice for the same sign-in (each session-establishment fires once).
const FRESHNESS_MS = 60_000

export async function POST(req: Request): Promise<Response> {
  let payload: { email?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  if (!email) {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  // Always return 204 to the caller — we never want this endpoint to
  // leak whether a particular email is pending, approved, or unknown.
  // Logging is server-side only.
  const db = createServerClient()
  const { data: row } = await db
    .from('allowed_users')
    .select('email, status, requested_at, source')
    .eq('email', email)
    .maybeSingle()

  if (!row || row.status !== 'pending') {
    return new NextResponse(null, { status: 204 })
  }

  const requestedAt = new Date(row.requested_at).getTime()
  if (Number.isNaN(requestedAt) || Date.now() - requestedAt > FRESHNESS_MS) {
    // Pending but stale — the user has signed in again while waiting.
    // Don't re-spam the owner.
    return new NextResponse(null, { status: 204 })
  }

  const sourceLabel = row.source === 'google' ? 'Google' : 'email link'
  try {
    await sendAdminPush({
      title: 'New access request',
      body: `${row.email} signed in via ${sourceLabel}. Tap to review.`,
      url: '/admin',
    })
  } catch (err) {
    log.error('access-request notify: push failed', { email: row.email, error: err })
  }

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- __tests__/api/access-request-notify.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/access-request/notify/route.ts __tests__/api/access-request-notify.test.ts
git commit -m "feat(auth): /api/access-request/notify fires push on fresh pending"
```

---

## Task 6: Auth callback fires notify

**Files:**
- Modify: `app/auth/callback/page.tsx`

Inside the existing `SIGNED_IN` handler, fire-and-forget a POST to `/api/access-request/notify` with the user's email. The endpoint itself handles the "is this worth notifying" decision — the callback only knows "user just signed in".

- [ ] **Step 1: Update `app/auth/callback/page.tsx`**

Find the `redirect` function inside `AuthCallbackContent` (around line 45–53 of the current file). Update it to fire the notify call before navigating:

```ts
function redirect(session: { user: { email?: string | null; user_metadata?: { target_language?: string } } }) {
  if (handled.current) return
  handled.current = true

  // Fire-and-forget the admin notification. The endpoint debounces stale
  // pending rows and silently no-ops for approved users — we don't need
  // to know which case this is from the callback.
  const email = session.user.email
  if (email) {
    fetch('/api/access-request/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
      keepalive: true,
    }).catch(() => {
      // Network failure here is a notification miss, not a sign-in miss.
      // The user still completes auth; the owner just doesn't get pinged.
    })
  }

  const targetLanguage = session.user.user_metadata?.target_language
  router.refresh()
  router.replace(targetLanguage ? '/' : '/onboarding')
}
```

- [ ] **Step 2: Verify the page still type-checks**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test (deferred to integration phase)**

This wiring will be exercised end-to-end in the manual checklist in Task 16. No automated test here — the existing callback page is a client component that depends on Supabase's `detectSessionInUrl` event firing, which is awkward to simulate in Vitest. The endpoint it calls is independently tested.

- [ ] **Step 4: Commit**

```bash
git add app/auth/callback/page.tsx
git commit -m "feat(auth): callback notifies admin endpoint after SIGNED_IN"
```

---

## Task 7: Service worker URL generalisation

**Files:**
- Modify: `public/sw.js`

The current service worker assumes every push notification corresponds to a session — clicking opens `/sessions/[id]`. Generalise: if `payload.url` is set, use that; otherwise fall back to the session pattern.

- [ ] **Step 1: Inspect current `notificationclick` handler**

Read `public/sw.js` first to confirm the current structure. The relevant handler typically looks like:

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const sessionId = event.notification.data?.sessionId
  event.waitUntil(clients.openWindow(`/sessions/${sessionId}`))
})
```

- [ ] **Step 2: Generalise the click handler**

Update the handler so `payload.url` takes precedence:

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data ?? {}
  // Prefer an explicit url (set by sendAdminPush). Fall back to the
  // session pattern for legacy session-ready notifications, which only
  // set sessionId.
  const url = data.url ?? (data.sessionId ? `/sessions/${data.sessionId}` : '/')
  event.waitUntil(clients.openWindow(url))
})
```

Also update the `push` handler if it currently reads `data.sessionId` to set `notification.data` — ensure it forwards the entire parsed payload as `data` so `url` is available on click:

```js
self.addEventListener('push', (event) => {
  if (!event.data) return
  const payload = event.data.json()
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Conversation Coach', {
      body: payload.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: payload, // forward the full payload so notificationclick can read url
    }),
  )
})
```

- [ ] **Step 3: Verify it still parses (no lint for sw.js — check by hand)**

Open the file, eyeball that the JSON.parse / data.url paths read correctly. There are no Vitest tests for `sw.js` in this repo.

- [ ] **Step 4: Commit**

```bash
git add public/sw.js
git commit -m "feat(push): service worker reads url from payload for admin notifications"
```

---

## Task 8: i18n keys

**Files:**
- Modify: `lib/i18n.ts`

Add the new translation keys for login, pending-approval, and admin. Both `en` and `es` blocks.

- [ ] **Step 1: Add keys to the `en` block in `TRANSLATIONS`**

Find the `auth.` section in `lib/i18n.ts` (search for `'auth.invitedNote'`). Update / add:

```ts
// Inside TRANSLATIONS.en:
'auth.signInTitle': 'Sign in',
'auth.welcomeBack': 'Welcome back',
'auth.continueWithGoogle': 'Continue with Google',
'auth.orUseEmail': 'or use email',
// Update existing invitedNote — old "invited testers" framing is gone:
'auth.requestAccessNote':
  "New here? Sign in with Google or your email and I'll review your request within a day.",

// Pending-approval screen:
'pending.title': 'Your access request is in',
'pending.body':
  "I review new sign-ups personally — usually within a day. You'll get an email with a one-click sign-in link the moment you're approved. No need to come back here.",
'pending.requestedAs': 'Requested as',
'pending.signOut': 'Sign out',

// Admin page:
'admin.eyebrow': 'Settings · Admin',
'admin.title': 'Access requests',
'admin.pending': 'Pending',
'admin.approved': 'Approved',
'admin.denied': 'Denied',
'admin.approve': 'Approve',
'admin.deny': 'Deny',
'admin.viaGoogle': 'Google',
'admin.viaEmail': 'Email link',
'admin.viaSeed': 'Seeded',
'admin.requestedAgo': 'Requested {time}',
'admin.nameUnknown': 'No name yet',
'admin.emptyDenied':
  'No one has been denied. Deny is reversible — flip back to approved any time.',
'admin.testers': '{n} testers',
'admin.justNow': 'just now',
'admin.seeded': 'seeded',
'admin.approveError': 'Could not approve. Try again.',
'admin.denyError': 'Could not deny. Try again.',
```

Find the old `'auth.invitedNote'` key and **remove it** (replaced by `auth.requestAccessNote`).

- [ ] **Step 2: Add equivalent keys to the `es` block**

```ts
// Inside TRANSLATIONS.es:
'auth.signInTitle': 'Iniciar sesión',
'auth.welcomeBack': 'Hola de nuevo',
'auth.continueWithGoogle': 'Continuar con Google',
'auth.orUseEmail': 'o usá tu email',
'auth.requestAccessNote':
  '¿Primera vez por acá? Iniciá sesión con Google o con tu email y reviso tu solicitud en menos de un día.',

'pending.title': 'Tu solicitud está en revisión',
'pending.body':
  'Reviso las solicitudes personalmente — normalmente dentro del día. Vas a recibir un email con un link de un solo clic apenas te apruebe. No hace falta que vuelvas a esta pantalla.',
'pending.requestedAs': 'Solicitado como',
'pending.signOut': 'Cerrar sesión',

'admin.eyebrow': 'Configuración · Admin',
'admin.title': 'Solicitudes de acceso',
'admin.pending': 'Pendientes',
'admin.approved': 'Aprobadas',
'admin.denied': 'Denegadas',
'admin.approve': 'Aprobar',
'admin.deny': 'Denegar',
'admin.viaGoogle': 'Google',
'admin.viaEmail': 'Link por email',
'admin.viaSeed': 'Pre-aprobado',
'admin.requestedAgo': 'Solicitado {time}',
'admin.nameUnknown': 'Sin nombre todavía',
'admin.emptyDenied':
  'Nadie fue denegado. Denegar es reversible — podés volver a aprobar cuando quieras.',
'admin.testers': '{n} testers',
'admin.justNow': 'recién',
'admin.seeded': 'pre-aprobado',
'admin.approveError': 'No se pudo aprobar. Intentá de nuevo.',
'admin.denyError': 'No se pudo denegar. Intentá de nuevo.',
```

- [ ] **Step 3: Update any test that referenced the old `auth.invitedNote` key**

```bash
rg -l 'auth.invitedNote' __tests__/
```

If any matches: update those tests to assert on `auth.requestAccessNote` instead.

- [ ] **Step 4: Verify nothing else breaks**

```bash
npm run lint && npm test -- __tests__/lib/i18n.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.ts __tests__
git commit -m "feat(i18n): add login + pending + admin translation keys"
```

---

## Task 9: Login page Google CTA

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `__tests__/pages/LoginPage.test.tsx`

Add a primary "Continue with Google" button above the existing flow. Update the H1 to switch between "Sign in" (first-time) and "Welcome back" (returning).

- [ ] **Step 1: Add the failing tests**

Append to `__tests__/pages/LoginPage.test.tsx`. First, extend the mock to include `signInWithOAuth`:

```ts
const signInWithOAuth = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signInWithOtp, signInWithOAuth },
  }),
}))
```

Then add tests:

```ts
describe('LoginPage — Google SSO', () => {
  beforeEach(() => {
    signInWithOAuth.mockClear()
    signInWithOtp.mockClear()
  })

  it('renders a Continue with Google primary CTA', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: 'auth.continueWithGoogle' })).toBeInTheDocument()
  })

  it('fires signInWithOAuth with provider google and correct redirect when clicked', async () => {
    render(<LoginPage />)
    await userEvent.click(screen.getByRole('button', { name: 'auth.continueWithGoogle' }))
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('renders an "or use email" divider between Google and the email form', () => {
    render(<LoginPage />)
    expect(screen.getByText('auth.orUseEmail')).toBeInTheDocument()
  })

  it('shows the Welcome back heading when a savedEmail is present in localStorage', () => {
    localStorage.setItem('cc:login-email', 'josh@example.com')
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: 'auth.welcomeBack' })).toBeInTheDocument()
    localStorage.removeItem('cc:login-email')
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- __tests__/pages/LoginPage.test.tsx
```

Expected: the new tests FAIL — `auth.continueWithGoogle` button is not present, `auth.welcomeBack` heading is not present.

- [ ] **Step 3: Update `app/login/page.tsx`**

Add the Google button + divider above the existing flow, and switch the H1 based on `savedEmail`.

Inside the component, after the existing `requestLink` function, add:

```ts
async function continueWithGoogle() {
  setLoading(true)
  setError(null)
  const { error: authError } = await getSupabaseBrowserClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (authError) {
    setLoading(false)
    setError(friendlyError(authError, t))
    return
  }
  // On success Supabase navigates the page away — no state to manage.
}
```

Update the H1 to use the savedEmail-aware key:

```tsx
<h1 className="font-display text-3xl font-medium text-text-primary">
  {savedEmail ? t('auth.welcomeBack') : t('auth.signInTitle')}
</h1>
```

In the form / quick-select branch, add the Google button + divider AT THE TOP of the auth stack (before the existing quick-select or email form). Both branches share this top block:

```tsx
{!sent && (
  <>
    <Button
      type="button"
      size="sm"
      fullWidth
      variant="primary"
      disabled={loading}
      onClick={continueWithGoogle}
      className="!bg-text-primary !border-text-primary hover:!bg-text-primary/90"
    >
      <GoogleGlyph className="w-4 h-4 mr-2" />
      {t('auth.continueWithGoogle')}
    </Button>

    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.08em] text-text-tertiary">
      <span aria-hidden className="h-px flex-1 bg-border-subtle" />
      <span>{t('auth.orUseEmail')}</span>
      <span aria-hidden className="h-px flex-1 bg-border-subtle" />
    </div>
  </>
)}
```

The dark-on-cream styling is achieved via `!bg-text-primary` overrides on the primary Button variant — this matches the mockup. If `buttonStyles` already supports a `variant="solid-dark"` or similar, prefer that over inline overrides; otherwise keep the className overrides minimal and document them.

Add a small inline `GoogleGlyph` component at the top of the file (the Google "G" multi-colour glyph from the mockup):

```tsx
function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#fff" d="M12 10.2v3.92h5.45c-.24 1.26-1.7 3.7-5.45 3.7a6.13 6.13 0 0 1 0-12.24c1.93 0 3.23.82 3.97 1.53l2.71-2.6A9.6 9.6 0 0 0 12 1.6 10.4 10.4 0 1 0 22.16 12c0-.7-.07-1.24-.16-1.78H12z"/>
    </svg>
  )
}
```

Update the `invitedNote` paragraph's translation key:

```tsx
<p className="text-sm text-text-secondary">
  {t('auth.requestAccessNote')}
</p>
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- __tests__/pages/LoginPage.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx __tests__/pages/LoginPage.test.tsx
git commit -m "feat(auth): add Continue with Google CTA to login"
```

---

## Task 10: `/pending-approval` page

**Files:**
- Create: `app/pending-approval/page.tsx`
- Create: `__tests__/pages/PendingApprovalPage.test.tsx`

A friendly client component for the waiting state. Reads the current user's email server-side via `getAuthenticatedUser()`.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/pages/PendingApprovalPage.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import PendingApprovalPage from '@/app/pending-approval/page'

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn().mockResolvedValue({
    id: 'u1',
    email: 'luciano.mateu@hotmail.com',
    targetLanguage: 'es-AR',
  }),
}))

vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('PendingApprovalPage', () => {
  it('renders the patient waiting copy', async () => {
    render(await PendingApprovalPage())
    expect(screen.getByRole('heading', { name: 'pending.title' })).toBeInTheDocument()
    expect(screen.getByText('pending.body')).toBeInTheDocument()
  })

  it('shows the requesting email', async () => {
    render(await PendingApprovalPage())
    expect(screen.getByText('luciano.mateu@hotmail.com')).toBeInTheDocument()
  })

  it('renders a sign out button', async () => {
    render(await PendingApprovalPage())
    expect(screen.getByRole('button', { name: 'pending.signOut' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- __tests__/pages/PendingApprovalPage.test.tsx
```

Expected: FAIL — file doesn't exist.

- [ ] **Step 3: Implement the page**

The page is an RSC for the data fetch, handing off to a small client component for the sign-out button (which calls `auth.signOut()` and routes to `/login`).

```tsx
// app/pending-approval/page.tsx
import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { PendingApprovalView } from './PendingApprovalView'

export default async function PendingApprovalPage() {
  const user = await getAuthenticatedUser()
  if (!user || !user.email) redirect('/login')
  return <PendingApprovalView email={user.email} />
}
```

```tsx
// app/pending-approval/PendingApprovalView.tsx
'use client'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useTranslation } from '@/components/LanguageProvider'
import { Button } from '@/components/Button'

export function PendingApprovalView({ email }: { email: string }) {
  const router = useRouter()
  const { t } = useTranslation()

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut()
    router.replace('/login')
  }

  return (
    <div className="flex flex-1 flex-col items-start justify-start px-6 py-10 max-w-md mx-auto w-full gap-6">
      {/* Amber pulsing ring — uses the oa-pulse keyframe vocabulary
          at a longer duration so it reads as patient, not insistent.
          Reduced-motion users see only the static hourglass icon. */}
      <div className="relative mt-4 inline-flex h-22 w-22 items-center justify-center rounded-full bg-pill-rank2-bg text-pill-rank2-text border border-border-subtle">
        <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" aria-hidden="true">
          <path d="M7 3h10M7 21h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M7 3v3.5a5 5 0 0 0 1.5 3.6L12 12l3.5 1.9a5 5 0 0 1 1.5 3.6V21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17 3v3.5a5 5 0 0 1-1.5 3.6L12 12l-3.5 1.9A5 5 0 0 0 7 17.5V21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="motion-safe:animate-[pending-pulse_3.2s_var(--ease-out-expo)_infinite] absolute -inset-2.5 rounded-full border border-pill-rank2-text/40" />
      </div>

      <h1 className="font-display text-2xl font-medium leading-tight tracking-tight text-text-primary">
        {t('pending.title')}
      </h1>
      <p className="text-base leading-relaxed text-text-secondary">
        {t('pending.body')}
      </p>

      <div className="w-full rounded-xl border border-border-subtle bg-surface p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-tertiary mb-1">
          {t('pending.requestedAs')}
        </div>
        <div className="text-base text-text-primary break-words">{email}</div>
      </div>

      <div className="mt-auto w-full pb-4">
        <Button variant="secondary" size="sm" fullWidth onClick={signOut}>
          {t('pending.signOut')}
        </Button>
      </div>
    </div>
  )
}
```

Add the `pending-pulse` keyframe to `app/globals.css` (in the existing `@layer base` block where other keyframes live):

```css
@keyframes pending-pulse {
  0%   { transform: scale(0.9); opacity: 0; }
  40%  { opacity: 0.6; }
  100% { transform: scale(1.18); opacity: 0; }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- __tests__/pages/PendingApprovalPage.test.tsx
```

Expected: tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/pending-approval/ app/globals.css __tests__/pages/PendingApprovalPage.test.tsx
git commit -m "feat(auth): /pending-approval waiting screen"
```

---

## Task 11: `loadAllowedUsers` loader

**Files:**
- Modify: `lib/loaders.ts`

Add a loader the admin RSC will call. Uses the service-role client.

- [ ] **Step 1: Add the loader**

Append to `lib/loaders.ts`:

```ts
import { createServerClient } from '@/lib/supabase-server'

export interface AllowedUserRow {
  email: string
  status: 'pending' | 'approved' | 'denied'
  name: string | null
  avatar_url: string | null
  source: string | null
  requested_at: string
  approved_at: string | null
}

/**
 * Loads every row in allowed_users for the admin page. Uses the service-
 * role client because RLS denies all reads from the public roles — direct
 * table access is intentionally locked down. The /admin route gates by
 * owner email server-side before calling this.
 */
export async function loadAllowedUsers(): Promise<AllowedUserRow[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from('allowed_users')
    .select('email, status, name, avatar_url, source, requested_at, approved_at')
    .order('status', { ascending: true })
    .order('requested_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as AllowedUserRow[]
}
```

- [ ] **Step 2: Verify the loader type-checks**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/loaders.ts
git commit -m "feat(loaders): add loadAllowedUsers for admin page"
```

---

## Task 12: Approve API route (with magic-link email)

**Files:**
- Create: `app/api/admin/access/[email]/approve/route.ts`
- Create: `__tests__/api/admin-access-approve.test.ts`

Server-side gated to the owner. Updates the row to `approved` and fires `signInWithOtp` so the user gets a one-click magic-link email.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/admin-access-approve.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn() } }))

import { getAuthenticatedUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { POST } from '@/app/api/admin/access/[email]/approve/route'

function makeRequest() {
  return new Request('http://localhost/api/admin/access/x/approve', { method: 'POST' })
}

const updateMock = vi.fn()
const otpMock = vi.fn()

function mockDb() {
  return {
    from: vi.fn(() => ({
      update: updateMock.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })),
    auth: { signInWithOtp: otpMock.mockResolvedValue({ data: null, error: null }) },
  }
}

describe('POST /api/admin/access/[email]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_OWNER_EMAIL = 'owner@example.com'
    process.env.APP_URL = 'https://app.example.com'
    vi.mocked(createServerClient).mockReturnValue(mockDb() as any)
  })

  it('returns 404 when caller is not the owner', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: 'u1', email: 'rando@example.com', targetLanguage: 'es-AR',
    })
    const res = await POST(makeRequest(), { params: { email: 'new%40example.com' } })
    expect(res.status).toBe(404)
  })

  it('updates the row and sends the magic-link email when caller is owner', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: 'u1', email: 'owner@example.com', targetLanguage: 'es-AR',
    })

    const res = await POST(makeRequest(), { params: { email: 'new%40example.com' } })

    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', approved_by: 'owner@example.com' }),
    )
    expect(otpMock).toHaveBeenCalledWith({
      email: 'new@example.com',
      options: {
        emailRedirectTo: 'https://app.example.com/auth/callback',
        shouldCreateUser: false,
      },
    })
  })

  it('returns 200 even if the magic-link email fails (status flip still wins)', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: 'u1', email: 'owner@example.com', targetLanguage: 'es-AR',
    })
    otpMock.mockResolvedValueOnce({ data: null, error: { message: 'smtp down' } })

    const res = await POST(makeRequest(), { params: { email: 'new%40example.com' } })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.emailSent).toBe(false)
  })

  it('lowercases the email param', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: 'u1', email: 'owner@example.com', targetLanguage: 'es-AR',
    })

    await POST(makeRequest(), { params: { email: 'NewUser%40Example.COM' } })

    expect(otpMock).toHaveBeenCalledWith(expect.objectContaining({ email: 'newuser@example.com' }))
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- __tests__/api/admin-access-approve.test.ts
```

Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Implement the route**

```ts
// app/api/admin/access/[email]/approve/route.ts
import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

interface RouteContext {
  params: { email: string }
}

export async function POST(_req: Request, { params }: RouteContext): Promise<Response> {
  const caller = await getAuthenticatedUser()
  const ownerEmail = process.env.NEXT_PUBLIC_OWNER_EMAIL?.toLowerCase()
  if (!caller || !ownerEmail || caller.email?.toLowerCase() !== ownerEmail) {
    // 404, not 403 — non-owners shouldn't be able to detect this route exists.
    return new NextResponse(null, { status: 404 })
  }

  const targetEmail = decodeURIComponent(params.email).trim().toLowerCase()
  if (!targetEmail) {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  const db = createServerClient()

  // Flip status first. If the email row doesn't exist this is a no-op
  // and the magic-link send will fail — that's fine; the admin shouldn't
  // see emails on the page that aren't in the table.
  const { error: updateError } = await db
    .from('allowed_users')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: ownerEmail,
    })
    .eq('email', targetEmail)

  if (updateError) {
    log.error('admin approve: update failed', { email: targetEmail, error: updateError.message })
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }

  // Fire the magic-link email so the user has a one-click path back into
  // the app. shouldCreateUser:false — the user already exists in auth.users
  // (that's how they ended up pending in the first place).
  const appUrl = process.env.APP_URL ?? ''
  const { error: otpError } = await db.auth.signInWithOtp({
    email: targetEmail,
    options: {
      emailRedirectTo: `${appUrl}/auth/callback`,
      shouldCreateUser: false,
    },
  })

  if (otpError) {
    log.error('admin approve: signInWithOtp failed', { email: targetEmail, error: otpError.message })
    // Return 200 anyway — the user is approved in the DB. They can sign
    // back in via Google or by requesting a fresh magic-link from /login.
    return NextResponse.json({ ok: true, status: 'approved', emailSent: false })
  }

  return NextResponse.json({ ok: true, status: 'approved', emailSent: true })
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- __tests__/api/admin-access-approve.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/access/[email]/approve __tests__/api/admin-access-approve.test.ts
git commit -m "feat(admin): POST /api/admin/access/[email]/approve + magic-link send"
```

---

## Task 13: Deny API route

**Files:**
- Create: `app/api/admin/access/[email]/deny/route.ts`
- Create: `__tests__/api/admin-access-deny.test.ts`

Same shape as approve, but flips to `denied` and does NOT send an email.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/api/admin-access-deny.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn() } }))

import { getAuthenticatedUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { POST } from '@/app/api/admin/access/[email]/deny/route'

const updateMock = vi.fn()
const otpMock = vi.fn()

function mockDb() {
  return {
    from: vi.fn(() => ({
      update: updateMock.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    })),
    auth: { signInWithOtp: otpMock },
  }
}

describe('POST /api/admin/access/[email]/deny', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_OWNER_EMAIL = 'owner@example.com'
    vi.mocked(createServerClient).mockReturnValue(mockDb() as any)
  })

  it('returns 404 when caller is not the owner', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: 'u1', email: 'rando@example.com', targetLanguage: 'es-AR',
    })
    const res = await POST(
      new Request('http://localhost/x/deny', { method: 'POST' }),
      { params: { email: 'new%40example.com' } },
    )
    expect(res.status).toBe(404)
  })

  it('updates the row to denied when caller is owner', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: 'u1', email: 'owner@example.com', targetLanguage: 'es-AR',
    })

    const res = await POST(
      new Request('http://localhost/x/deny', { method: 'POST' }),
      { params: { email: 'new%40example.com' } },
    )

    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'denied' }),
    )
    // Critical: no email sent on deny.
    expect(otpMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- __tests__/api/admin-access-deny.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

```ts
// app/api/admin/access/[email]/deny/route.ts
import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

interface RouteContext {
  params: { email: string }
}

export async function POST(_req: Request, { params }: RouteContext): Promise<Response> {
  const caller = await getAuthenticatedUser()
  const ownerEmail = process.env.NEXT_PUBLIC_OWNER_EMAIL?.toLowerCase()
  if (!caller || !ownerEmail || caller.email?.toLowerCase() !== ownerEmail) {
    return new NextResponse(null, { status: 404 })
  }

  const targetEmail = decodeURIComponent(params.email).trim().toLowerCase()
  if (!targetEmail) {
    return NextResponse.json({ error: 'email required' }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db
    .from('allowed_users')
    .update({ status: 'denied' })
    .eq('email', targetEmail)

  if (error) {
    log.error('admin deny: update failed', { email: targetEmail, error: error.message })
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: 'denied' })
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- __tests__/api/admin-access-deny.test.ts
```

Expected: tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/access/[email]/deny __tests__/api/admin-access-deny.test.ts
git commit -m "feat(admin): POST /api/admin/access/[email]/deny"
```

---

## Task 14: Admin page (RSC + client island)

**Files:**
- Create: `app/admin/page.tsx`
- Create: `components/AdminClient.tsx`
- Create: `__tests__/pages/AdminPage.test.tsx`
- Create: `__tests__/components/AdminClient.test.tsx`

The RSC gates by owner email server-side and renders `AdminClient` with the pre-loaded data. `AdminClient` handles the optimistic approve/deny actions.

- [ ] **Step 1: Write the failing test for the RSC**

```tsx
// __tests__/pages/AdminPage.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const notFound = vi.fn()
vi.mock('next/navigation', () => ({ notFound: () => { notFound(); throw new Error('NEXT_NOT_FOUND') } }))
vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/loaders', () => ({ loadAllowedUsers: vi.fn() }))
vi.mock('@/components/AdminClient', () => ({
  AdminClient: ({ rows }: { rows: any[] }) => <div data-testid="admin-client">{rows.length} rows</div>,
}))

import { getAuthenticatedUser } from '@/lib/auth'
import { loadAllowedUsers } from '@/lib/loaders'
import AdminPage from '@/app/admin/page'

describe('AdminPage', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_OWNER_EMAIL = 'owner@example.com'
    notFound.mockReset()
  })

  it('returns notFound for non-owner', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: 'u1', email: 'rando@example.com', targetLanguage: 'es-AR',
    })
    await expect(AdminPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('renders AdminClient with rows when caller is owner', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      id: 'u1', email: 'owner@example.com', targetLanguage: 'es-AR',
    })
    vi.mocked(loadAllowedUsers).mockResolvedValueOnce([
      { email: 'a@b.com', status: 'pending', name: null, avatar_url: null, source: 'google', requested_at: new Date().toISOString(), approved_at: null },
    ] as any)
    render(await AdminPage())
    expect(screen.getByTestId('admin-client')).toHaveTextContent('1 rows')
  })
})
```

- [ ] **Step 2: Write the failing test for AdminClient**

```tsx
// __tests__/components/AdminClient.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminClient } from '@/components/AdminClient'

vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({ t: (key: string, r?: any) => r ? `${key}:${JSON.stringify(r)}` : key }),
}))

global.fetch = vi.fn()

const baseRow = {
  email: 'a@b.com',
  status: 'pending' as const,
  name: 'Test User',
  avatar_url: null,
  source: 'google',
  requested_at: new Date().toISOString(),
  approved_at: null,
}

describe('AdminClient', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset()
  })

  it('renders pending rows with approve and deny buttons', () => {
    render(<AdminClient rows={[baseRow]} />)
    expect(screen.getByText('a@b.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.deny' })).toBeInTheDocument()
  })

  it('calls the approve endpoint when Approve is clicked', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as any)
    render(<AdminClient rows={[baseRow]} />)
    await userEvent.click(screen.getByRole('button', { name: 'admin.approve' }))
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/access/a%40b.com/approve',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('calls the deny endpoint when Deny is clicked', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as any)
    render(<AdminClient rows={[baseRow]} />)
    await userEvent.click(screen.getByRole('button', { name: 'admin.deny' }))
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/access/a%40b.com/deny',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('removes the row from Pending optimistically on Approve', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) } as any)
    render(<AdminClient rows={[baseRow]} />)
    await userEvent.click(screen.getByRole('button', { name: 'admin.approve' }))
    expect(screen.queryByRole('button', { name: 'admin.approve' })).not.toBeInTheDocument()
  })

  it('reverts the optimistic update and shows an error on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'x' }) } as any)
    render(<AdminClient rows={[baseRow]} />)
    await userEvent.click(screen.getByRole('button', { name: 'admin.approve' }))
    // Row reappears
    expect(screen.getByRole('button', { name: 'admin.approve' })).toBeInTheDocument()
    expect(screen.getByText('admin.approveError')).toBeInTheDocument()
  })

  it('renders an empty Pending group when there are no pending rows', () => {
    const approvedRow = { ...baseRow, status: 'approved' as const, email: 'x@y.com' }
    render(<AdminClient rows={[approvedRow]} />)
    expect(screen.queryByRole('button', { name: 'admin.approve' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
npm test -- __tests__/pages/AdminPage.test.tsx __tests__/components/AdminClient.test.tsx
```

Expected: FAIL.

- [ ] **Step 4: Implement the RSC**

```tsx
// app/admin/page.tsx
import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadAllowedUsers } from '@/lib/loaders'
import { AdminClient } from '@/components/AdminClient'

export default async function AdminPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  const ownerEmail = process.env.NEXT_PUBLIC_OWNER_EMAIL?.toLowerCase()
  if (!ownerEmail || user.email?.toLowerCase() !== ownerEmail) {
    // Hide existence of /admin from non-owners.
    notFound()
  }
  const rows = await loadAllowedUsers()
  return <AdminClient rows={rows} />
}
```

- [ ] **Step 5: Implement AdminClient**

```tsx
// components/AdminClient.tsx
'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'
import { Button } from '@/components/Button'
import type { AllowedUserRow } from '@/lib/loaders'

function formatRelative(iso: string, justNow: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 60_000) return justNow
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

function initials(email: string, name: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/).slice(0, 2)
    return parts.map(p => p[0]!.toUpperCase()).join('')
  }
  return email.slice(0, 2).toUpperCase()
}

interface State {
  rows: AllowedUserRow[]
  errorFor: Record<string, string | null>
  inFlight: Set<string>
}

export function AdminClient({ rows: initial }: { rows: AllowedUserRow[] }) {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ rows: initial, errorFor: {}, inFlight: new Set() })

  const pending  = useMemo(() => state.rows.filter(r => r.status === 'pending'),  [state.rows])
  const approved = useMemo(() => state.rows.filter(r => r.status === 'approved'), [state.rows])
  const denied   = useMemo(() => state.rows.filter(r => r.status === 'denied'),   [state.rows])

  async function flipStatus(email: string, action: 'approve' | 'deny') {
    if (state.inFlight.has(email)) return
    const errorKey = action === 'approve' ? 'admin.approveError' : 'admin.denyError'
    const newStatus = action === 'approve' ? 'approved' : 'denied'

    // Snapshot for rollback
    const snapshot = state.rows
    setState(s => ({
      ...s,
      inFlight: new Set([...s.inFlight, email]),
      rows: s.rows.map(r => r.email === email ? { ...r, status: newStatus } : r),
      errorFor: { ...s.errorFor, [email]: null },
    }))

    try {
      const res = await fetch(
        `/api/admin/access/${encodeURIComponent(email)}/${action}`,
        { method: 'POST' },
      )
      if (!res.ok) throw new Error('non-ok')
    } catch {
      setState(s => ({
        ...s,
        rows: snapshot,
        errorFor: { ...s.errorFor, [email]: errorKey },
      }))
    } finally {
      setState(s => {
        const next = new Set(s.inFlight)
        next.delete(email)
        return { ...s, inFlight: next }
      })
    }
  }

  return (
    <div className="max-w-md mx-auto w-full px-5 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-text-tertiary">← {t('nav.back')}</Link>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary mb-1">
          {t('admin.eyebrow')}
        </div>
        <h1 className="font-display text-3xl font-medium tracking-tight text-text-primary">
          {t('admin.title')}
        </h1>
      </div>

      <Group label={t('admin.pending')} count={pending.length}>
        {pending.length === 0 ? null : (
          <div className="flex flex-col gap-2.5">
            {pending.map(row => (
              <RequestCard
                key={row.email}
                row={row}
                disabled={state.inFlight.has(row.email)}
                error={state.errorFor[row.email] ? t(state.errorFor[row.email]!) : null}
                onApprove={() => flipStatus(row.email, 'approve')}
                onDeny={() => flipStatus(row.email, 'deny')}
                providerLabel={t(row.source === 'google' ? 'admin.viaGoogle' : 'admin.viaEmail')}
                requestedLabel={t('admin.requestedAgo', { time: formatRelative(row.requested_at, t('admin.justNow')) })}
                approveLabel={t('admin.approve')}
                denyLabel={t('admin.deny')}
                nameUnknownLabel={t('admin.nameUnknown')}
              />
            ))}
          </div>
        )}
      </Group>

      <Group label={t('admin.approved')} count={approved.length}>
        <QuietList rows={approved} t={t} />
      </Group>

      <Group label={t('admin.denied')} count={denied.length}>
        {denied.length === 0
          ? <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-text-tertiary">{t('admin.emptyDenied')}</p>
          : <QuietList rows={denied} t={t} />}
      </Group>
    </div>
  )
}

function Group({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="font-display text-base font-medium text-text-primary">{label}</span>
        <span className="text-xs text-text-tertiary">{count}</span>
      </div>
      {children}
    </section>
  )
}

interface RequestCardProps {
  row: AllowedUserRow
  disabled: boolean
  error: string | null
  onApprove: () => void
  onDeny: () => void
  providerLabel: string
  requestedLabel: string
  approveLabel: string
  denyLabel: string
  nameUnknownLabel: string
}

function RequestCard(p: RequestCardProps) {
  const { row } = p
  return (
    <article className="rounded-2xl border border-chip-border/40 bg-surface px-4 py-3.5 flex flex-col gap-3">
      <header className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-chip-bg text-chip-text text-sm font-bold">
          {initials(row.email, row.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className={`text-base font-semibold leading-tight truncate ${row.name ? 'text-text-primary' : 'italic font-medium text-text-secondary'}`}>
            {row.name ?? p.nameUnknownLabel}
          </div>
          <div className="text-sm text-text-secondary truncate">{row.email}</div>
        </div>
        <span className="text-xs font-semibold tracking-wide text-text-tertiary bg-surface-elevated border border-border-subtle px-2 py-0.5 rounded-full">
          {p.providerLabel}
        </span>
      </header>
      <div className="text-xs text-text-tertiary">{p.requestedLabel}</div>
      {p.error && <p role="alert" className="text-xs text-on-error-surface">{p.error}</p>}
      <div className="flex gap-2">
        <Button onClick={p.onApprove} disabled={p.disabled} size="sm" fullWidth>
          {p.approveLabel}
        </Button>
        <Button onClick={p.onDeny} disabled={p.disabled} size="sm" variant="secondary">
          {p.denyLabel}
        </Button>
      </div>
    </article>
  )
}

function QuietList({ rows, t }: { rows: AllowedUserRow[]; t: (key: string, r?: any) => string }) {
  if (rows.length === 0) return null
  return (
    <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
      {rows.map(r => (
        <div key={r.email} className="flex items-center gap-2.5 px-4 py-3 border-b border-border-subtle last:border-b-0">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-chip-bg text-chip-text text-xs font-bold">
            {initials(r.email, r.name)}
          </span>
          <span className="flex-1 text-sm text-text-secondary truncate">{r.email}</span>
          <span className="text-xs text-text-tertiary whitespace-nowrap">
            {r.source === 'seed' ? t('admin.seeded') : (r.approved_at ? formatRelative(r.approved_at, t('admin.justNow')) : '')}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Run tests, verify they pass**

```bash
npm test -- __tests__/pages/AdminPage.test.tsx __tests__/components/AdminClient.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add app/admin __tests__/pages/AdminPage.test.tsx __tests__/components/AdminClient.test.tsx
git commit -m "feat(admin): /admin RSC + AdminClient with optimistic approve/deny"
```

---

## Task 15: Docs updates

**Files:**
- Modify: `.impeccable.md`
- Modify: `CLAUDE.md`
- Create: `docs/email-templates/magic-link.html`

Lock in the design-context notes and the AI-onboarding docs so future agents (and future you) have the right mental model.

- [ ] **Step 1: Update `.impeccable.md`**

Append to the "Decision log" section near line 90:

```markdown
- **Amber permits a "paused / waiting" use, narrowly:** the `/pending-approval` screen uses an amber pulsing ring + hourglass to signal that a fresh sign-up is queued. This is the only non-warning surface that uses amber, justified because pending IS the closest emotional register to a warning the design system has (red would mis-signal rejection; neutral would read as broken). Do not extend the borrow elsewhere.
```

Append to "Surface constraints":

```markdown
#### Admin (`/admin`)
- Owner-only, phone-first. Server-gated by `NEXT_PUBLIC_OWNER_EMAIL` via `notFound()` so non-owners can't even detect the route exists.
- Pending requests are the only load-bearing content. Approved and denied groups stay quiet — they're audit, not work.
- Approve is the only primary action; Deny is a quiet outline button. The Approve action triggers a magic-link email to the approved user — they get one click back into the app.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Find the existing "Key Design Decisions" section under the auth bullets. Replace the `Auth: Supabase Auth (email magic link)` bullet with:

```markdown
- **Auth**: Supabase Auth, two paths:
  - **Google SSO** (primary, via `signInWithOAuth({ provider: 'google' })`) — most testers use this.
  - **Email magic-link** (fallback, via `signInWithOtp`) — kept for users without Google.
  Both paths land at `/auth/callback`, where `detectSessionInUrl` handles the code exchange. `middleware.ts` guards all routes except `/login`, `/auth`, `/access-denied`, `/pending-approval`, `/api/webhooks`. The allowlist is in the DB (`allowed_users` table), not env vars — `ALLOWED_EMAILS` is deprecated and unread.
- **Allowlist gate** (`allowed_users` + `get_access_status` RPC): three states — `pending` | `approved` | `denied`. A Postgres trigger on `auth.users` INSERT auto-records every fresh sign-up as `pending` (unless the email is already approved, e.g. seeded). Middleware redirects `pending` → `/pending-approval`, `denied` → `/access-denied`, `approved` → through. The owner approves via `/admin`, which flips the status and fires `signInWithOtp` so the user gets a one-click magic-link email. New `pending` rows fire a Web Push to the owner's device (reusing the existing VAPID pipeline).
- **Owner identity**: `NEXT_PUBLIC_OWNER_EMAIL` is the single source of truth for "who is the admin". Used by `/access-denied`, `/admin`, and `lib/push.ts` (for the admin-targeted push helper).
- **`push_subscriptions` single-row model** still holds: `id=1` is the owner's device. `sendAdminPush(...)` assumes this. When push goes per-user, the helper must look up the owner's subscription explicitly via `NEXT_PUBLIC_OWNER_EMAIL`.
```

- [ ] **Step 3: Create `docs/email-templates/magic-link.html`**

The Supabase Magic Link template HTML (committed for tracking; applied via Dashboard during deploy). Build the template from the mockup design (mockup section 05). Skeleton:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Sign in to Conversation Coach</title>
  </head>
  <body style="margin:0;padding:24px;background:#f7f4ee;font-family:'Hanken Grotesk',system-ui,sans-serif;color:#1d1d2a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fdfcf8;border:1px solid #e6dfd0;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:32px 32px 8px;">
        <h2 style="font-family:'Source Serif 4',Georgia,serif;font-weight:500;font-size:26px;line-height:1.2;letter-spacing:-0.012em;margin:0 0 16px;color:#1d1d2a;">
          You're in
        </h2>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3a3a4a;">
          Your access request to Conversation Coach has been approved. Click below to sign in — no password, no second step.
        </p>
        <p style="margin:24px 0 8px;">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#6a4dd6;color:#fafaf7;font-weight:600;font-size:15px;text-decoration:none;padding:12px 22px;border-radius:10px;">
            Open Conversation Coach →
          </a>
        </p>
        <p style="margin:24px 0 0;font-size:12px;line-height:1.55;color:#7a7a8a;">
          The link is good for one hour. If it expires, head to the app and sign in with Google or request a new email link — your access is already in place.
        </p>
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #e6dfd0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7a7a8a;font-weight:600;">
        Conversation Coach
      </td></tr>
    </table>
  </body>
</html>
```

- [ ] **Step 4: Commit**

```bash
git add .impeccable.md CLAUDE.md docs/email-templates/magic-link.html
git commit -m "docs: lock in SSO + allowlist context and email template"
```

---

## Task 16: Supabase Dashboard config + manual checklist

**Files:**
- (No code changes — Dashboard config + end-to-end smoke test)

This task is a checklist for the human deploying the change. Run AFTER all code is merged but BEFORE removing `ALLOWED_EMAILS` from Vercel.

- [ ] **Step 1: Enable the Google provider in Supabase**

In the Supabase Dashboard → Authentication → Providers → Google:
1. Toggle "Enable Google provider" on.
2. Paste `Client ID` and `Client Secret` from a Google Cloud Console OAuth 2.0 credential.
3. Save.

In Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client:
1. Authorized JavaScript origins: add the production domain (`https://conversation-coach.app` or whatever it is) and `http://localhost:3000` for dev.
2. Authorized redirect URIs: add `https://<project-ref>.supabase.co/auth/v1/callback`.

- [ ] **Step 2: Update the Magic Link email template**

In the Supabase Dashboard → Authentication → Email Templates → "Magic Link":
1. Update the **Subject** to: `You're in — sign in to Conversation Coach`
2. Paste the HTML from `docs/email-templates/magic-link.html` into the body.
3. Save.

- [ ] **Step 3: Verify the existing env vars are present in production**

In Vercel → Project → Settings → Environment Variables, confirm these are set:
- `NEXT_PUBLIC_OWNER_EMAIL` — your address. Used to gate `/admin`.
- `APP_URL` — public URL, used for `emailRedirectTo` in the approve route's `signInWithOtp` call.
- VAPID keys (already there for existing push notifications).

`ALLOWED_EMAILS` is no longer read by code, but **keep it for one week** as a rollback safety net.

- [ ] **Step 4: End-to-end smoke test on production**

Run through this checklist on the deployed environment:

1. Sign in with an existing magic-link email (one of the 8 seeded testers). Expect: lands in the app, no behaviour change.
2. Sign out. Sign in with a brand-new Google account (use a test account, not your owner). Expect:
   - Lands on `/pending-approval` with the patient copy and the email shown.
   - Within a few seconds, your owner phone receives a "New access request" push notification.
3. Tap the push notification. Expect: opens `/admin`, the new request is at the top of Pending.
4. Tap **Approve** on the row. Expect:
   - Row crosses out of Pending into Approved.
   - The test Google account receives a magic-link email with the new subject + on-brand HTML.
5. Click the magic link in the email. Expect: drops straight into the app, signed in as the test account.
6. Sign out of the test account. Sign back in via the Google button. Expect: bypasses pending and lands in the app (the row is now `approved`).
7. From the owner account, go to `/admin`, find the test account row, tap **Deny**. Expect: row moves to Denied. Sign out, sign back in as the test account. Expect: `/access-denied`.
8. Sign back in as the owner. Re-approve the test account from `/admin` → Denied → Approve. Expect: status flips back; email is sent again.

If all 8 steps pass, the deploy is verified.

- [ ] **Step 5: After 1 week of clean operation — remove the legacy env var**

In Vercel → Settings → Environment Variables → delete `ALLOWED_EMAILS`. Trigger a redeploy.

---

## Self-Review Notes

This plan was self-reviewed against the spec immediately after writing. Coverage summary:

- Spec sections 1–2 (overview, architecture) → Tasks 1–14 implement the architecture end-to-end.
- Spec section 3 (data model) → Tasks 1, 2.
- Spec section 4 (middleware) → Task 3.
- Spec section 5 (login page) → Tasks 8, 9.
- Spec section 6 (pending screen) → Tasks 8, 10.
- Spec section 7 (admin page) → Tasks 11, 12, 13, 14.
- Spec section 8 (push) → Tasks 4, 5, 6, 7.
- Spec section 9 (approval email) → Task 12 (the `signInWithOtp` call) + Task 16 (template config).
- Spec section 10 (migration + rollout) → Tasks 1, 2 (migrations) + Task 16 (verify + cleanup).
- Spec section 11 (testing) → tests embedded in each task; manual checklist in Task 16.
- Spec section 12 (copy + i18n) → Task 8.
- Spec section 13 (`.impeccable.md`) → Task 15.
- Spec section 14 (`CLAUDE.md`) → Task 15.
- Spec section 15 (open questions / future) → noted in `CLAUDE.md` updates; no code task.
