# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Next.js web app for analysing recorded Spanish (Argentinian/Rioplatense) conversations. Upload audio → AssemblyAI transcribes and diarizes → Claude annotates the user's speech turns → save practice items. Multi-user with Supabase Auth (email magic link) and an email allowlist.

## Tech Stack

- **Next.js 14 App Router**, TypeScript, Tailwind CSS — hosted on Vercel
- **Supabase** (PostgreSQL via `@supabase/supabase-js` v2 + `@supabase/ssr` for Auth)
- **Cloudflare R2** via `@aws-sdk/client-s3` (S3-compatible)
- **AssemblyAI** SDK — transcription + speaker diarization
- **Anthropic SDK** (`@anthropic-ai/sdk`) — Claude analysis
- **Leitner box scheduler** — 5-box physical flashcard review system (no ts-fsrs)
- **Vitest** + React Testing Library — unit/component tests

## Commands

```bash
npm run dev          # start dev server
npm run build        # production build
npm run lint         # ESLint
npm test             # run all tests (Vitest)
npm test -- <path>   # run a single test file
```

## Project Structure

```
app/
  page.tsx                        # Screen 1: Upload / Home (Leitner CTA widget + write-down pill)
  login/page.tsx                  # Magic-link login (public)
  access-denied/page.tsx          # Shown when email not in allowlist (public)
  onboarding/page.tsx             # First-login target language selection
  auth/callback/route.ts          # OAuth code exchange (public)
  sessions/[id]/
    page.tsx                      # Screen 4: Annotated Transcript
    status/page.tsx               # Screen 2: Processing Status
    identify/page.tsx             # Screen 3: Speaker Identification
  practice/page.tsx               # Screen 5: Practice Items
  insights/page.tsx               # Screen 6: Insights (sub-category mistake tracking)
  flashcards/page.tsx             # Screen 7: Leitner dashboard (pile overview + log outcomes)
  settings/page.tsx               # Settings: language, theme, sign-out, version
  api/                            # All API routes (Next.js route handlers)
components/
  AppHeader.tsx                   # Top nav bar with hamburger + theme toggle
  NavDrawer.tsx                   # Slide-out nav drawer (TABS array here)
  ConditionalNav.tsx              # Composes AppHeader + NavDrawer
  ThemeProvider.tsx               # Dark/light theme context
  LanguageProvider.tsx            # UI language context with live switching
  LeitnerDashboard.tsx            # Pile strip + per-card ✓/✗ + confirm button for physical review
  ...                             # Other shared components
lib/
  types.ts                        # All shared TypeScript types
  auth.ts                         # getAuthenticatedUser() — @supabase/ssr helper
  i18n.ts                         # t() translation function + TRANSLATIONS dict
  insights.ts                     # fetchInsightsData() — uses Supabase RPC
  push.ts                         # sendPushNotification helper
  leitner.ts                      # leitnerPass(), leitnerFail(), formatDateISO() — pure logic, no DB
  dashboard-summary.ts            # computeDashboardSummary() → { leitnerDue, dueBoxes, nextDueDate, writeDownCount }
  supabase-server.ts              # Supabase client for server components/routes
  supabase-browser.ts             # Supabase client for client components
  r2.ts                           # presignedUploadUrl, deleteObject
  pipeline.ts                     # orchestrates status transitions and DB writes
  assemblyai.ts                   # createJob, cancelJob, parseWebhook
  claude.ts                       # analyseUserTurns — prompt + JSON parse
middleware.ts                     # Auth guard + ALLOWED_EMAILS allowlist
supabase/migrations/              # SQL migrations
__tests__/                        # Vitest tests mirroring src structure
```

## Processing Pipeline

The audio pipeline flows through these statuses: `uploading → transcribing → identifying → analysing → ready` (or `error` at any stage).

1. Client uploads audio directly to R2 via presigned URL, then calls `POST /api/sessions/:id/upload-complete`
2. Server triggers AssemblyAI job (`speakers_expected: 2`); webhook at `/api/webhooks/assemblyai` fires when done
3. If 2 speakers detected: status → `identifying` (paused, waiting for speaker label)
4. If 1 speaker detected: `user_speaker_labels` set to `["A"]`, goes straight to `analysing`
5. Speaker label submitted via `POST /api/sessions/:id/speaker` → triggers Claude analysis
6. Claude returns structured JSON annotations; practice items written to DB; audio deleted from R2; status → `ready`

Re-analysis via `POST /api/sessions/:id/analyse` replaces all annotations and annotation-derived practice items.

## Key Design Decisions

