# CLAUDE.md

## What This Is

A Next.js web app for analysing recorded Spanish (Argentinian/Rioplatense) conversations. Upload audio → AssemblyAI transcribes and diarizes → Claude annotates the user's speech turns → user saves corrections to their Study queue. Multi-user with Supabase Auth (email magic link) and an email allowlist.

**Naming**: The user-facing surface for saved corrections is **Study** (nav label, methodology eyebrow). Component names (`WriteSheet`, `WriteList`, `WriteClient`) and the route (`/write`) are internal — kept stable, not renamed. The DB table and API path are `practice_items` / `/api/practice-items`. When you see `practice_items` in code, think "the data backing the Study surface". `written_down` is the DB column for the Studied state — not renamed.

## Tech Stack

- **Next.js 14 App Router**, TypeScript, Tailwind CSS — hosted on Vercel
- **Supabase** (PostgreSQL via `@supabase/supabase-js` v2 + `@supabase/ssr` for Auth)
- **Cloudflare R2** via `@aws-sdk/client-s3` (S3-compatible)
- **AssemblyAI** SDK — transcription + speaker diarization
- **Gemini Multimodal Live API** (raw WebSocket) — real-time voice on `/`. Both modes use `models/gemini-3.1-flash-live-preview`. Constants in `lib/voice-agent.ts`: `FLASH_LIVE_MODEL` (current), `NATIVE_AUDIO_MODEL` (opt-in); pass via `ConnectOptions.model`
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
  page.tsx                        # RSC: auth check, hands to <PractiseClient> — Practise mode picker + in-place voice session host
  review/
    page.tsx                      # RSC: loads sessions, hands to <ReviewClient> — inbox of recorded conversations
    loading.tsx                   # Skeleton
  login/page.tsx                  # Magic-link login (public)
  access-denied/page.tsx          # Shown when email not in allowlist (public)
  onboarding/page.tsx             # First-login gate: language select (step 0). `?step=2` = WhatsApp share illustration
  auth/callback/page.tsx          # Client page: code exchange → redirects to / or /onboarding
  sessions/[id]/
    page.tsx                      # RSC: loads SessionDetail, hands to <TranscriptClient>
    loading.tsx                   # Skeleton
    status/page.tsx               # Processing Status screen
    identify/page.tsx             # Speaker Identification screen
  write/page.tsx                  # RSC: loads practice items, hands to <WriteClient> — labelled "Study" in nav
  write/loading.tsx               # Skeleton
  settings/page.tsx               # Settings: language, theme, sign-out, version
  share-target/page.tsx           # PWA Web Share Target receiver
  loading.tsx                     # Global Next.js loading boundary
  api/                            # All API routes (Next.js route handlers)
hooks/
  usePushNotifications.ts         # Web Push registration hook (used by status page)
