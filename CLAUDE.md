# CLAUDE.md

## What This Is

A Next.js web app for analysing recorded Spanish (Argentinian/Rioplatense) conversations. Upload audio → AssemblyAI transcribes and diarizes → Claude annotates the user's speech turns → user saves corrections to write down. Multi-user with Supabase Auth (email magic link) and an email allowlist.

**Naming**: The user-facing surface for saved corrections is **Write** (the action — writing them down on paper is what comes next). The DB table and API path are still `practice_items` / `/api/practice-items` (data noun, kept stable). When you see `practice_items` in code, think "the data backing the Write surface".

## Tech Stack

- **Next.js 14 App Router**, TypeScript, Tailwind CSS — hosted on Vercel
- **Supabase** (PostgreSQL via `@supabase/supabase-js` v2 + `@supabase/ssr` for Auth)
- **Cloudflare R2** via `@aws-sdk/client-s3` (S3-compatible)
- **AssemblyAI** SDK — transcription + speaker diarization
- **Gemini Multimodal Live API** (raw WebSocket, `models/gemini-3.1-flash-live-preview`) — real-time voice coaching via `useVoiceController` (global, header-anchored)
- **Anthropic SDK** (`@anthropic-ai/sdk`) — Claude analysis
- **`framer-motion`** — sheet entrance animations + `useReducedMotion`
- **`react-swipeable`** — swipe gestures on `AnnotationSheet`, `WriteSheet`, `WriteList`
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
  page.tsx                        # RSC: loads sessions + summary, hands to <HomeClient>
  login/page.tsx                  # Magic-link login (public)
  access-denied/page.tsx          # Shown when email not in allowlist (public)
  onboarding/page.tsx             # First-login wizard: language select (step 0) → tutorial steps (?step=1, 2)
  auth/callback/page.tsx          # Client page: reads hash-fragment tokens (implicit flow) → redirects to / or /onboarding
  sessions/[id]/
    page.tsx                      # RSC: loads SessionDetail, hands to <TranscriptClient>
    loading.tsx                   # Skeleton shown during the RSC fetch (no post-hydration flash)
    status/page.tsx               # Screen 2: Processing Status
    identify/page.tsx             # Screen 3: Speaker Identification
  write/page.tsx                  # RSC: loads practice items, hands to <WriteClient>
  write/loading.tsx               # Skeleton mirroring the Write list shape
  settings/page.tsx               # Settings: language, theme, sign-out, version
  share-target/page.tsx           # PWA Web Share Target receiver
  loading.tsx                     # Global Next.js loading boundary
  api/                            # All API routes (Next.js route handlers)