- **Auth**: Supabase Auth (email magic link). `middleware.ts` guards all routes except `/login`, `/auth`, `/access-denied`, `/api/webhooks`. `ALLOWED_EMAILS` env var (comma-separated) controls who can access. Use `getAuthenticatedUser()` from `lib/auth.ts` in server components/routes — it uses the anon key so the JWT is validated, not bypassed like the service role key.
- **API auth pattern**: Protected API routes call `getAuthenticatedUser()` and chain `.eq('user_id', user.id)` on all Supabase queries. The webhook route is intentionally excluded.
- **i18n**: Use `t(key, lang)` from `lib/i18n.ts` for all UI strings. `LanguageProvider` context provides the active `UiLanguage`. The UI language is *inferred* from the user's `targetLanguage` metadata (e.g. `en-NZ` → `es` UI). Do not add raw string literals to components.
- **Theme**: `ThemeProvider` in `components/ThemeProvider.tsx` manages dark/light mode. Use semantic CSS tokens (`bg-background`, `text-foreground`, `bg-surface`, etc.) defined in `globals.css` — never hardcode Tailwind gray classes (`gray-100`, `gray-800`, etc.).
- **Leitner flashcards**: 5-box physical review system. `lib/leitner.ts` has pure pass/fail logic. `GET /api/practice-items?flashcards=due` returns `LeitnerResponse { boxes, cards, activeBox }` — lowest due box's cards. `POST /api/practice-items/leitner-review` accepts `{ results: [{id, passed}] }` and advances/resets box in bulk. Setting `written_down = true` auto-sets `leitner_box = 1` and `leitner_due_date = today`. Box intervals: 1→1d, 2→3d, 3→7d, 4→14d, 5→28d. Pass advances box; fail resets to box 1.
- **Insights use Supabase RPCs**: `fetchInsightsData()` in `lib/insights.ts` calls 3 RPC functions (defined in `supabase/migrations/20260322000001_insights_rpc.sql`). Add new insight queries as RPCs, not direct table queries.
- **Practice sub-category filter**: `?sub_category=<key>` URL param seeds the active pill on load. 14-pill row (All + 13 sub-categories), sorted by count, colour-coded. Linked from Insights "See all examples" cards.
- **Structured logging**: Use `log` from `lib/logger.ts` (not `console.*`) in API routes, pipeline, and lib files. Outputs JSON lines; `log.error` → stderr, others → stdout.
- **Audio is temporary**: R2 audio is deleted after AssemblyAI completes transcription. No permanent audio storage.
- **Speaker ID every session**: No automatic voice matching. The user picks their speaker every time via the identify screen.
- **Annotations use character offsets**: `start_char`/`end_char` are offsets within `segment.text`, used to render inline highlights.
- **`PATCH /api/sessions/:id` accepts `title` only**: All other session state is managed by server-side pipeline logic.
- **`POST /api/sessions/:id/retry`**: Only valid for `uploading` and `transcribing` error stages. Use `/analyse` for analysing errors.
- **Webhook HMAC**: AssemblyAI webhook verifies `x-assemblyai-signature` (HMAC-SHA256). Unknown job IDs are silently discarded (return 200).
- **Push notifications**: `lib/push.ts` sends Web Push via VAPID. `POST /api/push-subscription` stores subscriptions. `usePushNotifications` hook registers on the status page. Analysis completion triggers a push.

## Claude Prompt Requirements

The `analyseUserTurns` function in `lib/claude.ts` accepts `targetLanguage: TargetLanguage = 'es-AR'` and selects from `PROMPTS` record keyed by language. Must:
- Target the correct language register (default: Argentinian Spanish, Rioplatense, voseo)
- Return structured JSON: array of annotation objects matching the `annotations` DB schema
- Annotate grammar errors and naturalness suggestions
- Include `segment_id`, `type`, `sub_category`, `original`, `start_char`, `end_char`, `correction`, `explanation`
- `sub_category` must be one of the 13 values in `SUB_CATEGORIES` (lib/types.ts); validated against `SUB_CATEGORY_TYPE_MAP` in pipeline
- Also include `flashcard_front`, `flashcard_back`, `flashcard_note` per annotation:
  - `flashcard_front`: English sentence with the correct equivalent phrase wrapped in `[[double brackets]]`
  - `flashcard_back`: Spanish sentence using the correct form, target phrase wrapped in `[[double brackets]]`
  - `flashcard_note`: 1–2 English sentences explaining the error from a Rioplatense register perspective

## Data Flow Gotchas

- **Pipeline writes to `annotations` only.** `practice_items` are created by users clicking "Add to practice" in `AnnotationCard` — never auto-created by the pipeline.
- **`POST /api/practice-items` does a bare `insert(body)`** — new fields in the POST body are stored automatically; no route change needed.
- **`GET /api/practice-items` uses an explicit `.select()` column list** (not `'*'`). Append new column names to the string; do not switch to `select('*')`.
- **`router.back()` is unreliable in PWA/Safari** when `window.history.length === 1`. Use `<Link href="/">` for back navigation.
- **`react-swipeable` is already installed** (used by `PracticeList.tsx`). Import `useSwipeable` directly.
- **Navigation uses `NavDrawer`** (`components/NavDrawer.tsx`). Add new nav tabs by inserting `{ href, label, icon }` objects in the `TABS` array there. (`BottomNav` was removed.)
- **`written_down` on `practice_items`**: boolean field; `?written_down=false` deep-link seeds the filter on the practice page.

## Supabase CLI

- Run SQL against remote: `supabase db query --linked "<sql>"`
- Apply pending migrations: `supabase db push`
- Check migration status: `supabase migration list`
- Register manually-applied migrations: `supabase migration repair --status applied <version>`

## Environment Variables

See `.env.local.example` for all required keys:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `ASSEMBLYAI_API_KEY`, `ASSEMBLYAI_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
- `ALLOWED_EMAILS` — comma-separated list of emails permitted past the auth middleware
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT` — Web Push (generate with `npx web-push generate-vapid-keys`)
- `APP_URL` — public URL for AssemblyAI webhooks (use ngrok tunnel for local dev)
- `NEXT_PUBLIC_BUILD_DATE`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` — injected automatically at build time; do not set manually
