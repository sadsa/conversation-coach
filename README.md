# Conversation Coach

Analyze recorded Spanish conversations and get targeted feedback on grammar, naturalness, and strengths — tuned to Rioplatense/Argentinian Spanish (voseo, lunfardo, casual register).

Upload an audio file, identify your voice, and receive an annotated transcript with inline highlights and a personal practice list.

## Tech Stack

- **Framework**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Audio storage**: Cloudflare R2 (temporary — deleted after transcription)
- **Transcription**: AssemblyAI (speaker diarization)
- **Analysis**: Claude claude-sonnet-4-6 (Rioplatense-tuned)
- **Tests**: Vitest + React Testing Library

## Prerequisites

- Node.js 18+
- Supabase project
- Cloudflare R2 bucket with public URL enabled
- AssemblyAI account
- Anthropic API key

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Configure environment**

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API key |
| `ASSEMBLYAI_WEBHOOK_SECRET` | Shared secret for webhook HMAC verification |
| `APP_URL` | Public app URL (required for AssemblyAI webhook callbacks) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 access key |
| `R2_SECRET_ACCESS_KEY` | R2 secret key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | Public base URL for R2 bucket |

**3. Run database migrations**

Apply `supabase/migrations/001_initial.sql` to your Supabase project via the dashboard or Supabase CLI.

**4. Expose localhost for webhooks**

AssemblyAI requires a publicly reachable URL to deliver transcription results. Run an ngrok tunnel in a separate terminal:

```bash
ngrok http 3000
```

Copy the forwarding URL (e.g. `https://abc123.ngrok-free.app`) and set it in `.env.local`:

```
APP_URL=https://abc123.ngrok-free.app
```

Restart the dev server after updating `APP_URL`.

**5. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. **Upload** — Drag or browse an MP3, M4A, or WAV file (max 500 MB), optionally set a title
2. **Wait** — AssemblyAI transcribes and diarizes (~1.5× audio duration)
3. **Identify** — Click "That's me" on your speaker (skipped for single-speaker recordings)
4. **Review** — Read annotated transcript with inline highlights:
   - Red underline = grammar error
   - Yellow underline = naturalness suggestion
   - Green underline = strength to keep
5. **Practice** — Browse saved practice items at `/practice`, filter by type, mark as reviewed

## Pipeline

```
Upload → R2 (presigned URL)
  → POST /api/sessions/:id/upload-complete
  → AssemblyAI transcription job
  → Webhook: /api/webhooks/assemblyai
  → [2 speakers] status: identifying → user picks speaker
  → [1 speaker]  auto-assign label A, skip to analysis
  → Claude analysis (user turns only)
  → Annotations + practice items saved to DB
  → Audio deleted from R2
  → status: ready
```

**Error recovery**: Each stage exposes a retry endpoint. Failed sessions show a retry button in the UI.

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/sessions` | Create session, get R2 upload URL |
| `GET` | `/api/sessions` | List all sessions |
| `GET` | `/api/sessions/:id` | Session detail with transcript + annotations |
| `PATCH` | `/api/sessions/:id` | Update session title |
| `GET` | `/api/sessions/:id/status` | Poll processing status |
| `POST` | `/api/sessions/:id/upload-complete` | Trigger transcription after upload |
| `POST` | `/api/sessions/:id/upload-failed` | Record upload failure |
| `POST` | `/api/sessions/:id/speaker` | Set user speaker label |
| `POST` | `/api/sessions/:id/retry` | Retry failed upload or transcription stage |
| `POST` | `/api/sessions/:id/analyse` | (Re-)trigger Claude analysis |
| `POST` | `/api/webhooks/assemblyai` | AssemblyAI callback (HMAC-SHA256 verified) |
| `GET` | `/api/practice-items` | List practice items (`?type=grammar&reviewed=false`) |
| `POST` | `/api/practice-items` | Create practice item |
| `PATCH` | `/api/practice-items/:id` | Update reviewed status |
| `DELETE` | `/api/practice-items/:id` | Delete practice item |

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run all tests once
npm run test:watch   # Watch mode
```

## Design Notes

- **No authentication** — single-user app; all API routes are intentionally unprotected
- **Audio is temporary** — deleted from R2 immediately after transcription completes
- **Annotations use character offsets** — `start_char`/`end_char` within segment text for precise inline rendering
- **Practice items are denormalized** — full copy of annotation data so items survive re-analysis
- **Speaker ID per session** — no automatic voice fingerprinting; user identifies themselves each time
- **Re-analysis** — available from the transcript view; replaces all annotations and re-runs Claude