components/
  AppHeader.tsx                   # Top nav bar with hamburger + theme toggle
  NavDrawer.tsx                   # Slide-out nav drawer — pulls from NAV_TABS in nav-tabs.tsx
  BottomNav.tsx                   # Mobile bottom tab bar (Home/Write/Settings)
  ConditionalNav.tsx              # Composes AppHeader + NavDrawer + BottomNav
  NavProgress.tsx                 # Top-of-page hairline progress bar during RSC nav (no nprogress dep)
  nav-tabs.tsx                    # NAV_TABS array — shared by NavDrawer + BottomNav
  OnboardingStep.tsx              # Shared wizard chrome (back / wordmark+dots / skip-or-close + CTA row)
  UploadIllustration.tsx          # Animated phone-frame mock for tutorial step 1 — shares oa-* keyframes
  WhatsAppShareIllustration.tsx   # Animated phone-frame mock for tutorial step 2 — shares oa-* keyframes
  Wordmark.tsx                    # CONVERSATION COACH wordmark — used by login, onboarding, settings
  ThemeProvider.tsx               # Dark/light theme context
  ThemeToggle.tsx                 # Theme switcher button
  FontSizeProvider.tsx            # User-controllable font scale
  LanguageProvider.tsx            # UI language context with live switching
  HomeClient.tsx                  # Client island for /: upload, polling, dashboard composition
  HomeUploadFab.tsx               # Labelled mobile FAB ("Upload audio") + desktop inline button
  UploadCoachmark.tsx             # First-run spotlight on the mobile FAB — mobile-only (`md:hidden`); FAB lives outside so tap → file-picker works unchanged
  SessionList.tsx                 # Session rows — swipe left=delete (5s undo), swipe right=toggle read; react-swipeable
  DashboardOnboarding.tsx         # First-time empty state on home
  DashboardInProgress.tsx         # In-flight sessions strip
  DashboardReminders.tsx          # Write-down count widget
  DashboardRecentSessions.tsx     # Recent sessions list with delete + read toggle
  TranscriptClient.tsx            # Client island for /sessions/[id] — annotation review state
  TranscriptView.tsx              # Paragraph-aware transcript renderer — splits segments on paragraph_breaks, filters + re-bases annotations per paragraph
  AnnotatedText.tsx               # Renders a text slice with inline annotation highlights; accepts offsetBase to re-base char offsets
  ExplainSheet.tsx                # Docked sheet showing flashcard-style explanation (original, correction, note)
  InlineEdit.tsx                  # Tap-to-rename input with save/cancel; used for session titles
  PipelineStatus.tsx              # Processing status rail (upload→transcribe→identify→analyse) — patient, encouraging
  ScrollToTopOnNavigate.tsx       # Resets scroll position on route change
  WriteClient.tsx                 # Client island for /write — wraps WriteList
  AnnotationCard.tsx              # Single annotation row in the transcript — triggers AnnotationSheet, Add to Write button
  AnnotationSheet.tsx             # Docked review panel for transcript corrections — wraps `DockedSheet`
  WriteSheet.tsx                  # Docked review sheet for items in the Write list — wraps `DockedSheet`
  WriteList.tsx                   # The Write surface: queue of saved corrections + quiet "Written" archive link
  Icon.tsx                        # Shared inline-SVG icon set (no icon dep)
  # Shared UI primitives — prefer these over inlining new ones:
  Button.tsx                      # `<Button>` + `buttonStyles()` for primary/secondary actions; import `buttonStyles` directly for non-button elements (e.g. `<a>` anchors) that need button appearance
  LogoMark.tsx                    # Robot logo mark without background — body fill adapts to theme via --color-surface; use wherever the brand icon is needed
  IconButton.tsx                  # Square / circle icon-only button (toolbar / dismiss / nav-arrow)
  Skeleton.tsx                    # `<Skeleton>` + `<SkeletonRow>` for loading.tsx boundaries
  CorrectionInContext.tsx         # Canonical "sentence-with-strike-and-rewrite" treatment (WriteList + WriteSheet)
  StrikeOriginal.tsx              # Older standalone "wrong → right" treatment (still used in empty-state example)
  ImportancePill.tsx              # "High priority" / "Worth remembering" pill — replaces ★ rating cluster
  NavHint.tsx                     # First-open chevron-swipe cue inside DockedSheet (annotation + write share storage key)
  Toast.tsx                       # Floating bottom-anchored alert pill with optional action — uses --toast-bottom
  DockedSheet.tsx                 # Sheet shell (bottom on mobile, right on desktop) — chrome, animation, focus, swipe, keys
  Modal.tsx                       # Centered dialog with scrim — only use when an action is genuinely modal
  VoiceController.tsx             # `useVoiceController` hook host — WebSocket/mic/AudioContext survive navigation (mounted in ConditionalNav)
  VoiceTrigger.tsx                # Trigger button in AppHeader right cluster (accent-tinted `bg-accent-chip`)
  VoiceStrip.tsx                  # Fixed strip under header while voice session active; owns mute/end/audio indicator; writes --voice-strip-height
  VoiceCoachmark.tsx              # First-run mobile-only coachmark anchored to VoiceTrigger; dismissed via cc:voice-trigger-coachmark:v1
  ...                             # Other shared components