components/
  AppHeader.tsx                   # Top nav bar with hamburger + theme toggle
  NavDrawer.tsx                   # Slide-out nav drawer — pulls from NAV_TABS in nav-tabs.tsx
  BottomNav.tsx                   # Mobile bottom tab bar (Practise/Review/Study/Settings)
  ConditionalNav.tsx              # Composes AppHeader + NavDrawer + BottomNav
  NavProgress.tsx                 # Top-of-page hairline progress bar during RSC nav
  nav-tabs.tsx                    # NAV_TABS array — shared by NavDrawer + BottomNav
  MethodologyEyebrow.tsx          # Numbered step rail (1·2·3 → Practise · Review · Study) — on /, /review, /write
  OnboardingStep.tsx              # Shared wizard chrome (back / wordmark+dots / skip-or-close + CTA row)
  WhatsAppShareIllustration.tsx   # Animated phone-frame mock for share deep-dive
  Wordmark.tsx                    # CONVERSATION COACH wordmark
  ThemeProvider.tsx               # Dark/light theme context
  ThemeToggle.tsx                 # Theme switcher button
  FontSizeProvider.tsx            # User-controllable font scale
  LanguageProvider.tsx            # UI language context with live switching
  PractiseClient.tsx              # Client island for / — mode picker (call/chat/share) + share-target pickup; mounts <PracticeClient> in place
  PracticeClient.tsx              # Voice session UI (5-min Gemini Live) — mounted by <PractiseClient>; calls onExit() to return to doors
  ReviewClient.tsx                # Client island for /review — inbox of recorded conversations
  AudioReactiveDots.tsx           # Voice-reactive bouncing dots — exports VoiceTickCallback
  SpeakerCard.tsx                 # Identify-screen speaker option card (radio + transcript snippet)
  StatusPageMenu.tsx              # In-flight Status page header delete button
  ProcessingGraphic.tsx           # Decorative SVG inside PipelineStatus
  LoadingScreen.tsx               # Full-bleed centered spinner
  SessionList.tsx                 # Session rows — swipe left=delete (5s undo), swipe right=toggle read; react-swipeable
  DashboardInProgress.tsx         # In-flight sessions strip — rendered by ReviewClient
  DashboardReminders.tsx          # Write-down count widget (ReviewClient empty/quiet states)
  DashboardRecentSessions.tsx     # Recent sessions list with delete + read toggle
  TranscriptClient.tsx            # Client island for /sessions/[id]
  TranscriptView.tsx              # Paragraph-aware transcript renderer
  AnnotatedText.tsx               # Renders a text slice with inline highlights; accepts offsetBase
  ExplainSheet.tsx                # Docked sheet for flashcard-style explanation
  InlineEdit.tsx                  # Tap-to-rename input with save/cancel; used for session titles
  PipelineStatus.tsx              # Processing status rail (upload→transcribe→identify→analyse)
  ScrollToTopOnNavigate.tsx       # Resets scroll position on route change
  WriteClient.tsx                 # Client island for /write — wraps WriteList
  AnnotationCard.tsx              # Single annotation row in transcript — triggers AnnotationSheet
  AnnotationSheet.tsx             # Docked review panel for transcript corrections — wraps DockedSheet
  WriteSheet.tsx                  # Docked review sheet for Write items — wraps DockedSheet
  WriteList.tsx                   # The Write surface: queue of saved corrections + Written archive link
  Icon.tsx                        # Shared inline-SVG icon set (Phosphor default)
  # Shared UI primitives — prefer these over inlining:
  Button.tsx                      # `<Button>` + `buttonStyles()` — import buttonStyles for non-button elements needing button appearance
  LogoMark.tsx                    # Robot logo mark — body fill adapts to theme via --color-surface
  IconButton.tsx                  # Square/circle icon-only button
  Skeleton.tsx                    # `<Skeleton>` + `<SkeletonRow>` for loading.tsx boundaries
  CorrectionInContext.tsx         # "Sentence with strike-and-rewrite" treatment (WriteList row fallback only — do not remove)
  HushStack.tsx                   # Sheet-body "eyebrow + italic struck original + large serif answer" — shared by AnnotationCard + WriteSheet
  StrikeOriginal.tsx              # Standalone "wrong → right" treatment (empty-state example)
  ImportancePill.tsx              # "High priority" / "Worth remembering" pill
  NavHint.tsx                     # First-open chevron-swipe cue inside DockedSheet
  Toast.tsx                       # Floating bottom-anchored alert pill — uses --toast-bottom
  DockedSheet.tsx                 # Sheet shell (bottom mobile, right desktop) — chrome, animation, focus, swipe, keys
  Modal.tsx                       # Centered dialog with scrim — only use when action is genuinely modal
  FlashcardRow.tsx                # Canonical Study row: italic native prompt top, serif target answer bottom, [[brackets]] tinted
  ...                             # Other shared components
lib/
  types.ts                        # All shared TypeScript types
  auth.ts                         # getAuthenticatedUser() — header fast-path + cookie fallback, React cache()
  loaders.ts                      # Canonical SQL queries shared by RSCs and API routes
  i18n.ts                         # t() translation function + TRANSLATIONS dict
  push.ts                         # sendPushNotification helper
  dashboard-summary.ts            # computeDashboardSummary() → { writeDownCount, ... }
  supabase-server.ts              # Supabase client for server components/routes
  supabase-browser.ts             # Supabase client for client components
  audio-upload.ts                 # ACCEPTED_TYPES, ACCEPTED_EXTENSIONS, MAX_BYTES — import from here, don't duplicate
  theme-meta.ts                   # PWA status-bar color constants
  r2.ts                           # presignedUploadUrl, deleteObject
  pipeline.ts                     # orchestrates status transitions and DB writes
  assemblyai.ts                   # createJob, cancelJob, parseWebhook, getParagraphs, mapParagraphsToSegments
  claude.ts                       # analyseUserTurns — prompt + JSON parse
  voice-agent.ts                  # Gemini Live WebSocket: connect(targetLanguage, callbacks, options), buildPracticeSystemPrompt()
  persona.ts                      # Call-mode persona generator: JS pre-picks name/voice axes, Claude writes opener + system addendum
  ringtone.ts                     # playRingtone() — synthesised PSTN ringtone for incoming call screen; returns { stop }
  flashcard.ts                    # parseFlashcard() — splits [[bracket]] pairs for FlashcardRow tint
  logger.ts                       # `log` structured logger — JSON lines; log.error → stderr, others → stdout
