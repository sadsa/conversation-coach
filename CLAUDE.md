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
  api/                            # All API routes (Next.js route handlers)
components/                       # Shared React components
lib/
  types.ts                        # All shared TypeScript types
  insights.ts                     # computeTrend(), fetchInsightsData() — uses Supabase RPC
  supabase-server.ts              # Supabase client for server components/routes
  supabase-browser.ts             # Supabase client for client components
  r2.ts                           # presignedUploadUrl, deleteObject
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

- **Insights use Supabase RPCs**: `fetchInsightsData()` in `lib/insights.ts` calls 4 RPC functions (defined in `supabase/migrations/20260322000001_insights_rpc.sql`). Add new insight queries as RPCs, not direct table queries.
- **Practice sub-category filter**: `?sub_category=<key>` URL param; active filter shown as chip. Clicking a type tab clears it. Linked from Insights "See all examples" cards.
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
- Annotate grammar errors, naturalness suggestions, and strengths
- Include `segment_id`, `type`, `sub_category`, `original`, `start_char`, `end_char`, `correction` (null for strengths), `explanation`
- `sub_category` must be one of the 16 values in `SUB_CATEGORIES` (lib/types.ts); validated against `SUB_CATEGORY_TYPE_MAP` in pipeline

## Environment Variables

See `.env.local.example` for all required keys:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- `ASSEMBLYAI_API_KEY`, `ASSEMBLYAI_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