lib/
  types.ts                        # All shared TypeScript types
  auth.ts                         # getAuthenticatedUser() — header fast-path + cookie fallback, React cache()
  loaders.ts                      # Canonical SQL queries shared by RSCs and API routes
  i18n.ts                         # t() translation function + TRANSLATIONS dict
  push.ts                         # sendPushNotification helper
  dashboard-summary.ts            # computeDashboardSummary() → { writeDownCount, ... }
  supabase-server.ts              # Supabase client for server components/routes
  supabase-browser.ts             # Supabase client for client components (implicit flow — see auth design decision)
  audio-upload.ts                 # Canonical ACCEPTED_TYPES, ACCEPTED_EXTENSIONS, MAX_BYTES constants — import from here, don't duplicate
  theme-meta.ts                   # PWA/browser status-bar color constants (theme-color + apple-mobile-web-app-status-bar-style)
  r2.ts                           # presignedUploadUrl, deleteObject
  pipeline.ts                     # orchestrates status transitions and DB writes
  assemblyai.ts                   # createJob, cancelJob, parseWebhook, getParagraphs, mapParagraphsToSegments
  claude.ts                       # analyseUserTurns — prompt + JSON parse
  voice-agent.ts                  # Gemini Live WebSocket: connect(targetLanguage, items, callbacks), buildSystemPrompt()
  logger.ts                       # `log` structured logger — JSON lines; log.error → stderr, others → stdout. Use instead of console.*
  voice-context.ts                # buildSessionContext, buildWriteContext — bridge page context to voice coach via window.__ccVoiceContext
