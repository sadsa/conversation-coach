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
- **`framer-motion`** — sheet entrance animations + `useReducedMotion`
- **`react-swipeable`** — swipe gestures on `AnnotationSheet`, `PracticeItemSheet`, `PracticeList`
- **`web-push`** — VAPID Web Push for analysis-completion notifications
- **`ts-fsrs`** in deps for upcoming SRS scheduling (DB columns added in migration `20260410`; UI not yet wired up)
- **Vitest** + React Testing Library — unit/component tests

## Commands

```bash
npm run dev          # start dev server
npm run build        # production build
npm run lint         # ESLint
npm test             # run all tests (Vitest)
npm test -- <path>   # run a single test file
npm run test:watch   # vitest in watch mode
```

## Project Structure

```
app/
  page.tsx                        # Screen 1: Upload / Home (recent sessions + write-down pill)
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
  settings/page.tsx               # Settings: language, theme, sign-out, version
  share-target/page.tsx           # PWA Web Share Target receiver
  loading.tsx                     # Global Next.js loading boundary
  api/                            # All API routes (Next.js route handlers)
components/
  AppHeader.tsx                   # Top nav bar with hamburger + theme toggle
  NavDrawer.tsx                   # Slide-out nav drawer (TABS array here)
  BottomNav.tsx                   # Mobile bottom tab bar (Home/Practice/Insights/Settings)
  ConditionalNav.tsx              # Composes AppHeader + NavDrawer + BottomNav
  ThemeProvider.tsx               # Dark/light theme context
  ThemeToggle.tsx                 # Theme switcher button
  FontSizeProvider.tsx            # User-controllable font scale
  LanguageProvider.tsx            # UI language context with live switching
  AnnotationSheet.tsx             # Docked review panel for transcript corrections — wraps `DockedSheet`
  PracticeItemSheet.tsx           # Docked review sheet for practice items — wraps `DockedSheet`
  Icon.tsx                        # Shared inline-SVG icon set (no icon dep)
  # Shared UI primitives — prefer these over inlining new ones:
  Button.tsx                      # `<Button>` + `buttonStyles()` for primary/secondary actions
  IconButton.tsx                  # Square / circle icon-only button (toolbar / dismiss / nav-arrow)
  Skeleton.tsx                    # `<Skeleton>` + `<SkeletonRow>` for loading.tsx boundaries
  StrikeOriginal.tsx              # Shared "wrong → right" treatment (row + sheet + empty state)
  Toast.tsx                       # Floating bottom-anchored alert pill with optional action — uses --toast-bottom
  DockedSheet.tsx                 # Sheet shell (bottom on mobile, right on desktop) — chrome, animation, focus, swipe, keys
  Modal.tsx                       # Centered dialog with scrim — only use when an action is genuinely modal
  ...                             # Other shared components
lib/
  types.ts                        # All shared TypeScript types
  auth.ts                         # getAuthenticatedUser() — @supabase/ssr helper
  i18n.ts                         # t() translation function + TRANSLATIONS dict
  insights.ts                     # fetchInsightsData() — uses Supabase RPC
  push.ts                         # sendPushNotification helper
  dashboard-summary.ts            # computeDashboardSummary() → { writeDownCount, ... }
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

Re-analysis via `POST /api/sessions/:id/analyse` deletes all annotations for the session and re-runs Claude. **Practice items are NOT touched** — they keep their flashcards even when the underlying annotation is regenerated, so the user-facing copy in the confirmation dialog (`reanalyse.body` in `lib/i18n.ts`) reflects this.

## Key Design Decisions

- **Auth**: Supabase Auth (email magic link). `middleware.ts` guards all routes except `/login`, `/auth`, `/access-denied`, `/api/webhooks`. `ALLOWED_EMAILS` env var (comma-separated) controls who can access. Use `getAuthenticatedUser()` from `lib/auth.ts` in server components/routes — it uses the anon key so the JWT is validated, not bypassed like the service role key.
- **API auth pattern**: Protected API routes call `getAuthenticatedUser()` and chain `.eq('user_id', user.id)` on all Supabase queries. The webhook route is intentionally excluded.
- **i18n**: Use `t(key, lang)` from `lib/i18n.ts` for all UI strings. `LanguageProvider` context provides the active `UiLanguage`. The UI language is *inferred* from the user's `targetLanguage` metadata (e.g. `en-NZ` → `es` UI). Do not add raw string literals to components.
- **Theme**: `ThemeProvider` in `components/ThemeProvider.tsx` manages dark/light mode. Use semantic CSS tokens (`bg-background`, `text-foreground`, `bg-surface`, etc.) defined in `globals.css` — never hardcode Tailwind gray classes (`gray-100`, `gray-800`, etc.).
- **Practice items, no scheduler (yet)**: The Leitner system was removed (migration `20260415_drop_leitner_columns.sql`). FSRS columns (`fsrs_state`, `due`, `stability`, …) were added by migration `20260410` for a future SRS, but no UI/API consumes them yet. Practice items currently expose only `written_down` and `importance_score`.
- **Annotation review uses a docked sheet, not a modal**: `components/AnnotationSheet.tsx` is the central transcript-review pattern — bottom-anchored on mobile, right-side panel on desktop, no backdrop, with prev/next nav, swipe gestures, and `activeAnnotationId` ring on the source `<mark>`. Wire new annotation interactions through it; do not reach for `Modal`. The shared chrome (layout, animation, gestures, focus / keyboard / outside-click) lives in `components/DockedSheet.tsx` — use it for any new sheet rather than copying the chrome.
- **Importance scoring**: `annotations.importance_score` (1–3) and `importance_note` are written by Claude in `lib/claude.ts` and surfaced as a star count + expandable note in `AnnotationCard` and `PracticeList`. Sorting by importance is opt-in via `?sort=importance` on `GET /api/practice-items`.
- **Insights use Supabase RPCs**: `fetchInsightsData()` in `lib/insights.ts` calls 3 RPC functions (defined in `supabase/migrations/20260322000001_insights_rpc.sql`). Add new insight queries as RPCs, not direct table queries.
- **Practice page = Active ↔ Written segmented control**: `PracticeList` exposes only two views (`active` = `!written_down`, `archive` = `written_down`). Sub-category pills, importance sort UI, and bulk-select were removed in the simplification pass — category filtering belongs on the Insights page now. `InsightsCardList` still links to `/practice?sub_category=…` but the param is currently a no-op (kept so the URL doesn't break; revisit when category filtering returns).
- **Practice fast-path + undoable delete**: Active rows render a trailing tap target (Gmail pattern) that flips `written_down` without opening the sheet. Delete is optimistic with a 5-second undo window — the row hides immediately, `DELETE` only fires after the timer expires, Undo cancels the network call entirely. Toast lives at `bottom-[var(--toast-bottom)]` (5rem mobile / 1.25rem desktop) defined in `globals.css`.
- **`<StrikeOriginal>` is the canonical "wrong → right" primitive** (`components/StrikeOriginal.tsx`) — used by `PracticeList` rows, `PracticeItemSheet`, and the empty-state example. Change colour or sizing once, all three surfaces follow.
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
- **Navigation lives in two places**: `components/NavDrawer.tsx` (slide-out, full nav) and `components/BottomNav.tsx` (mobile bottom tabs). Both have their own `TABS` array — update both when adding/removing routes.
- **`written_down` on `practice_items`**: boolean field; drives the Active/Written segmented control in `PracticeList`. There is no deep-link query param — the view is always client-state, defaulting to Active.
- **`ts-fsrs` is installed but unused**: SRS columns exist on `practice_items` (`fsrs_state`, `due`, `stability`, …) from migration `20260410`. The library and columns are reserved for an upcoming scheduler — do not remove either.

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