middleware.ts                     # Auth guard + ALLOWED_EMAILS allowlist + identity-header passthrough
supabase/migrations/              # SQL migrations
__tests__/                        # Vitest tests mirroring src structure
```

## Processing Pipeline

`uploading → transcribing → identifying → analysing → ready` (or `error` at any stage).

1. Client uploads audio to R2 via presigned URL → calls `POST /api/sessions/:id/upload-complete`
2. Server triggers AssemblyAI job; webhook at `/api/webhooks/assemblyai` fires when done
3. 2 speakers detected: status → `identifying` (waiting for speaker label)
4. 1 speaker detected: `user_speaker_labels` set to `["A"]`, skips to `analysing`
5. Speaker label submitted via `POST /api/sessions/:id/speaker` → triggers Claude analysis
6. Claude returns structured JSON annotations; audio deleted from R2; status → `ready`

Re-analysis via `POST /api/sessions/:id/analyse` deletes all annotations and re-runs Claude. **Practice items are NOT touched** — flashcards survive regeneration. Confirm dialog copy: `reanalyse.body` in `lib/i18n.ts`.

## Key Design Decisions

- **Universal viewport sizing**: Use `100dvh`, never `100vh`. `100vh` resolves to the large mobile viewport (browser chrome excluded) — produces a phantom scrollbar when chrome is visible. Body: `min-h-[100dvh] flex flex-col`, outer `<main>`: `flex-1 flex flex-col`.

- **Single skip-to-content target**: `app/layout.tsx` owns the only `<main id="main-content">`. Client islands MUST use `<div>` as their root — nested `<main>` elements produce invalid HTML and break the skip target.

- **Voice session UI** (`components/PracticeClient.tsx`): 5-min Gemini Live session mounted in place on `/` by `<PractiseClient>`. No standalone route. Props: `{ mode: 'call' | 'chat', targetLanguage, onExit }`. State machine: `incoming → connecting → active/warning/ending → review → analysing → ready`. Call mode opens on `incoming` (iOS-style ring, persona revealed after first greeting). Reroll routes through `incoming` — every new caller goes through Answer/Decline. Review state gates the POST; user picks Save or Discard before any network call. POSTs to `/api/practice-sessions`; success redirects to `/sessions/[id]`.

- **Call mode = learner-answers-first** (`lib/persona.ts` + `components/PracticeClient.tsx`): After tapping Answer, agent stays silent until learner greets. Persona's `opener` is delivered as a reply to that greeting. Active screen shows "Your turn — say hello" cue until first user turn. Chat mode skips `incoming`, starts at `connecting`.

- **Voice accent steered by system prompt, not API config** (`lib/voice-agent.ts`): Gemini Live's `speech_config.language_code` doesn't support `en-NZ` or `es-AR` — omit it entirely. `buildPracticeSystemPrompt` MUST: (1) name the target accent explicitly, (2) forbid drift targets by name ("never American", "nunca castellano"), (3) reinforce as durable across every turn. Include concrete dialect features (NZ vowel shift; Rioplatense sheísmo: "yo" → "sho"). Tests in `__tests__/lib/voice-agent.test.ts` guard all three rails — keep them green.

- **Incoming-call ringtone is synthesised** (`lib/ringtone.ts`): PSTN-style two-sine tone (440Hz + 480Hz), 1.5s-on/1.5s-off envelope. No audio asset. Returns `{ stop }` handle; stop ramps gain before teardown to avoid clicks. Degrades silently if AudioContext blocked.

- **Server-rendered pages, client islands**: RSC pages fetch data via `lib/loaders.ts` then hand to one client island. Home (`/`) is auth-only RSC, no DB load. New pages: put SQL in `lib/loaders.ts` so API route and RSC share one query.

- **Practise-as-home + methodology vocabulary**: Methodology is **Practise → Review → Study**. `/` = Practise (mode picker), `/review` = Review inbox, `/write` = Study (URL kept for stability). `<MethodologyEyebrow>` renders numbered step rail on all three surfaces. No `/practice` route — voice session mounts in place on `/`.

- **Auth header passthrough**: `middleware.ts` is the single trust boundary — calls `supabase.auth.getUser()` once, forwards identity via `x-cc-user-id` / `x-cc-user-email` / `x-cc-user-target-language`. `getAuthenticatedUser()` reads headers (zero network calls), wrapped in React `cache()`. Middleware strips incoming `x-cc-*` headers before setting its own.

- **Auth**: Supabase Auth (email magic link). Middleware guards all routes except `/login`, `/auth`, `/access-denied`, `/api/webhooks`. `ALLOWED_EMAILS` env var controls access.

- **Magic-link uses PKCE flow**: `@supabase/ssr` v0.9+ hardcodes PKCE inside `createBrowserClient`. `app/auth/callback/page.tsx` is a client component; `detectSessionInUrl` handles code exchange, then `router.refresh()` before `router.replace()` to flush stale Next.js router-cache redirects.

- **Next.js router cache + middleware auth**: Nav `<Link>` prefetches from unauthenticated routes hit middleware, return 307s, and get cached — causing login loops. Fix: add unauthenticated routes to `HIDDEN_ON` in `ConditionalNav.tsx`; call `router.refresh()` before `router.replace()` in `auth/callback/page.tsx`.

- **Middleware must return `supabaseResponse`**: Token refreshes write cookies to `supabaseResponse`. Returning a new `NextResponse.next()` discards those cookies — session silently breaks. Re-append cookies when rebuilding the response.

- **Middleware matcher must exclude public static assets**: Currently excluded: `_next/static`, `_next/image`, `favicon.ico`, `logo.svg`, `icon.svg`, `manifest.json`, `sw.js`, `icons/`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`. Add new public assets here or they 307-redirect unauthenticated users.

