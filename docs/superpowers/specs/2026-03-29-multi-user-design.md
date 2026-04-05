# Multi-User Support Design

**Date:** 2026-03-29
**Status:** Approved

## Overview

Add Google OAuth sign-in, per-user data isolation, and a second target language (English, New Zealand) alongside the existing Spanish (Rioplatense). A fixed email allowlist gates access to invited friends only.

---

## 1. Auth Flow

**Sign-in:** A `/login` page with a single "Sign in with Google" button. Supabase Auth handles the OAuth redirect and callback via its built-in `/auth/callback` route — no custom callback needed.

**Middleware** (`middleware.ts` at the project root) runs on every non-auth request:
1. Check for a valid Supabase session cookie
2. If missing → redirect to `/login`
3. If present but email not in `ALLOWED_EMAILS` → redirect to `/access-denied`
4. Otherwise → pass through

`ALLOWED_EMAILS` is a comma-separated environment variable (e.g. `you@gmail.com,friend@gmail.com`). If missing or empty, middleware blocks everyone (fail closed).

**Sign-out:** A button in Settings calls `supabase.auth.signOut()` and redirects to `/login`.

**Supabase client migration:** Replace `lib/supabase-server.ts` and `lib/supabase-browser.ts` with `@supabase/ssr` cookie-aware clients. The server client reads the user session from the request cookie so API routes can get `user.id` without trusting client-supplied values.

---

## 2. Data Model

### Schema changes

Add `user_id` to `sessions` only:

```sql
alter table sessions
  add column user_id uuid references auth.users(id) on delete cascade;
```

Child tables (`transcript_segments`, `annotations`, `practice_items`) do not get `user_id` — they are always accessed via `session_id`, which is already user-scoped.

### RLS

RLS is enabled on `sessions` with a single policy: `auth.uid() = user_id` (see migration plan below for timing). API routes use the service-role client (bypasses RLS) and manually `.eq('user_id', userId)` every query — RLS is a backstop for direct DB access, not the primary enforcement layer.

### Language preference

Stored in Supabase Auth user metadata: `user_metadata.target_language`. Valid values: `es-AR` | `en-NZ`. Updated via `supabase.auth.updateUser({ data: { target_language: 'en-NZ' } })`. No extra DB table needed.

If `target_language` is missing or invalid, default to `es-AR` to preserve existing behaviour.

### Migration plan

Three steps, run in order:

1. **Migration file** — adds `user_id` column as nullable. Does not enable RLS yet (existing rows have `NULL` user_id; enabling RLS before backfill would block all of them).
2. **One-time backfill** — after deploying and signing in for the first time, run in the Supabase dashboard:
   ```sql
   update sessions set user_id = '<your-auth-uuid>' where user_id is null;
   ```
3. **Second migration file** — sets `NOT NULL`, enables RLS, and creates the policy:
   ```sql
   alter table sessions alter column user_id set not null;
   alter table sessions enable row level security;
   create policy "Users see own sessions" on sessions for all using (auth.uid() = user_id);
   ```

---

## 3. Language System

### Types

In `lib/types.ts`:

```ts
export type TargetLanguage = 'es-AR' | 'en-NZ'

export const TARGET_LANGUAGES: Record<TargetLanguage, string> = {
  'es-AR': 'Spanish (Rioplatense)',
  'en-NZ': 'English (New Zealand)',
}
```

### Prompts

`lib/claude.ts` defines two system prompt constants:
- `SYSTEM_PROMPT_ES_AR` — the existing Rioplatense prompt, unchanged
- `SYSTEM_PROMPT_EN_NZ` — new prompt targeting NZ English: NZ idioms, spelling conventions (colour, organise), natural NZ register, same annotation schema

`analyseUserTurns` gains a `targetLanguage: TargetLanguage` parameter and selects the appropriate prompt. The existing JSON schema, sub-categories, and validation pipeline are unchanged — they apply equally to English.

### Pipeline threading

`runClaudeAnalysis(sessionId, targetLanguage)` receives `targetLanguage` from the calling API route, which extracts it from the authenticated user's metadata.

### Language selection UI

A `<select>` dropdown in the Settings page, populated from `TARGET_LANGUAGES`. Changing it calls `supabase.auth.updateUser` immediately (no save button needed). Applies to all future sessions for that user.

---

## 4. API Routes & UI Changes

### API routes

Every route touching `sessions`:
1. Calls `getUser()` via the `@supabase/ssr` server client to extract the authenticated user from the request cookie
2. Returns `401` if session is missing or invalid
3. Adds `.eq('user_id', user.id)` to all `sessions` queries
4. Sets `user_id: user.id` on `INSERT`

**Exception:** `POST /api/webhooks/assemblyai` — called by AssemblyAI, unauthenticated by design. No user context. No changes needed.

### New pages

| Route | Purpose |
|---|---|
| `/login` | "Sign in with Google" button. No nav bar. No auth required. |
| `/access-denied` | Shown when email not in allowlist. Displays email address, "Sign out" link. |

### Updated pages

**Settings:** Add language dropdown and "Sign out" button alongside existing font-size preference.

**`BottomNav`:** No changes — purely presentational.

### No per-session language field

Language is a user-level preference, not a per-session field. All of a user's sessions use their language setting at the time of analysis. This keeps the schema clean.

---

## 5. Error Handling

| Scenario | Behaviour |
|---|---|
| Unauthenticated request | Middleware redirects to `/login` |
| Email not in allowlist | Middleware redirects to `/access-denied` |
| `ALLOWED_EMAILS` missing/empty | Middleware blocks all users (fail closed), logs a warning |
| `target_language` missing/invalid in metadata | Defaults to `es-AR` |
| API route — invalid session cookie | `getUser()` returns `null` → 401 response |
| EN-NZ prompt returns unexpected JSON | Same validation pipeline as ES-AR; fails with `error` status on the session |

---

## 6. Testing

- **Middleware unit tests** — valid email passes, unknown email redirected, unauthenticated redirected, empty `ALLOWED_EMAILS` blocks all
- **`analyseUserTurns` unit tests** — add a case for `'en-NZ'` confirming the EN-NZ system prompt constant is selected
- **Existing tests** — no changes expected; existing route tests use the service-role client which remains available

---

## Out of Scope

- Per-session language override (all sessions use the user's current language setting)
- Voice/speaker matching across sessions (speaker ID remains manual every time)
- Admin UI for managing the allowlist (edit the env var directly)
- More than two languages