middleware.ts                     # Auth guard + ALLOWED_EMAILS allowlist + identity-header passthrough
supabase/migrations/              # SQL migrations
__tests__/                        # Vitest tests mirroring src structure
```

## Processing Pipeline

The audio pipeline flows through these statuses: `uploading → transcribing → identifying → analysing → ready` (or `error` at any stage).

1. Client uploads audio directly to R2 via presigned URL, then calls `POST /api/sessions/:id/upload-complete`
2. Server triggers AssemblyAI job (speaker count inferred by the model); webhook at `/api/webhooks/assemblyai` fires when done
3. If 2 speakers detected: status → `identifying` (paused, waiting for speaker label)
4. If 1 speaker detected: `user_speaker_labels` set to `["A"]`, goes straight to `analysing`
5. Speaker label submitted via `POST /api/sessions/:id/speaker` → triggers Claude analysis
6. Claude returns structured JSON annotations; practice items written to DB; audio deleted from R2; status → `ready`

Re-analysis via `POST /api/sessions/:id/analyse` deletes all annotations for the session and re-runs Claude. **Practice items are NOT touched** — they keep their flashcards even when the underlying annotation is regenerated, so the user-facing copy in the confirmation dialog (`reanalyse.body` in `lib/i18n.ts`) reflects this.

## Key Design Decisions

- **Server-rendered pages, client islands**: Home (`/`), Write (`/write`), and Session detail (`/sessions/[id]`) are Server Components that fetch their data in parallel via `lib/loaders.ts`, then hand it to a single client island (`HomeClient`, `WriteClient`, `TranscriptClient`) for interactivity. Result: real content on first paint instead of skeleton → `useEffect` → render. When adding a new page, prefer this pattern — put the SQL in `lib/loaders.ts` so the API route and the RSC share one query.
- **Auth header passthrough**: `middleware.ts` is the single trust boundary — it calls `supabase.auth.getUser()` once per request and forwards the verified identity via `x-cc-user-id` / `x-cc-user-email` / `x-cc-user-target-language` request headers. `getAuthenticatedUser()` reads those headers (zero network calls) and falls back to a cookie-based verify only when middleware didn't run (tests, or routes carved out of the matcher). Wrapped in React `cache()` so layout + page + nested RSCs share one result. Middleware strips any incoming `x-cc-*` headers before setting its own — never trust client-supplied identity headers.
- **Auth**: Supabase Auth (email magic link). `middleware.ts` guards all routes except `/login`, `/auth`, `/access-denied`, `/api/webhooks`. `ALLOWED_EMAILS` env var (comma-separated) controls who can access.
- **Magic-link uses PKCE flow**: `@supabase/ssr` v0.9+ hardcodes `flowType: 'pkce'` inside `createBrowserClient`, overriding any `flowType` option passed by the caller — so `lib/supabase-browser.ts` no longer sets it. `app/auth/callback/page.tsx` is a client component; `detectSessionInUrl` handles the code exchange automatically, fires `SIGNED_IN`, then `router.refresh()` clears any stale Next.js router-cache redirects before `router.replace()` navigates to the app.
- **Next.js router cache + middleware auth**: Nav `<Link>` elements trigger Next.js prefetches. If a page is reachable while unauthenticated and the nav renders, those prefetch requests hit middleware with no session, return 307s to `/login`, and those redirects get cached client-side — causing a login loop after sign-in. Fix: add any unauthenticated route to `HIDDEN_ON` in `components/ConditionalNav.tsx`, and call `router.refresh()` before `router.replace()` in `app/auth/callback/page.tsx` to flush stale cache entries.
- **Middleware must return `supabaseResponse`, not a new `NextResponse.next()`**: If `supabase.auth.getUser()` triggers a token refresh, `setAll()` writes the new cookies to `supabaseResponse`. Returning a freshly created `NextResponse.next()` at the end of middleware discards those cookies — the user's session silently breaks on the next request. Capture `supabaseResponse.headers.getSetCookie()` before rebuilding the response, then re-append them.
- **Middleware matcher must exclude all public static assets**: Any file served from `/public` that is not in the matcher exclusion regex will be auth-guarded. Currently excluded: `_next/static`, `_next/image`, `favicon.ico`, `logo.svg`, `icon.svg`, `manifest.json`, `sw.js`, `icons/`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`. Add new public assets here or they will 307-redirect unauthenticated users (including the login page itself).
- **API auth pattern**: Protected API routes call `getAuthenticatedUser()` and chain `.eq('user_id', user.id)` on all Supabase queries. The webhook route is intentionally excluded.
- **i18n**: Use `t(key, lang)` from `lib/i18n.ts` for all UI strings. `LanguageProvider` context provides the active `UiLanguage`. The UI language is *inferred* from the user's `targetLanguage` metadata (e.g. `en-NZ` → `es` UI). Do not add raw string literals to components.
- **Theme**: `ThemeProvider` in `components/ThemeProvider.tsx` manages dark/light mode. Use semantic CSS tokens (`bg-background`, `text-foreground`, `bg-surface`, etc.) defined in `globals.css` — never hardcode Tailwind gray classes (`gray-100`, `gray-800`, etc.).
- **Practice items, no scheduler (yet)**: The Leitner system was removed (migration `20260415_drop_leitner_columns.sql`). FSRS columns (`fsrs_state`, `due`, `stability`, …) were added by migration `20260410` for a future SRS, but no UI/API consumes them yet. `practice_items` rows currently expose only `written_down` and `importance_score`.
- **Annotation review uses a docked sheet, not a modal**: `components/AnnotationSheet.tsx` is the central transcript-review pattern — bottom-anchored on mobile, right-side panel on desktop, no backdrop, with prev/next nav, swipe gestures, and `activeAnnotationId` ring on the source `<mark>`. Wire new annotation interactions through it; do not reach for `Modal`. The shared chrome (layout, animation, gestures, focus / keyboard / outside-click) lives in `components/DockedSheet.tsx` — use it for any new sheet rather than copying the chrome. The header was distilled in 2026-04: no grammar/naturalness type dot, no sub-category pill — both review surfaces share the same minimal chrome.
- **Importance scoring**: `annotations.importance_score` (1–3) and `importance_note` are written by Claude in `lib/claude.ts` and surfaced via `<ImportancePill>` (not stars) in `AnnotationCard` and `WriteSheet`. Score 3 → "High priority"; score 2 → "Worth remembering"; score 1 is intentionally suppressed (low signal). Sorting by importance is opt-in via `?sort=importance` on `GET /api/practice-items`.
- **Write page = Write ↔ Written** (`/write`): `WriteList` defaults to the Write surface (`!written_down`); the Written archive is a quiet text link beside it (no segmented control). Rows expose a trailing fast-path tap to flip `written_down` without opening the sheet. Sub-category pills, importance sort UI, and bulk-select were all removed in simplification passes. The `?sub_category=…` query param is accepted on `GET /api/practice-items` but currently a no-op (kept so old bookmarks don't break; revisit when category filtering returns).
- **`<CorrectionInContext>` is the canonical correction treatment** (`components/CorrectionInContext.tsx`) — sentence with the wrong fragment struck through and the rewrite inserted inline, used by `WriteList` rows and `WriteSheet`. Falls back to `<StrikeOriginal>` when there's no segment data (still used for the empty-state teaching example). For naturalness annotations (no rewrite) it tints the wrong fragment instead of striking it.
- **`<NavHint>` cue inside DockedSheet bodies**: One-shot first-open chip teaching the chevron/swipe nav. Single shared localStorage key (`cc:sheet-nav-hint:v1`) across both annotation and write sheets — learning the model once on either surface dismisses both. Login page stores the last-used address at `cc:login-email` for the one-tap "Continue as" quick-select.
- **Onboarding wizard is URL-driven** (`app/onboarding/page.tsx`): `?step=0` is the language picker (one-time gate), `?step=1, 2` are the tutorial steps rendered via `<OnboardingStep>` chrome. `&revisit=true` swaps the chrome's "Skip" for "Close" and routes exits back to Settings instead of `/`. Settings → Help links straight to `?step=1&revisit=true` and `?step=2&revisit=true` so users can re-learn either step in isolation. Add new tutorial steps to the `STEP_CONFIG` map and bump `TOTAL_TUTORIAL_STEPS` — the wizard chrome handles dots, back/forward, and CTA labelling automatically.
- **Tutorial illustrations share the `oa-*` keyframe vocabulary** (`app/globals.css`): `oa-touch` (press-and-hold finger pad) → `oa-sheet` (bottom sheet rise) → `oa-backdrop` (dim) → `oa-pulse` (accent ring on the destination). All four use `animation-fill-mode: both` so the rest state IS the destination — reduced-motion users (whose duration is clamped to 0.01ms globally) snap straight to a complete teaching frame instead of nothing. New illustrations should reuse these classes rather than inventing parallel ones; only the surrounding mock content (header, body, sheet contents) should differ between steps.
- **Insights feature removed**: The `/insights` page, its API handler, `lib/insights.ts`, and the corresponding Supabase RPCs (`get_subcategory_error_counts`, `get_subcategory_examples`) were removed in a distill pass — the surface wasn't delivering enough value. Dropped in migration `20260418000000_drop_insights_rpcs.sql`. If recurring-mistake surfacing returns, rebuild from the raw `annotations` table rather than recreating the RPCs.
- **Write list fast-path + undoable delete**: Rows in the Write tab render a trailing tap target (Gmail pattern) that flips `written_down` without opening the sheet. Delete is optimistic with a 5-second undo window — the row hides immediately, `DELETE` only fires after the timer expires, Undo cancels the network call entirely. Toast lives at `bottom-[var(--toast-bottom)]` (5rem mobile / 1.25rem desktop) defined in `globals.css`. Redundant per-row success toasts were silenced — the visual state change is the receipt.
- **Home upload affordance is a labelled FAB**: `components/HomeUploadFab.tsx` renders a Gmail-style extended pill on mobile ("Upload audio" / "Subir audio") above the bottom nav (`bottom: calc(4.5rem + env(safe-area-inset-bottom))`), and an inline outlined button on desktop. Busy state shows `<Icon name="spinner">` + "Uploading…" inside the FAB itself — do not add a duplicate inline status string elsewhere. The home container reserves `pb-[calc(9rem+env(safe-area-inset-bottom))]` on mobile so the FAB never overlaps the last row.
- **Structured logging**: Use `log` from `lib/logger.ts` (not `console.*`) in API routes, pipeline, and lib files. Outputs JSON lines; `log.error` → stderr, others → stdout.
- **Audio is temporary**: R2 audio is deleted after AssemblyAI completes transcription. No permanent audio storage.
- **Speaker ID every session**: No automatic voice matching. The user picks their speaker every time via the identify screen.
- **Paragraph grouping on transcript segments**: `transcript_segments.paragraph_breaks` (`int[]`, default `{}`) stores character offsets where new paragraphs begin within a segment's `text` (first paragraph is implicit — offset 0 is never stored). Populated from AssemblyAI's `/v2/transcript/:id/paragraphs` in the webhook handler for new sessions; empty for legacy rows (backward compatible — renders as one block). `TranscriptView.tsx` splits each segment on these offsets and renders one `<p>` per paragraph with `space-y-3 md:space-y-4`. `AnnotatedText.tsx` accepts `offsetBase` to re-base annotation `start_char`/`end_char` relative to the current paragraph slice. Annotations that span a paragraph break are filtered out with a `log.warn`. Failure to fetch paragraphs blocks transcription (session → `error`, `error_stage: transcribing`).
- **Gemini Live binary frame protocol**: Gemini sends ALL WebSocket frames as binary (ArrayBuffer) — both control messages (e.g. `setupComplete`, errors) and raw PCM16 audio. The message handler in `lib/voice-agent.ts` tries UTF-8 JSON decode first; if that fails it treats the frame as a PCM16 audio chunk. Do not set `ws.binaryType = 'arraybuffer'` and then blindly `JSON.parse` — you'll get `"[object ArrayBuffer] is not valid JSON"`. Also: `realtime_input.media_chunks` is deprecated; use `realtime_input.audio` instead.
- **Voice coach is global**: `useVoiceController` (in `components/VoiceController.tsx`) is mounted inside `ConditionalNav`, so the WebSocket / mic / AudioContext survive in-app navigation. `VoiceTrigger` (in `AppHeader`'s right cluster, accent-tinted `bg-accent-chip` so it reads as a primary affordance instead of grouping with the theme toggle) opens a session; `VoiceStrip` (fixed under the header while active, writes `--voice-strip-height` so `<main>` shifts down 44px in lockstep with the strip's `voice-strip-anim` slide-down) owns mute / end / audio-flow indicator. The strip is intentionally distilled to indicator + controls — no static title, no language pill — because the dot + tinted background already say "session active". End uses `text-on-error-surface` so the X reads as destructive, not as a sheet-dismiss. Mute's pressed state uses neutral `bg-text-tertiary/15`, NOT `bg-error-surface` — muting is a deliberate choice, not an error. Desktop strip surfaces the keyboard shortcut hint inline; the strip exposes `aria-keyshortcuts="Escape Space"`. Connecting state shows a visible "Connecting…" label on desktop and a polite aria-live announcement everywhere. System prompt gets a single-sentence route hint via `VoiceRouteContext` — `/write` and `/sessions/[id]` only; other routes get no hint. Page context is bridged through `window.__ccVoiceContext?: VoicePageContext` (declared in `types/window.d.ts`) — `TranscriptClient` publishes `kind:'session'` (via `buildSessionContext`), `WriteClient` publishes `kind:'write'` (via `buildWriteContext`); both clear on unmount. `VoiceController.start()` reads and pins this once at connect time. Builder functions live in `lib/voice-context.ts`. First-run `VoiceCoachmark` (mobile-only) is rendered inside `AppHeader`'s right cluster (anchored to the trigger via `relative` parent + `absolute top-full right-0`) so it survives any future header layout changes; `cc:voice-trigger-coachmark:v1` localStorage flag dismisses it once. The controller's toast model (`VoiceToast`) carries a `retryable` flag — transport failures surface a "Try again" action that calls `start()` again, but permission denials don't (the user has to fix browser settings, not loop the same denial).
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
- **`GET /api/practice-items` and the RSC `/write` page both call `loadPracticeItems()`** in `lib/loaders.ts` — one nested PostgREST select that joins `practice_items → sessions` (for title) and `practice_items → annotations → transcript_segments` (for context text). User-scoping happens via `.eq('sessions.user_id', userId)` on the join. Add new columns to the `select` string in `loadPracticeItems`, not in the API route.
- **`router.back()` is unreliable in PWA/Safari** when `window.history.length === 1`. Use `<Link href="/">` for back navigation.
- **`react-swipeable` is already installed** (used by `WriteList.tsx`). Import `useSwipeable` directly.
- **Navigation lives in two places**: `components/NavDrawer.tsx` (slide-out, full nav) and `components/BottomNav.tsx` (mobile bottom tabs). Both pull from the shared `NAV_TABS` in `components/nav-tabs.tsx`.
- **`written_down` on `practice_items`**: boolean field; the Write surface (`!written_down`) is the default view in `WriteList`, with the "Written" archive surfaced as a quiet sibling link rather than a tab. View state is client-only — no deep-link query param.
- **`ts-fsrs` is installed but unused**: SRS columns exist on `practice_items` (`fsrs_state`, `due`, `stability`, …) from migration `20260410`. The library and columns are reserved for an upcoming scheduler — do not remove either.

## Performance Patterns

- **One auth call per request, not three**: Middleware verifies the JWT once and forwards `x-cc-user-id` via request headers. `getAuthenticatedUser()` reads the header (no network call) and is wrapped in React `cache()` so the layout, the page, and any nested RSC share one resolution. Don't re-add `supabase.auth.getUser()` calls in pages or API routes — call `getAuthenticatedUser()`.
- **Server-side data fetching, no client waterfalls**: When you find yourself reaching for `useEffect(() => fetch(...), [])` in a page, stop — extract a loader into `lib/loaders.ts` and call it from a parent RSC. The Status route, Write list, and Session detail all dropped >500ms of latency this way. Polling is the exception (HomeClient watches in-flight uploads).
- **Polling has backoff and visibility**: `HomeClient` polls `/api/sessions/:id/status` for in-flight sessions via a `setTimeout` chain (3s base, 1.5x backoff, 30s cap). Hidden tabs poll zero times — `visibilitychange` clears all timers and resumes them on focus. Match this pattern for any new polling.
- **`<NavProgress>` fills the click→paint gap**: Top-of-page hairline that starts on link click and finishes on `pathname` change. No `nprogress` dep — the implementation is small and uses design tokens directly. Combined with `loading.tsx` skeletons, navigation never shows a blank screen.

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
- `GOOGLE_API_KEY` — Gemini Live API key (server-only, returned auth-gated via `/api/voice-token`)
- `NEXT_PUBLIC_GOOGLE_VOICE` — Gemini prebuilt voice name (optional, default `Aoede`)
- `ALLOWED_EMAILS` — comma-separated list of emails permitted past the auth middleware
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT` — Web Push (generate with `npx web-push generate-vapid-keys`)
- `APP_URL` — public URL for AssemblyAI webhooks (use ngrok tunnel for local dev)
- `NEXT_PUBLIC_BUILD_DATE`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` — injected automatically at build time; do not set manually