- **API auth pattern**: Call `getAuthenticatedUser()` and chain `.eq('user_id', user.id)` on all Supabase queries. Webhook route excluded.

- **i18n**: Use `t(key, lang)` from `lib/i18n.ts` for all UI strings. No raw string literals in components. UI language inferred from `targetLanguage` (`en-NZ` → `es` UI).

- **Theme**: Use semantic CSS tokens (`bg-background`, `text-foreground`, `bg-surface`, etc.) from `globals.css` — never hardcode Tailwind gray classes.

- **Practice items, no scheduler (yet)**: FSRS columns (`fsrs_state`, `due`, `stability`, …) from migration `20260410`. `ts-fsrs` installed. Do not remove either.

- **Icon system: Phosphor is the default**: `components/Icon.tsx` inlines SVG paths from `@phosphor-icons/core`. When adding: copy path from [Phosphor catalog](https://phosphoricons.com/) at regular weight (+ fill weight for active-state swap). Fill-based glyphs use `{ node, viewBox: '0 0 256 256' }` form with `fill="currentColor" stroke="none"`. One-off deviations only for brand marks or genuinely missing glyphs.

- **Docked sheet pattern**: Use `DockedSheet` for any new sheet (bottom mobile, right desktop). `AnnotationSheet` and `WriteSheet` are reference implementations — do not reach for `Modal`. Sheet is `z-40`, BottomNav `z-30` — sheet draws over nav on mobile. Scrim on mobile only; no scrim on desktop so transcript stays visible. `role="dialog"` always; `aria-modal` + focus trap on mobile only via `matchMedia('(max-width: 767px)')`. Sheet body uses `<HushStack>`: eyebrow + italic struck original + large serif answer. Eyebrow: `"You said"` (grammar) or `"Sounds off"` (naturalness, `correction === null`).

- **`<NavHint>` cue**: One-shot first-open chip teaching chevron/swipe nav. Shared localStorage key `cc:sheet-nav-hint:v1` across annotation + write sheets — dismisses both.

- **Login provider persistence**: Stores last-used email at `cc:login-email` and provider at `cc:login-provider` (`'google' | 'email'`). Magic-link writes from `app/login/page.tsx`; Google OAuth writes from `app/auth/callback/page.tsx`. Renders provider-appropriate "Continue as" pill. "Use a different account" clears both keys.

- **Importance scoring**: `annotations.importance_score` (1–3) written by Claude, surfaced via `<ImportancePill>`. Score 3 → "High priority"; 2 → "Worth remembering"; 1 suppressed. Sort opt-in via `?sort=importance` on `GET /api/practice-items`.

- **Annotation unhelpful flag** (`annotations.is_unhelpful` + `unhelpful_at`, migration `20260419`): Toggled via `PATCH /api/annotations/:id`. Use only for unhelpful signal — not for UX state.

- **Session unread state** (`sessions.last_viewed_at`, migration `20260419`): NULL = unread, timestamp = read. Auto-set on first `/sessions/[id]` view via `POST /api/sessions/:id/view`. Powers `/review` unread filter.

- **Session type field** (`sessions.session_type`, migration `20260511`): `'upload' | 'voice_practice'`. Set at creation; do not infer.

- **Persona system for call mode** (`lib/persona.ts`): JS pre-picks name/voice/gender/age axes via `Math.random()` — Claude (Haiku) writes opener + system addendum only. Voice gender is a HARD constraint; age is SOFT. `VOICE_CATALOG` is the curated voice list — extend it there.

- **Study page = Study queue ↔ Studied archive** (`/write`): Defaults to `!written_down` (pending queue). Studied archive behind footer pill (`<ArchiveFooterLink>`), visible only when `writtenCount > 0`. Trailing tap on rows marks item Studied without opening sheet (`written_down = true`). Delete is optimistic with 5s undo — `DELETE` fires after timer expires.

- **Study row content priority** (`components/WriteList.tsx`): (1) `<FlashcardRow>` when both flashcard fields present; (2) `<CorrectionInContext>` for older items without flashcard fields; (3) `<StrikeOriginal>` fallback. Sheet body always uses `<HushStack>`.

- **`<FlashcardRow>`** (`components/FlashcardRow.tsx`): `flashcard_front` = italic native sentence (top); `flashcard_back` = Source Serif 4 target sentence (bottom), bracketed phrase tinted. Front = what user reads to orient; back = phrase being learned. Parsed via `lib/flashcard.ts` (`parseFlashcard`).

- **Onboarding**: `?step=0` (default) = language picker → pushes to `/?welcome=true`. `?step=2` = WhatsApp share illustration. Other values clamp to step 2.

- **Tutorial illustrations** (`app/globals.css`): Reuse `oa-*` keyframes (`oa-touch`, `oa-sheet`, `oa-backdrop`, `oa-pulse`) — all use `animation-fill-mode: both` so reduced-motion users see a complete teaching frame.

- **Share-target uploads go straight to status screen**: SW stores file in IndexedDB, redirects to `/`. `<PractiseClient>` picks it up, POSTs to `/api/sessions`, pushes to `/sessions/[id]/status`. R2 upload runs fire-and-forget.

- **Structured logging**: Use `log` from `lib/logger.ts`, not `console.*`. JSON lines; `log.error` → stderr.

- **Audio is temporary**: R2 audio deleted after AssemblyAI transcription completes.

- **Speaker ID every session**: No automatic voice matching. User picks every time.

- **Paragraph grouping** (`transcript_segments.paragraph_breaks`): `int[]` of char offsets where paragraphs begin (offset 0 implicit, never stored). `TranscriptView` splits on offsets; `AnnotatedText` accepts `offsetBase`. Annotations spanning a break are filtered with `log.warn`.

- **Gemini Live binary frames**: All WebSocket frames are binary (ArrayBuffer) — control messages AND audio. Try UTF-8 JSON decode first; treat failures as PCM16. Use `realtime_input.audio` (not deprecated `media_chunks`).

- **Gemini AI Studio vs Vertex model names**: Use AI Studio endpoint (`generativelanguage.googleapis.com/.../v1alpha`). Model names differ from Vertex — wrong name causes WebSocket to silently close before `setupComplete`. `enableAffectiveDialog` is Vertex-only; omit it.

- **Voice-agent close-before-ready**: Pre-`setupComplete` closes call `onError(...)`, not `onStateChange('ended')`. 15s setup timeout as defence in depth.

- **Annotations use character offsets**: `start_char`/`end_char` are offsets within `segment.text`.

- **`PATCH /api/sessions/:id` accepts `title` only**.

- **`POST /api/sessions/:id/retry`**: Only valid for `transcribing` error stage. Use `/analyse` for analysis errors.

- **Webhook HMAC**: AssemblyAI webhook verifies `x-assemblyai-signature` (HMAC-SHA256). Unknown job IDs discarded silently.

- **Push notifications**: `POST /api/push-subscription` stores subscriptions. Analysis completion triggers push.

## Claude Prompt Requirements

`analyseUserTurns` in `lib/claude.ts` accepts `targetLanguage: TargetLanguage = 'es-AR'`, selects from `PROMPTS` keyed by language. Must:
- Target correct register (default: Argentinian Spanish, Rioplatense, voseo)
- Return structured JSON array of annotation objects matching `annotations` schema
- Include: `segment_id`, `type`, `sub_category`, `original`, `start_char`, `end_char`, `correction`, `explanation`
- `sub_category` must be one of 13 values in `SUB_CATEGORIES` (`lib/types.ts`); validated against `SUB_CATEGORY_TYPE_MAP` in pipeline
- Include per annotation: `flashcard_front` (English sentence with `[[correct phrase]]`), `flashcard_back` (Spanish sentence with `[[correct form]]`), `flashcard_note` (1–2 sentences from Rioplatense register perspective)

## Data Flow Gotchas

- **Pipeline writes to `annotations` only.** `practice_items` created by user clicking "Add to practice" — never auto-created.
- **`POST /api/practice-items` does bare `insert(body)`** — new fields stored automatically; no route change needed.
- **`GET /api/practice-items` and `/write` RSC both call `loadPracticeItems()`** in `lib/loaders.ts`. Add columns to the `select` string there, not in the API route.
- **`router.back()` unreliable in PWA/Safari** when `history.length === 1`. Use `<Link href="/">`.
- **`react-swipeable` installed** — `import { useSwipeable }` directly.
- **Navigation in two places**: `NavDrawer` + `BottomNav`, both from `NAV_TABS` in `nav-tabs.tsx`.
- **`written_down` on `practice_items`**: Study queue = `!written_down`; Studied archive = `written_down`. View state is client-only.
- **`ts-fsrs` installed but unused**: FSRS columns reserved for future SRS — do not remove.

## Performance Patterns

- **One auth call per request**: `getAuthenticatedUser()` reads headers (zero network calls). Don't call `supabase.auth.getUser()` in pages or API routes.
- **RSC data fetching, no client waterfalls**: Use `lib/loaders.ts` + parent RSC instead of `useEffect(() => fetch(...), [])`. Polling is the exception (`ReviewClient` watches in-flight uploads — `setTimeout` chain, 3s base, 1.5x backoff, 30s cap, paused on hidden tabs).
- **`<NavProgress>` fills the click→paint gap**: Top-of-page hairline starts on link click, finishes on `pathname` change.

## Supabase CLI

```bash
supabase db query --linked "<sql>"                         # run SQL against remote
supabase db push                                           # apply pending migrations
supabase migration list                                    # check migration status
supabase migration repair --status applied <version>       # register manually-applied migration
```

## Environment Variables

See `.env.local.example` for all required keys:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `ASSEMBLYAI_API_KEY`, `ASSEMBLYAI_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `GOOGLE_API_KEY` — Gemini Live (server-only, returned auth-gated via `/api/voice-token`)
- `NEXT_PUBLIC_GOOGLE_VOICE` — Gemini prebuilt voice name (optional, default `Aoede`)
- `ALLOWED_EMAILS` — comma-separated allowlist
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT`
- `APP_URL` — public URL for AssemblyAI webhooks (use ngrok for local dev)
- `NEXT_PUBLIC_BUILD_DATE`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` — injected at build time; do not set manually

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-state vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root (neither created yet; proceed silently). See `docs/agents/domain.md`.
