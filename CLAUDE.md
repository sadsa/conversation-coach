# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A personal Next.js web app for analysing recorded Spanish (Argentinian/Rioplatense) conversations. Upload audio → AssemblyAI transcribes and diarizes → Claude annotates the user's speech turns → save practice items. Single-user, no authentication.

## Tech Stack

- **Next.js 14 App Router**, TypeScript, Tailwind CSS — hosted on Vercel
- **Supabase** (PostgreSQL via `@supabase/supabase-js` v2)
- **Cloudflare R2** via `@aws-sdk/client-s3` (S3-compatible)
- **AssemblyAI** SDK — transcription + speaker diarization
- **Anthropic SDK** (`@anthropic-ai/sdk`) — Claude analysis
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
  page.tsx                        # Screen 1: Upload / Home
  sessions/[id]/
    page.tsx                      # Screen 4: Annotated Transcript
    status/page.tsx               # Screen 2: Processing Status
    identify/page.tsx             # Screen 3: Speaker Identification
  practice/page.tsx               # Screen 5: Practice Items
  insights/page.tsx               # Screen 6: Insights (sub-category mistake tracking)
  flashcards/page.tsx             # Screen 7: Flashcard review (filters practice items with non-null flashcard fields)
  settings/page.tsx               # Settings (font size preference, stored in localStorage)
  api/                            # All API routes (Next.js route handlers)
components/                       # Shared React components
lib/
  types.ts                        # All shared TypeScript types
  insights.ts                     # fetchInsightsData() — uses Supabase RPC
  supabase-server.ts              # Supabase client for server components/routes
  supabase-browser.ts             # Supabase client for client components
  r2.ts                           # presignedUploadUrl, deleteObject
  pipeline.ts                     # orchestrates status transitions and DB writes
  assemblyai.ts                   # createJob, cancelJob, parseWebhook
  claude.ts                       # analyseUserTurns — prompt + JSON parse
supabase/migrations/              # SQL migrations
__tests__/                        # Vitest tests mirroring src structure
```

## Processing Pipeline

The audio pipeline flows through these statuses: `uploading → transcribing → identifying → analysing → ready` (or `error` at any stage).

1. Client uploads audio directly to R2 via presigned URL, then calls `POST /api/sessions/:id/upload-complete`
2. Server triggers AssemblyAI job (`speakers_expected: 2`); webhook at `/api/webhooks/assemblyai` fires when done
3. If 2 speakers detected: status → `identifying` (paused, waiting for speaker label)
4. If 1 speaker detected: `user_speaker_label` set to `"A"`, goes straight to `analysing`
5. Speaker label submitted via `POST /api/sessions/:id/speaker` → triggers Claude analysis
6. Claude returns structured JSON annotations; practice items written to DB; audio deleted from R2; status → `ready`

Re-analysis via `POST /api/sessions/:id/analyse` replaces all annotations and annotation-derived practice items.

## Key Design Decisions

- **Insights use Supabase RPCs**: `fetchInsightsData()` in `lib/insights.ts` calls 3 RPC functions (defined in `supabase/migrations/20260322000001_insights_rpc.sql`). Add new insight queries as RPCs, not direct table queries.
- **Practice sub-category filter**: `?sub_category=<key>` URL param seeds the active pill on load. 14-pill row (All + 13 sub-categories), sorted by count, colour-coded. Linked from Insights "See all examples" cards.
- **Structured logging**: Use `log` from `lib/logger.ts` (not `console.*`) in API routes and pipeline. Outputs JSON lines; `log.error` → stderr, others → stdout. Note: `lib/claude.ts`, `lib/assemblyai.ts`, `lib/r2.ts` still use raw `console.*` (known gap).
- **Audio is temporary**: R2 audio is deleted after AssemblyAI completes transcription. No permanent audio storage.
- **No auth**: All API routes are intentionally unprotected (single-user app).
- **Speaker ID every session**: No automatic voice matching. The user picks their speaker every time via the identify screen.
- **Annotations use character offsets**: `start_char`/`end_char` are offsets within `segment.text`, used to render inline highlights.
- **`PATCH /api/sessions/:id` accepts `title` only**: All other session state is managed by server-side pipeline logic.
- **`POST /api/sessions/:id/retry`**: Only valid for `uploading` and `transcribing` error stages. Use `/analyse` for analysing errors.
- **Webhook HMAC**: AssemblyAI webhook verifies `x-assemblyai-signature` (HMAC-SHA256). Unknown job IDs are silently discarded (return 200).

## Claude Prompt Requirements

The `analyseUserTurns` function in `lib/claude.ts` must:
- Target Argentinian Spanish (Rioplatense register, voseo verb forms)
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
- **`BottomNav` uses a `TABS` array** in `components/BottomNav.tsx`. Add new nav tabs by inserting `{ href, label, exact, icon }` objects in the array.

## Environment Variables

See `.env.local.example` for all required keys:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `ASSEMBLYAI_API_KEY`, `ASSEMBLYAI_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
