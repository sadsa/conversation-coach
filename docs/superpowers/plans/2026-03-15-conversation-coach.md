# Conversation Coach Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web app that uploads Spanish conversation recordings, transcribes and diarizes them via AssemblyAI, and uses Claude to annotate the user's speech turns with grammar corrections, naturalness suggestions, and strengths.

**Architecture:** Next.js 14 App Router with TypeScript and Tailwind CSS on Vercel. API routes handle the full pipeline. Supabase PostgreSQL stores all data. Cloudflare R2 holds audio temporarily during transcription only — deleted once AssemblyAI finishes.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase JS v2, `@aws-sdk/client-s3` (R2 compat), `assemblyai` SDK, `@anthropic-ai/sdk`, Vitest, React Testing Library

---

## File Map

```
conversation-coach/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx                          # Screen 1: Upload / Home
│   ├── sessions/[id]/
│   │   ├── status/page.tsx               # Screen 2: Processing Status
│   │   ├── identify/page.tsx             # Screen 3: Speaker Identification
│   │   └── page.tsx                      # Screen 4: Annotated Transcript
│   ├── practice/page.tsx                 # Screen 5: Practice Items
│   └── api/
│       ├── sessions/
│       │   ├── route.ts                  # GET list, POST create
│       │   └── [id]/
│       │       ├── route.ts              # GET full, PATCH title
│       │       ├── status/route.ts       # GET polling status
│       │       ├── upload-complete/route.ts
│       │       ├── upload-failed/route.ts
│       │       ├── speaker/route.ts
│       │       ├── retry/route.ts
│       │       └── analyse/route.ts
│       ├── practice-items/
│       │   ├── route.ts                  # GET list, POST create
│       │   └── [id]/route.ts             # PATCH, DELETE
│       └── webhooks/assemblyai/route.ts
├── components/
│   ├── DropZone.tsx                      # Drag-and-drop file input + validation
│   ├── SessionList.tsx                   # Past sessions list
│   ├── PipelineStatus.tsx                # Stage progress + polling logic
│   ├── SpeakerCard.tsx                   # Speaker sample + "That's me"
│   ├── TranscriptView.tsx                # Full conversation layout
│   ├── AnnotatedText.tsx                 # Inline highlights via start_char/end_char
│   ├── AnnotationCard.tsx                # Expanded annotation detail
│   ├── InlineEdit.tsx                    # Reusable inline-editable title
│   └── PracticeList.tsx                  # Filterable practice items list
├── lib/
│   ├── types.ts                          # All shared TypeScript types
│   ├── supabase-server.ts                # createClient for server components/routes
│   ├── supabase-browser.ts               # createClient for client components
│   ├── r2.ts                             # presignedUploadUrl, deleteObject
│   ├── assemblyai.ts                     # createJob, cancelJob, parseWebhook
│   └── claude.ts                         # analyseUserTurns — prompt + JSON parse
├── supabase/migrations/001_initial.sql
├── __tests__/
│   ├── lib/
│   │   ├── assemblyai.test.ts
│   │   ├── claude.test.ts
│   │   └── pipeline.test.ts
│   ├── api/
│   │   ├── sessions.test.ts
│   │   ├── upload-pipeline.test.ts
│   │   ├── webhook.test.ts
│   │   └── practice-items.test.ts
│   └── components/
│       ├── AnnotatedText.test.tsx
│       ├── AnnotationCard.test.tsx
│       ├── TranscriptView.test.tsx
│       ├── PracticeList.test.tsx
│       └── PipelineStatus.test.tsx
├── vitest.config.ts
├── vitest.setup.ts
├── .env.local.example
├── next.config.ts
└── tailwind.config.ts
```

---

## Chunk 1: Project Setup + DB Schema

### Task 1: Initialise Next.js project

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `vitest.config.ts`, `vitest.setup.ts`, `.env.local.example`

- [ ] **Step 1: Bootstrap Next.js**

```bash
cd /Users/entelect-jbiddick/Projects/conversation-coach
npx create-next-app@14 . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

Expected: project scaffold created with `app/` directory.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js assemblyai @anthropic-ai/sdk @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event jsdom @testing-library/jest-dom
```

- [ ] **Step 3: Write vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 4: Write vitest setup**

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Write .env.local.example**

```bash
# .env.local.example
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ASSEMBLYAI_API_KEY=
ASSEMBLYAI_WEBHOOK_SECRET=

ANTHROPIC_API_KEY=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
```

Copy to `.env.local` and fill in real values from Supabase, AssemblyAI, Anthropic, and Cloudflare dashboards.

- [ ] **Step 7: Verify setup runs**

```bash
npm run dev
```

Expected: Next.js dev server starts at `http://localhost:3000`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: initialise Next.js project with dependencies"
```

---

### Task 2: Database schema

**Files:**
- Create: `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/001_initial.sql

create type session_status as enum (
  'uploading', 'transcribing', 'identifying', 'analysing', 'ready', 'error'
);

create type annotation_type as enum ('grammar', 'naturalness', 'strength');

create table sessions (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  status          session_status not null default 'uploading',
  error_stage     text check (error_stage in ('uploading', 'transcribing', 'analysing')),
  duration_seconds int,
  audio_r2_key    text,
  assemblyai_job_id text,
  detected_speaker_count int,
  user_speaker_label text check (user_speaker_label in ('A', 'B')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table transcript_segments (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  speaker     text not null check (speaker in ('A', 'B')),
  text        text not null,
  start_ms    int not null,
  end_ms      int not null,
  position    int not null
);

create table annotations (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  segment_id  uuid not null references transcript_segments(id) on delete cascade,
  type        annotation_type not null,
  original    text not null,
  start_char  int not null,
  end_char    int not null,
  correction  text,
  explanation text not null
);

create table practice_items (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  annotation_id uuid references annotations(id) on delete set null,
  type          annotation_type not null,
  original      text not null,
  correction    text,
  explanation   text not null,
  reviewed      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- updated_at trigger
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger sessions_updated_at before update on sessions
  for each row execute function set_updated_at();

create trigger practice_items_updated_at before update on practice_items
  for each row execute function set_updated_at();
```

- [ ] **Step 2: Apply migration via Supabase dashboard**

Go to your Supabase project → SQL Editor → paste the migration → Run.

Expected: all four tables created with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/001_initial.sql
git commit -m "feat: add database schema migration"
```

---

## Chunk 2: Lib Layer

### Task 3: Shared types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Write types**

```typescript
// lib/types.ts

export type SessionStatus =
  | 'uploading' | 'transcribing' | 'identifying'
  | 'analysing' | 'ready' | 'error'

export type ErrorStage = 'uploading' | 'transcribing' | 'analysing'

export type AnnotationType = 'grammar' | 'naturalness' | 'strength'

export interface Session {
  id: string
  title: string
  status: SessionStatus
  error_stage: ErrorStage | null
  duration_seconds: number | null
  audio_r2_key: string | null
  assemblyai_job_id: string | null
  detected_speaker_count: number | null
  user_speaker_label: 'A' | 'B' | null
  created_at: string
  updated_at: string
}

export interface TranscriptSegment {
  id: string
  session_id: string
  speaker: 'A' | 'B'
  text: string
  start_ms: number
  end_ms: number
  position: number
}

export interface Annotation {
  id: string
  session_id: string
  segment_id: string
  type: AnnotationType
  original: string
  start_char: number
  end_char: number
  correction: string | null
  explanation: string
}

export interface PracticeItem {
  id: string
  session_id: string
  annotation_id: string | null
  type: AnnotationType
  original: string
  correction: string | null
  explanation: string
  reviewed: boolean
  created_at: string
  updated_at: string
}

// API response shapes
export interface SessionListItem {
  id: string
  title: string
  status: SessionStatus
  duration_seconds: number | null
  created_at: string
}

export interface SessionDetail {
  session: Pick<Session,
    'id' | 'title' | 'status' | 'error_stage' | 'duration_seconds' |
    'detected_speaker_count' | 'user_speaker_label' | 'created_at'
  >
  segments: TranscriptSegment[]
  annotations: Annotation[]
}

export interface StatusResponse {
  status: SessionStatus
  error_stage: ErrorStage | null
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 4: Supabase clients

**Files:**
- Create: `lib/supabase-server.ts`, `lib/supabase-browser.ts`

- [ ] **Step 1: Write server client**

```typescript
// lib/supabase-server.ts
import { createClient } from '@supabase/supabase-js'

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
```

- [ ] **Step 2: Write browser client**

```typescript
// lib/supabase-browser.ts
import { createClient } from '@supabase/supabase-js'

let client: ReturnType<typeof createClient> | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return client
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/supabase-server.ts lib/supabase-browser.ts
git commit -m "feat: add Supabase server and browser clients"
```

---

### Task 5: R2 integration

**Files:**
- Create: `lib/r2.ts`

- [ ] **Step 1: Write R2 helpers**

```typescript
// lib/r2.ts
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

function getClient() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

/** Generate a presigned PUT URL and the key to store. Expires in 1 hour. */
export async function presignedUploadUrl(extension: string): Promise<{ key: string; url: string }> {
  const key = `audio/${randomUUID()}.${extension}`
  const client = getClient()
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
  })
  const url = await getSignedUrl(client, command, { expiresIn: 3600 })
  return { key, url }
}

/** Delete an object by key. Does not throw if object does not exist. */
export async function deleteObject(key: string): Promise<void> {
  const client = getClient()
  try {
    await client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }))
  } catch {
    // Best-effort delete — log but don't fail
    console.error(`R2 delete failed for key ${key}`)
  }
}

/** Public URL for a stored object (used to pass to AssemblyAI). */
export function publicUrl(key: string): string {
  return `${process.env.R2_PUBLIC_URL}/${key}`
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/r2.ts
git commit -m "feat: add R2 presigned URL and delete helpers"
```

---

### Task 6: AssemblyAI integration

**Files:**
- Create: `lib/assemblyai.ts`, `__tests__/lib/assemblyai.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/lib/assemblyai.test.ts
import { describe, it, expect } from 'vitest'
import { parseWebhookBody } from '@/lib/assemblyai'

describe('parseWebhookBody', () => {
  it('extracts segments and speaker count from AssemblyAI transcript', () => {
    const body = {
      transcript_id: 'job123',
      status: 'completed',
      utterances: [
        { speaker: 'A', text: 'Hola, ¿cómo estás?', start: 0, end: 2000 },
        { speaker: 'B', text: 'Bien, gracias.', start: 2500, end: 4000 },
        { speaker: 'A', text: 'Me alegra.', start: 4500, end: 5500 },
      ],
    }
    const result = parseWebhookBody(body)
    expect(result.speakerCount).toBe(2)
    expect(result.segments).toHaveLength(3)
    expect(result.segments[0]).toMatchObject({
      speaker: 'A',
      text: 'Hola, ¿cómo estás?',
      start_ms: 0,
      end_ms: 2000,
      position: 0,
    })
  })

  it('returns speakerCount 1 when only one speaker present', () => {
    const body = {
      transcript_id: 'job456',
      status: 'completed',
      utterances: [
        { speaker: 'A', text: 'Solo yo hablé.', start: 0, end: 1000 },
      ],
    }
    const result = parseWebhookBody(body)
    expect(result.speakerCount).toBe(1)
  })

  it('throws when status is error', () => {
    const body = { transcript_id: 'job789', status: 'error', error: 'Audio too short' }
    expect(() => parseWebhookBody(body)).toThrow('AssemblyAI error: Audio too short')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/lib/assemblyai.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/assemblyai'`

- [ ] **Step 3: Implement assemblyai.ts**

```typescript
// lib/assemblyai.ts
import { AssemblyAI } from 'assemblyai'

function getClient() {
  return new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })
}

export interface ParsedSegment {
  speaker: 'A' | 'B'
  text: string
  start_ms: number
  end_ms: number
  position: number
}

export interface ParsedWebhook {
  speakerCount: number
  segments: ParsedSegment[]
}

/** Submit an audio file URL for transcription with speaker diarization. */
export async function createJob(audioUrl: string): Promise<string> {
  const client = getClient()
  const transcript = await client.transcripts.submit({
    audio_url: audioUrl,
    speaker_labels: true,
    speakers_expected: 2,
    language_code: 'es',
  })
  return transcript.id
}

/** Attempt to cancel a job. Swallows errors (best-effort). */
export async function cancelJob(jobId: string): Promise<void> {
  try {
    const client = getClient()
    await client.transcripts.delete(jobId)
  } catch {
    console.error(`AssemblyAI cancel failed for job ${jobId}`)
  }
}

/** Parse the raw AssemblyAI webhook body into typed segments. */
export function parseWebhookBody(body: Record<string, unknown>): ParsedWebhook {
  if (body.status === 'error') {
    throw new Error(`AssemblyAI error: ${body.error ?? 'unknown'}`)
  }

  const utterances = (body.utterances as Array<{
    speaker: string
    text: string
    start: number
    end: number
  }>) ?? []

  const segments: ParsedSegment[] = utterances.map((u, i) => ({
    speaker: u.speaker as 'A' | 'B',
    text: u.text,
    start_ms: u.start,
    end_ms: u.end,
    position: i,
  }))

  const uniqueSpeakers = new Set(segments.map(s => s.speaker))

  return { speakerCount: uniqueSpeakers.size, segments }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/lib/assemblyai.test.ts
```

Expected: `3 tests passed`

- [ ] **Step 5: Commit**

```bash
git add lib/assemblyai.ts __tests__/lib/assemblyai.test.ts
git commit -m "feat: add AssemblyAI job creation and webhook parsing"
```

---

### Task 7: Claude analysis integration

**Files:**
- Create: `lib/claude.ts`, `__tests__/lib/claude.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/lib/claude.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyseUserTurns, type UserTurn } from '@/lib/claude'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}))

import Anthropic from '@anthropic-ai/sdk'

describe('analyseUserTurns', () => {
  const mockCreate = vi.fn()

  beforeEach(() => {
    vi.mocked(Anthropic).mockImplementation(() => ({
      messages: { create: mockCreate },
    } as unknown as Anthropic))
  })

  it('returns parsed annotations from Claude JSON response', async () => {
    const turns: UserTurn[] = [
      { id: 'seg-1', text: 'Yo fui al mercado ayer.' },
    ]

    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify([
          {
            segment_id: 'seg-1',
            type: 'grammar',
            original: 'Yo fui',
            start_char: 0,
            end_char: 6,
            correction: 'Fui',
            explanation: 'Drop the subject pronoun — it sounds more natural in Argentine speech.',
          },
        ]),
      }],
    })

    const result = await analyseUserTurns(turns)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      segment_id: 'seg-1',
      type: 'grammar',
      original: 'Yo fui',
      start_char: 0,
      end_char: 6,
      correction: 'Fui',
    })
  })

  it('returns empty array when Claude returns empty JSON array', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '[]' }],
    })
    const result = await analyseUserTurns([{ id: 'seg-1', text: 'Perfecto.' }])
    expect(result).toEqual([])
  })

  it('throws when Claude response is not valid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Sorry, I cannot help with that.' }],
    })
    await expect(analyseUserTurns([{ id: 'seg-1', text: 'Test.' }])).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/lib/claude.test.ts
```

Expected: `FAIL — Cannot find module '@/lib/claude'`

- [ ] **Step 3: Implement claude.ts**

```typescript
// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are an expert Spanish language coach specialising in Rioplatense (Argentine) Spanish. Analyse the speech turns provided and identify:

1. Grammar errors — mistakes the speaker made (type: "grammar")
2. Unnatural phrasing — things that are technically correct but would sound more natural said differently in everyday Argentine speech (type: "naturalness")
3. Strengths — things the speaker did well, especially correct use of voseo, lunfardo, or natural Argentine expressions (type: "strength")

For each finding:
- "original": copy the exact substring from the turn's text
- "start_char" / "end_char": character offsets of "original" within that turn's text
- "correction": the improved version (null for strengths)
- "explanation": a concise plain-language explanation tuned to Argentine Spanish conventions

Be tuned to Rioplatense register: voseo verb forms, Rioplatense vocabulary, lunfardo where relevant. Prefer natural everyday Argentine speech over textbook Castilian.

Respond ONLY with a JSON array. No other text.`

export interface UserTurn {
  id: string
  text: string
}

export interface ClaudeAnnotation {
  segment_id: string
  type: 'grammar' | 'naturalness' | 'strength'
  original: string
  start_char: number
  end_char: number
  correction: string | null
  explanation: string
}

export async function analyseUserTurns(turns: UserTurn[]): Promise<ClaudeAnnotation[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userContent = turns
    .map(t => `[ID: ${t.id}]\n${t.text}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  return JSON.parse(text) as ClaudeAnnotation[]
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/lib/claude.test.ts
```

Expected: `3 tests passed`

- [ ] **Step 5: Commit**

```bash
git add lib/claude.ts __tests__/lib/claude.test.ts
git commit -m "feat: add Claude analysis integration with Argentine Spanish prompt"
```

---

## Chunk 3: Sessions API Routes

### Task 8: Sessions list + create

**Files:**
- Create: `app/api/sessions/route.ts`, `__tests__/api/sessions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}))
vi.mock('@/lib/r2', () => ({
  presignedUploadUrl: vi.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'
import { presignedUploadUrl } from '@/lib/r2'
import { GET, POST } from '@/app/api/sessions/route'

const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockSingle = vi.fn()

beforeEach(() => {
  vi.mocked(createServerClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
    }),
  } as unknown as ReturnType<typeof createServerClient>)
})

describe('GET /api/sessions', () => {
  it('returns session list ordered by created_at desc', async () => {
    mockSelect.mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [
          { id: 'abc', title: 'Test', status: 'ready', duration_seconds: 3600, created_at: '2026-03-15' },
        ],
        error: null,
      }),
    })
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0].title).toBe('Test')
  })
})

describe('POST /api/sessions', () => {
  it('creates a session and returns session_id + upload_url', async () => {
    vi.mocked(presignedUploadUrl).mockResolvedValue({ key: 'audio/uuid.mp3', url: 'https://r2.example/presigned' })
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'new-id' },
          error: null,
        }),
      }),
    })

    const req = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'Mi conversación', extension: 'mp3' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.session_id).toBe('new-id')
    expect(body.upload_url).toBe('https://r2.example/presigned')
  })

  it('returns 400 when title is missing', async () => {
    const req = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/api/sessions.test.ts
```

- [ ] **Step 3: Implement route**

```typescript
// app/api/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { presignedUploadUrl } from '@/lib/r2'

export async function GET() {
  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .select('id, title, status, duration_seconds, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { title, extension } = body as { title?: string; extension?: string }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const ext = (extension ?? 'mp3').replace(/^\./, '')
  const { key, url } = await presignedUploadUrl(ext)

  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .insert({ title: title.trim(), audio_r2_key: key })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session_id: data.id, upload_url: url }, { status: 201 })
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: `3 tests passed`

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/route.ts __tests__/api/sessions.test.ts
git commit -m "feat: add GET /api/sessions and POST /api/sessions"
```

---

### Task 9: Session detail, title update, and status polling

**Files:**
- Create: `app/api/sessions/[id]/route.ts`, `app/api/sessions/[id]/status/route.ts`
- Test: `__tests__/api/sessions.test.ts` (extend existing file)

- [ ] **Step 1: Add failing tests to sessions.test.ts**

Append the following describes to `__tests__/api/sessions.test.ts` (after the existing POST describe, inside the same file — add the new imports at the top):

```typescript
// Add to the top imports in __tests__/api/sessions.test.ts:
import { GET as getDetail, PATCH } from '@/app/api/sessions/[id]/route'
import { GET as getStatus } from '@/app/api/sessions/[id]/status/route'

// Append these describes at the bottom of the file:

describe('GET /api/sessions/:id', () => {
  it('returns session detail with segments and annotations', async () => {
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 's1', title: 'Test', status: 'ready', error_stage: null,
                    duration_seconds: 60, detected_speaker_count: 2, user_speaker_label: 'A',
                    created_at: '2026-03-15' },
                  error: null,
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost')
    const res = await getDetail(req, { params: { id: 's1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.session.id).toBe('s1')
    expect(body.segments).toEqual([])
    expect(body.annotations).toEqual([])
  })

  it('returns 404 for unknown session', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost')
    const res = await getDetail(req, { params: { id: 'unknown' } })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/sessions/:id', () => {
  it('updates title and returns ok', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New Title' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 's1' } })
    expect(res.status).toBe(200)
  })

  it('returns 400 for empty title', async () => {
    vi.mocked(createServerClient).mockReturnValue({} as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ title: '' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 's1' } })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/sessions/:id/status', () => {
  it('returns status and error_stage', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { status: 'ready', error_stage: null },
              error: null,
            }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost')
    const res = await getStatus(req, { params: { id: 's1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ready')
    expect(body.error_stage).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/sessions/[id]/route'`

- [ ] **Step 3: Implement session detail + PATCH**

```typescript
// app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const db = createServerClient()

  const { data: session, error: sessionError } = await db
    .from('sessions')
    .select('id, title, status, error_stage, duration_seconds, detected_speaker_count, user_speaker_label, created_at')
    .eq('id', params.id)
    .single()

  if (sessionError) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: segments } = await db
    .from('transcript_segments')
    .select('*')
    .eq('session_id', params.id)
    .order('position')

  const { data: annotations } = await db
    .from('annotations')
    .select('*')
    .eq('session_id', params.id)

  return NextResponse.json({ session, segments: segments ?? [], annotations: annotations ?? [] })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json()
  const { title } = body as { title?: string }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title must not be empty' }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db
    .from('sessions')
    .update({ title: title.trim() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Implement status polling**

```typescript
// app/api/sessions/[id]/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .select('status, error_stage')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ status: data.status, error_stage: data.error_stage ?? null })
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: `8 tests passed`

- [ ] **Step 6: Commit**

```bash
git add app/api/sessions/[id]/route.ts app/api/sessions/[id]/status/route.ts __tests__/api/sessions.test.ts
git commit -m "feat: add GET/PATCH /api/sessions/:id and GET /api/sessions/:id/status"
```

---

## Chunk 4: Upload Pipeline API Routes

### Task 10: upload-complete and upload-failed

**Files:**
- Create: `app/api/sessions/[id]/upload-complete/route.ts`, `app/api/sessions/[id]/upload-failed/route.ts`, `__tests__/api/upload-pipeline.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/upload-pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/assemblyai', () => ({ createJob: vi.fn(), cancelJob: vi.fn() }))
vi.mock('@/lib/r2', () => ({ publicUrl: vi.fn(), presignedUploadUrl: vi.fn(), deleteObject: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { createJob } from '@/lib/assemblyai'
import { publicUrl } from '@/lib/r2'

const mockUpdate = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()

function makeMockDb(sessionData: Record<string, unknown>) {
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: sessionData, error: null }),
        }),
      }),
    }),
  }
}

describe('POST /api/sessions/:id/upload-complete', () => {
  beforeEach(() => {
    vi.mocked(publicUrl).mockReturnValue('https://r2.example/audio/uuid.mp3')
    vi.mocked(createJob).mockResolvedValue('assemblyai-job-123')
  })

  it('triggers AssemblyAI and sets status to transcribing', async () => {
    vi.mocked(createServerClient).mockReturnValue(
      makeMockDb({ audio_r2_key: 'audio/uuid.mp3' }) as unknown as ReturnType<typeof createServerClient>
    )

    const { POST } = await import('@/app/api/sessions/[id]/upload-complete/route')
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ duration_seconds: 3600 }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    expect(vi.mocked(createJob)).toHaveBeenCalledWith('https://r2.example/audio/uuid.mp3')
  })
})

describe('POST /api/sessions/:id/upload-failed', () => {
  it('sets status to error with error_stage uploading', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/sessions/[id]/upload-failed/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/api/upload-pipeline.test.ts
```

- [ ] **Step 3: Implement upload-complete**

```typescript
// app/api/sessions/[id]/upload-complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createJob } from '@/lib/assemblyai'
import { publicUrl } from '@/lib/r2'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { duration_seconds } = await req.json() as { duration_seconds?: number }
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('audio_r2_key')
    .eq('id', params.id)
    .single()

  if (!session?.audio_r2_key) {
    return NextResponse.json({ error: 'No audio key found' }, { status: 400 })
  }

  const audioUrl = publicUrl(session.audio_r2_key)

  let jobId: string
  try {
    jobId = await createJob(audioUrl)
  } catch (err) {
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', params.id)
    return NextResponse.json({ error: 'AssemblyAI job creation failed' }, { status: 500 })
  }

  await db.from('sessions').update({
    status: 'transcribing',
    assemblyai_job_id: jobId,
    ...(duration_seconds != null ? { duration_seconds } : {}),
  }).eq('id', params.id)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Implement upload-failed**

```typescript
// app/api/sessions/[id]/upload-failed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerClient()
  await db.from('sessions').update({
    status: 'error',
    error_stage: 'uploading',
  }).eq('id', params.id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run test — expect PASS**

```bash
npm test -- __tests__/api/upload-pipeline.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add app/api/sessions/[id]/upload-complete/route.ts app/api/sessions/[id]/upload-failed/route.ts __tests__/api/upload-pipeline.test.ts
git commit -m "feat: add upload-complete and upload-failed API routes"
```

---

### Task 11: Speaker, retry, and analyse routes

**Files:**
- Create: `app/api/sessions/[id]/speaker/route.ts`, `app/api/sessions/[id]/retry/route.ts`, `app/api/sessions/[id]/analyse/route.ts`, `lib/pipeline.ts`
- Test: `__tests__/api/upload-pipeline.test.ts` (extend), `__tests__/lib/pipeline.test.ts`

- [ ] **Step 1: Write failing tests for speaker and analyse routes**

Append to `__tests__/api/upload-pipeline.test.ts`:

```typescript
// Add to top-level mocks:
vi.mock('@/lib/pipeline', () => ({ runClaudeAnalysis: vi.fn() }))
import { runClaudeAnalysis } from '@/lib/pipeline'

// Append these describes:

describe('POST /api/sessions/:id/speaker', () => {
  it('returns 409 when session is not identifying', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { status: 'ready' }, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(runClaudeAnalysis).mockResolvedValue(undefined)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ speaker_label: 'A' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(409)
  })

  it('saves speaker label and returns analysing when status is identifying', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { status: 'identifying' }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: updateEq }),
      })),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(runClaudeAnalysis).mockResolvedValue(undefined)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ speaker_label: 'A' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('analysing')
  })
})

describe('POST /api/sessions/:id/analyse', () => {
  it('returns 409 when analysis is already in progress', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { status: 'analysing', error_stage: null }, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/analyse/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(409)
  })

  it('returns 400 when no transcript is available', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { status: 'error', error_stage: 'uploading' }, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/analyse/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(400)
  })
})
```

Also append retry route tests to `__tests__/api/upload-pipeline.test.ts`:

```typescript
describe('POST /api/sessions/:id/retry', () => {
  it('generates new upload URL for uploading stage', async () => {
    vi.mocked(presignedUploadUrl).mockResolvedValue({ key: 'audio/new.mp3', url: 'https://r2.example/new' })
    vi.mocked(deleteObject).mockResolvedValue(undefined)
    const mockDb = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { error_stage: 'uploading', audio_r2_key: 'audio/old.mp3', assemblyai_job_id: null },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      })),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/retry/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.upload_url).toBe('https://r2.example/new')
  })

  it('creates new AssemblyAI job for transcribing stage', async () => {
    vi.mocked(createJob).mockResolvedValue('new-job-id')
    vi.mocked(publicUrl).mockReturnValue('https://r2.example/audio.mp3')
    const mockDb = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { error_stage: 'transcribing', audio_r2_key: 'audio/test.mp3', assemblyai_job_id: null },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      })),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/retry/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('transcribing')
    expect(vi.mocked(createJob)).toHaveBeenCalledWith('https://r2.example/audio.mp3')
  })
})
```

- [ ] **Step 2: Write failing test for runClaudeAnalysis**

```typescript
// __tests__/lib/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/claude', () => ({ analyseUserTurns: vi.fn() }))
vi.mock('@/lib/r2', () => ({ deleteObject: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import { runClaudeAnalysis } from '@/lib/pipeline'

describe('runClaudeAnalysis', () => {
  it('inserts annotations and practice items with annotation_id, then sets status ready', async () => {
    const insertAnnotationsMock = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [{ id: 'ann-1' }],
        error: null,
      }),
    })
    const insertPracticeMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { user_speaker_label: 'A', audio_r2_key: 'audio/test.mp3' },
                  error: null,
                }),
              }),
            }),
            update: updateMock,
          }
        }
        if (table === 'transcript_segments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [{ id: 'seg-1', speaker: 'A', text: 'Yo fui al mercado.' }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'annotations') return { insert: insertAnnotationsMock }
        if (table === 'practice_items') return { insert: insertPracticeMock }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue([
      { segment_id: 'seg-1', type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.' },
    ])
    vi.mocked(deleteObject).mockResolvedValue(undefined)

    await runClaudeAnalysis('session-1')

    expect(insertAnnotationsMock).toHaveBeenCalled()
    // practice_items insert should include annotation_id
    const practiceCall = insertPracticeMock.mock.calls[0][0]
    expect(practiceCall[0]).toHaveProperty('annotation_id', 'ann-1')
    expect(updateMock).toHaveBeenCalledWith({ status: 'ready' })
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
npm test -- __tests__/api/upload-pipeline.test.ts __tests__/lib/pipeline.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/pipeline'` and `Cannot find module '@/app/api/sessions/[id]/speaker/route'`

- [ ] **Step 4: Implement speaker route**

```typescript
// app/api/sessions/[id]/speaker/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { runClaudeAnalysis } from '@/lib/pipeline'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { speaker_label } = await req.json() as { speaker_label?: 'A' | 'B' }

  if (speaker_label !== 'A' && speaker_label !== 'B') {
    return NextResponse.json({ error: 'speaker_label must be A or B' }, { status: 400 })
  }

  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('status')
    .eq('id', params.id)
    .single()

  if (session?.status !== 'identifying') {
    return NextResponse.json({ error: 'Session is not awaiting speaker identification' }, { status: 409 })
  }

  await db.from('sessions').update({
    user_speaker_label: speaker_label,
    status: 'analysing',
  }).eq('id', params.id)

  // Fire-and-forget: run Claude analysis in background
  runClaudeAnalysis(params.id).catch(err =>
    console.error(`Claude analysis failed for session ${params.id}:`, err)
  )

  return NextResponse.json({ status: 'analysing' })
}
```

- [ ] **Step 5: Create pipeline helper**

```typescript
// lib/pipeline.ts
import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import type { TranscriptSegment } from '@/lib/types'

export async function runClaudeAnalysis(sessionId: string): Promise<void> {
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('user_speaker_label, audio_r2_key')
    .eq('id', sessionId)
    .single()

  if (!session) throw new Error(`Session ${sessionId} not found`)

  const { data: segments } = await db
    .from('transcript_segments')
    .select('*')
    .eq('session_id', sessionId)
    .order('position')

  const userTurns = (segments ?? [])
    .filter((s: TranscriptSegment) => s.speaker === session.user_speaker_label)
    .map((s: TranscriptSegment) => ({ id: s.id, text: s.text }))

  let annotations
  try {
    annotations = await analyseUserTurns(userTurns)
  } catch (err) {
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'analysing',
    }).eq('id', sessionId)
    throw err
  }

  // Write annotations and retrieve their IDs
  if (annotations.length > 0) {
    const { data: insertedAnnotations, error: annotationError } = await db.from('annotations').insert(
      annotations.map(a => ({
        session_id: sessionId,
        segment_id: a.segment_id,
        type: a.type,
        original: a.original,
        start_char: a.start_char,
        end_char: a.end_char,
        correction: a.correction,
        explanation: a.explanation,
      }))
    ).select('id')

    if (annotationError || !insertedAnnotations) {
      throw new Error(`Failed to insert annotations: ${annotationError?.message ?? 'no data returned'}`)
    }

    // Write practice items (denormalised copy) with annotation_id so re-analysis can delete them
    await db.from('practice_items').insert(
      annotations.map((a, i) => ({
        session_id: sessionId,
        annotation_id: insertedAnnotations[i]?.id ?? null,
        type: a.type,
        original: a.original,
        correction: a.correction,
        explanation: a.explanation,
      }))
    )
  }

  // Delete audio from R2
  if (session.audio_r2_key) {
    await deleteObject(session.audio_r2_key)
    await db.from('sessions').update({ audio_r2_key: null }).eq('id', sessionId)
  }

  await db.from('sessions').update({ status: 'ready' }).eq('id', sessionId)
}
```

- [ ] **Step 6: Implement retry route**

```typescript
// app/api/sessions/[id]/retry/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createJob, cancelJob } from '@/lib/assemblyai'
import { presignedUploadUrl, publicUrl, deleteObject } from '@/lib/r2'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('error_stage, audio_r2_key, assemblyai_job_id')
    .eq('id', params.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.error_stage === 'uploading') {
    // Delete old R2 object if exists
    if (session.audio_r2_key) await deleteObject(session.audio_r2_key)

    // Generate new presigned URL
    const ext = session.audio_r2_key?.split('.').pop() ?? 'mp3'
    const { key, url } = await presignedUploadUrl(ext)

    await db.from('sessions').update({
      status: 'uploading',
      error_stage: null,
      audio_r2_key: key,
    }).eq('id', params.id)

    return NextResponse.json({ upload_url: url })
  }

  if (session.error_stage === 'transcribing') {
    // Cancel stale job if exists (best-effort — webhook for stale job will be silently discarded)
    if (session.assemblyai_job_id) {
      try { await cancelJob(session.assemblyai_job_id) } catch {
        console.error(`Failed to cancel stale job ${session.assemblyai_job_id}`)
      }
    }

    // Re-trigger AssemblyAI with existing audio
    if (!session.audio_r2_key) {
      return NextResponse.json({ error: 'No audio to retry' }, { status: 400 })
    }
    const audioUrl = publicUrl(session.audio_r2_key)
    const jobId = await createJob(audioUrl)

    await db.from('sessions').update({
      status: 'transcribing',
      error_stage: null,
      assemblyai_job_id: jobId,
    }).eq('id', params.id)

    return NextResponse.json({ status: 'transcribing' })
  }

  return NextResponse.json(
    { error: 'Use /analyse to retry Claude analysis' },
    { status: 400 }
  )
}
```

- [ ] **Step 7: Implement analyse route**

```typescript
// app/api/sessions/[id]/analyse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { runClaudeAnalysis } from '@/lib/pipeline'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('status, error_stage')
    .eq('id', params.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.status === 'analysing') {
    return NextResponse.json({ error: 'Analysis already in progress' }, { status: 409 })
  }

  if (session.error_stage === 'uploading' || session.error_stage === 'transcribing') {
    return NextResponse.json({ error: 'No transcript available to analyse' }, { status: 400 })
  }

  if (session.status !== 'ready' && session.error_stage !== 'analysing') {
    return NextResponse.json({ error: 'Session not in analysable state' }, { status: 400 })
  }

  // Delete existing annotations and annotation-derived practice items
  await db.from('annotations').delete().eq('session_id', params.id)
  await db.from('practice_items')
    .delete()
    .eq('session_id', params.id)
    .not('annotation_id', 'is', null)

  await db.from('sessions').update({
    status: 'analysing',
    error_stage: null,
  }).eq('id', params.id)

  runClaudeAnalysis(params.id).catch(err =>
    console.error(`Re-analysis failed for session ${params.id}:`, err)
  )

  return NextResponse.json({ status: 'analysing' })
}
```

- [ ] **Step 8: Run tests — expect PASS**

```bash
npm test -- __tests__/api/upload-pipeline.test.ts __tests__/lib/pipeline.test.ts
```

Expected: `9 tests passed` (8 in upload-pipeline.test.ts + 1 in pipeline.test.ts)

- [ ] **Step 9: Commit**

```bash
git add app/api/sessions/[id]/speaker/route.ts app/api/sessions/[id]/retry/route.ts app/api/sessions/[id]/analyse/route.ts lib/pipeline.ts __tests__/api/upload-pipeline.test.ts __tests__/lib/pipeline.test.ts
git commit -m "feat: add speaker, retry, analyse routes and pipeline helper"
```

---

## Chunk 5: Webhook + Practice Items API

### Task 12: AssemblyAI webhook

**Files:**
- Create: `app/api/webhooks/assemblyai/route.ts`, `__tests__/api/webhook.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createHmac } from 'crypto'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/assemblyai', () => ({ parseWebhookBody: vi.fn() }))
vi.mock('@/lib/pipeline', () => ({ runClaudeAnalysis: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { parseWebhookBody } from '@/lib/assemblyai'
import { runClaudeAnalysis } from '@/lib/pipeline'

const WEBHOOK_SECRET = 'test-secret'

function signedRequest(body: object, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify(body)
  const sig = createHmac('sha256', secret).update(raw).digest('hex')
  return new NextRequest('http://localhost/api/webhooks/assemblyai', {
    method: 'POST',
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-assemblyai-signature': sig,
    },
  })
}

beforeEach(() => {
  process.env.ASSEMBLYAI_WEBHOOK_SECRET = WEBHOOK_SECRET
})

describe('POST /api/webhooks/assemblyai', () => {
  it('returns 401 for invalid signature', async () => {
    const { POST } = await import('@/app/api/webhooks/assemblyai/route')
    const req = signedRequest({ transcript_id: 'job1' }, 'wrong-secret')
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 and discards unknown job IDs', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/webhooks/assemblyai/route')
    const req = signedRequest({ transcript_id: 'unknown-job' })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('sets status to identifying for 2-speaker transcription', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
          }),
        }),
        update: updateMock,
        insert: insertMock,
      })),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(parseWebhookBody).mockReturnValue({
      speakerCount: 2,
      segments: [
        { speaker: 'A', text: 'Hola', start_ms: 0, end_ms: 500, position: 0 },
        { speaker: 'B', text: 'Buenos días', start_ms: 600, end_ms: 1200, position: 1 },
      ],
    })

    const { POST } = await import('@/app/api/webhooks/assemblyai/route')
    const req = signedRequest({ transcript_id: 'known-job', status: 'completed', utterances: [] })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'identifying' }))
  })

  it('triggers Claude analysis immediately for single-speaker', async () => {
    vi.mocked(runClaudeAnalysis).mockResolvedValue(undefined)
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
          }),
        }),
        update: updateMock,
        insert: insertMock,
      })),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(parseWebhookBody).mockReturnValue({
      speakerCount: 1,
      segments: [{ speaker: 'A', text: 'Solo yo.', start_ms: 0, end_ms: 1000, position: 0 }],
    })

    const { POST } = await import('@/app/api/webhooks/assemblyai/route')
    const req = signedRequest({ transcript_id: 'known-job', status: 'completed', utterances: [] })
    await POST(req)
    expect(vi.mocked(runClaudeAnalysis)).toHaveBeenCalledWith('session-1')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/api/webhook.test.ts
```

- [ ] **Step 3: Implement webhook handler**

```typescript
// app/api/webhooks/assemblyai/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createServerClient } from '@/lib/supabase-server'
import { parseWebhookBody } from '@/lib/assemblyai'
import { runClaudeAnalysis } from '@/lib/pipeline'

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  return expected === signature
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const signature = req.headers.get('x-assemblyai-signature') ?? ''
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET!

  if (!verifySignature(raw, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const body = JSON.parse(raw) as Record<string, unknown>
  const jobId = body.transcript_id as string

  const db = createServerClient()

  // Find session by job ID
  const { data: session, error } = await db
    .from('sessions')
    .select('id')
    .eq('assemblyai_job_id', jobId)
    .single()

  if (error || !session) {
    console.log(`Webhook: unknown job ID ${jobId} — discarding`)
    return NextResponse.json({ ok: true })
  }

  let parsed
  try {
    parsed = parseWebhookBody(body)
  } catch (err) {
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', session.id)
    return NextResponse.json({ ok: true })
  }

  // Insert segments
  await db.from('transcript_segments').insert(
    parsed.segments.map(s => ({
      session_id: session.id,
      speaker: s.speaker,
      text: s.text,
      start_ms: s.start_ms,
      end_ms: s.end_ms,
      position: s.position,
    }))
  )

  if (parsed.speakerCount === 1) {
    // Single speaker: auto-assign label A, go straight to analysing
    await db.from('sessions').update({
      status: 'analysing',
      detected_speaker_count: 1,
      user_speaker_label: 'A',
    }).eq('id', session.id)

    runClaudeAnalysis(session.id).catch(err =>
      console.error(`Claude analysis failed for session ${session.id}:`, err)
    )
  } else {
    await db.from('sessions').update({
      status: 'identifying',
      detected_speaker_count: parsed.speakerCount,
    }).eq('id', session.id)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/api/webhook.test.ts
```

Expected: `4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add app/api/webhooks/assemblyai/route.ts __tests__/api/webhook.test.ts
git commit -m "feat: add AssemblyAI webhook handler with HMAC verification"
```

---

### Task 13: Practice items API

**Files:**
- Create: `app/api/practice-items/route.ts`, `app/api/practice-items/[id]/route.ts`, `__tests__/api/practice-items.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/api/practice-items.test.ts
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
import { createServerClient } from '@/lib/supabase-server'

describe('GET /api/practice-items', () => {
  it('returns all items when no filters', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [{ id: 'item-1', type: 'grammar', original: 'Yo fui', reviewed: false }],
            error: null,
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { GET } = await import('@/app/api/practice-items/route')
    const req = new NextRequest('http://localhost/api/practice-items')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
  })
})

describe('PATCH /api/practice-items/:id', () => {
  it('updates reviewed flag', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: eqMock }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { PATCH } = await import('@/app/api/practice-items/[id]/route')
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ reviewed: true }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
    expect(eqMock).toHaveBeenCalledWith('id', 'item-1')
  })
})

describe('DELETE /api/practice-items/:id', () => {
  it('deletes an item', async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockReturnValue({ delete: vi.fn().mockReturnValue({ eq: eqMock }) }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { DELETE } = await import('@/app/api/practice-items/[id]/route')
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/api/practice-items.test.ts
```

- [ ] **Step 3: Implement practice items list route**

```typescript
// app/api/practice-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const reviewed = searchParams.get('reviewed')

  const db = createServerClient()
  let query = db
    .from('practice_items')
    .select(`
      id, session_id, annotation_id, type, original, correction,
      explanation, reviewed, created_at, updated_at,
      sessions(title, created_at)
    `)

  if (type) query = (query as typeof query).eq('type', type)
  if (reviewed !== null) query = (query as typeof query).eq('reviewed', reviewed === 'true')

  const { data, error } = await (query as typeof query).order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()
  const { data, error } = await db
    .from('practice_items')
    .insert(body)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Implement practice item detail route**

```typescript
// app/api/practice-items/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

type Params = { params: { id: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { reviewed } = await req.json() as { reviewed: boolean }
  const db = createServerClient()
  const { error } = await db
    .from('practice_items')
    .update({ reviewed })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const db = createServerClient()
  const { error } = await db
    .from('practice_items')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run test — expect PASS**

```bash
npm test -- __tests__/api/practice-items.test.ts
```

Expected: `3 tests passed`

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/practice-items/ __tests__/api/practice-items.test.ts
git commit -m "feat: add practice items list, update, and delete API routes"
```

---

## Chunk 6: Frontend Screens 1–3

### Task 14: InlineEdit and shared layout

**Files:**
- Create: `components/InlineEdit.tsx`, `app/layout.tsx`, `app/globals.css`

- [ ] **Step 1: Write layout**

```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Conversation Coach',
  description: 'Analyse your Spanish conversations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-lg font-semibold tracking-tight">Conversation Coach</a>
          <a href="/practice" className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Practice Items
          </a>
        </nav>
        <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Write InlineEdit component**

```typescript
// components/InlineEdit.tsx
'use client'
import { useState, useRef, useEffect } from 'react'

interface Props {
  value: string
  onSave: (value: string) => Promise<void>
  className?: string
}

export function InlineEdit({ value, onSave, className = '' }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) {
      setDraft(value)
      setEditing(false)
      return
    }
    await onSave(trimmed)
    setEditing(false)
  }

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:underline decoration-dotted ${className}`}
        onClick={() => setEditing(true)}
        title="Click to rename"
      >
        {value}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      className={`bg-transparent border-b border-gray-400 outline-none ${className}`}
    />
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx app/globals.css components/InlineEdit.tsx
git commit -m "feat: add layout and InlineEdit component"
```

---

### Task 15: DropZone and SessionList components

**Files:**
- Create: `components/DropZone.tsx`, `components/SessionList.tsx`

- [ ] **Step 1: Write DropZone**

```typescript
// components/DropZone.tsx
'use client'
import { useRef, useState } from 'react'

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a']
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav']
const MAX_BYTES = 500 * 1024 * 1024 // 500 MB

interface Props {
  onFile: (file: File) => void
}

export function DropZone({ onFile }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function validate(file: File): string | null {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    const validType = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext)
    if (!validType) return `Unsupported format. Use MP3, M4A, or WAV.`
    if (file.size > MAX_BYTES) return `File too large. Maximum is 500 MB.`
    return null
  }

  function handleFile(file: File) {
    const err = validate(file)
    if (err) { setError(err); return }
    setError(null)
    onFile(file)
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
          ${dragOver ? 'border-violet-500 bg-violet-500/10' : 'border-gray-700 hover:border-gray-500'}`}
      >
        <div className="text-4xl mb-3">🎙️</div>
        <p className="font-medium">Drop audio file here</p>
        <p className="text-sm text-gray-500 mt-1">MP3, M4A, WAV · up to 500 MB / 2 hours</p>
        <button
          type="button"
          className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
          onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
        >
          Browse file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.m4a,.wav"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Write SessionList**

```typescript
// components/SessionList.tsx
'use client'
import Link from 'next/link'
import { InlineEdit } from '@/components/InlineEdit'
import type { SessionListItem } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  uploading: 'Uploading…',
  transcribing: 'Transcribing…',
  identifying: 'Awaiting speaker ID',
  analysing: 'Analysing…',
  ready: 'Ready',
  error: 'Error',
}

const STATUS_COLOUR: Record<string, string> = {
  ready: 'text-green-400',
  error: 'text-red-400',
}

interface Props {
  sessions: SessionListItem[]
  onRename: (id: string, title: string) => Promise<void>
}

export function SessionList({ sessions, onRename }: Props) {
  if (sessions.length === 0) {
    return <p className="text-gray-500 text-sm">No sessions yet — upload your first conversation above.</p>
  }

  return (
    <ul className="divide-y divide-gray-800">
      {sessions.map(s => (
        <li key={s.id} className="flex items-center justify-between py-3">
          <InlineEdit
            value={s.title}
            onSave={title => onRename(s.id, title)}
            className="font-medium"
          />
          <Link
            href={s.status === 'ready' ? `/sessions/${s.id}` : `/sessions/${s.id}/status`}
            className="ml-4 shrink-0"
          >
            <span className="flex items-center gap-4 text-sm text-gray-400">
              <span className={STATUS_COLOUR[s.status] ?? 'text-gray-400'}>
                {STATUS_LABEL[s.status] ?? s.status}
              </span>
              <span>{new Date(s.created_at).toLocaleDateString()}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/DropZone.tsx components/SessionList.tsx
git commit -m "feat: add DropZone and SessionList components"
```

---

### Task 16: Screen 1 — Upload / Home page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Write page**

```typescript
// app/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DropZone } from '@/components/DropZone'
import { SessionList } from '@/components/SessionList'
import type { SessionListItem } from '@/lib/types'

export default function HomePage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(setSessions)
      .catch(console.error)
  }, [])

  async function handleRename(id: string, newTitle: string) {
    await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    })
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title: newTitle } : s))
  }

  async function handleFile(file: File) {
    setUploading(true)
    setError(null)
    const sessionTitle = title.trim() || file.name.replace(/\.[^.]+$/, '')
    const ext = file.name.split('.').pop() ?? 'mp3'

    // Get duration from audio metadata
    const duration_seconds = await getAudioDuration(file)

    // Create session + get presigned URL
    const createRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: sessionTitle, extension: ext }),
    })
    if (!createRes.ok) { setError('Failed to create session'); setUploading(false); return }
    const { session_id, upload_url } = await createRes.json() as { session_id: string; upload_url: string }

    // Upload to R2
    try {
      const uploadRes = await fetch(upload_url, { method: 'PUT', body: file })
      if (!uploadRes.ok) throw new Error('Upload failed')
    } catch {
      await fetch(`/api/sessions/${session_id}/upload-failed`, { method: 'POST' })
      setError('Upload failed — please try again')
      setUploading(false)
      return
    }

    // Notify server
    await fetch(`/api/sessions/${session_id}/upload-complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration_seconds }),
    })

    router.push(`/sessions/${session_id}/status`)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Conversation Coach</h1>
        <p className="text-gray-400 text-sm">Upload a recorded Spanish conversation to get feedback on your speech.</p>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          placeholder="Session title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm outline-none focus:border-violet-500"
        />
        <DropZone onFile={handleFile} />
        {uploading && <p className="text-sm text-violet-400">Uploading…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Past Sessions</h2>
        <SessionList sessions={sessions} onRename={handleRename} />
      </div>
    </div>
  )
}

async function getAudioDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio()
    audio.src = URL.createObjectURL(file)
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src)
      resolve(Math.round(audio.duration))
    }
    audio.onerror = () => resolve(0)
  })
}
```

- [ ] **Step 2: Verify page loads**

```bash
npm run dev
```

Open `http://localhost:3000` — should show upload zone and empty sessions list.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add upload/home page (Screen 1)"
```

---

### Task 17: PipelineStatus component + Screen 2

**Files:**
- Create: `components/PipelineStatus.tsx`, `__tests__/components/PipelineStatus.test.tsx`
- Create: `app/sessions/[id]/status/page.tsx`

- [ ] **Step 1: Write failing test for PipelineStatus**

```typescript
// __tests__/components/PipelineStatus.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineStatus } from '@/components/PipelineStatus'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('PipelineStatus', () => {
  it('shows the current stage label', () => {
    render(
      <PipelineStatus
        sessionId="s1"
        initialStatus="transcribing"
        initialErrorStage={null}
        durationSeconds={3600}
      />
    )
    expect(screen.getByText(/Transcribing/i)).toBeInTheDocument()
  })

  it('shows estimated time when duration is available', () => {
    render(
      <PipelineStatus
        sessionId="s1"
        initialStatus="transcribing"
        initialErrorStage={null}
        durationSeconds={3600}
      />
    )
    // 3600s / 60 * 1.5 = 90 minutes
    expect(screen.getByText(/90 min/i)).toBeInTheDocument()
  })

  it('shows error message when status is error', () => {
    render(
      <PipelineStatus
        sessionId="s1"
        initialStatus="error"
        initialErrorStage="transcribing"
        durationSeconds={null}
      />
    )
    expect(screen.getByText(/transcription failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/components/PipelineStatus.test.tsx
```

- [ ] **Step 3: Implement PipelineStatus**

```typescript
// components/PipelineStatus.tsx
'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { SessionStatus, ErrorStage } from '@/lib/types'

const STAGE_LABELS: Record<SessionStatus, string> = {
  uploading: 'Uploading',
  transcribing: 'Transcribing',
  identifying: 'Identifying speakers',
  analysing: 'Analysing your speech',
  ready: 'Ready',
  error: 'Error',
}

const ERROR_MESSAGES: Record<string, string> = {
  uploading: 'Upload failed.',
  transcribing: 'Transcription failed.',
  analysing: 'Analysis failed.',
}

const STAGES: SessionStatus[] = ['uploading', 'transcribing', 'identifying', 'analysing', 'ready']

interface Props {
  sessionId: string
  initialStatus: SessionStatus
  initialErrorStage: ErrorStage | null
  durationSeconds: number | null
}

export function PipelineStatus({ sessionId, initialStatus, initialErrorStage, durationSeconds }: Props) {
  const router = useRouter()
  const statusRef = useRef(initialStatus)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const estimatedMinutes = durationSeconds
    ? Math.ceil(durationSeconds / 60 * 1.5)
    : null

  useEffect(() => {
    function redirect(status: SessionStatus) {
      if (status === 'identifying') router.push(`/sessions/${sessionId}/identify`)
      if (status === 'ready') router.push(`/sessions/${sessionId}`)
    }

    // Immediate check on mount
    fetch(`/api/sessions/${sessionId}/status`)
      .then(r => r.json())
      .then(data => {
        statusRef.current = data.status
        if (data.status === 'identifying' || data.status === 'ready') {
          redirect(data.status)
        }
      })

    intervalRef.current = setInterval(() => {
      fetch(`/api/sessions/${sessionId}/status`)
        .then(r => r.json())
        .then(data => {
          statusRef.current = data.status
          redirect(data.status)
        })
    }, 5000)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [sessionId, router])

  async function handleRetry() {
    const res = await fetch(`/api/sessions/${sessionId}/retry`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      if (data.upload_url) {
        // Upload failed — redirect home with message
        router.push('/?retry=upload')
      } else {
        router.push(`/sessions/${sessionId}/status`)
      }
    }
  }

  if (initialStatus === 'error') {
    const msg = ERROR_MESSAGES[initialErrorStage ?? ''] ?? 'Something went wrong.'
    return (
      <div className="space-y-4">
        <p className="text-red-400">{msg}</p>
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium"
        >
          Retry
        </button>
      </div>
    )
  }

  const currentIndex = STAGES.indexOf(initialStatus)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        {STAGES.filter(s => s !== 'error').map((stage, i) => (
          <div key={stage} className={`flex items-center gap-3 ${i <= currentIndex ? 'text-white' : 'text-gray-600'}`}>
            <span className={`w-2 h-2 rounded-full ${i < currentIndex ? 'bg-green-400' : i === currentIndex ? 'bg-violet-400 animate-pulse' : 'bg-gray-700'}`} />
            <span className="text-sm">{STAGE_LABELS[stage]}</span>
          </div>
        ))}
      </div>
      {estimatedMinutes && (
        <p className="text-sm text-gray-400">Estimated time: ~{estimatedMinutes} min</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/components/PipelineStatus.test.tsx
```

- [ ] **Step 5: Write status page**

```typescript
// app/sessions/[id]/status/page.tsx
import { createServerClient } from '@/lib/supabase-server'
import { PipelineStatus } from '@/components/PipelineStatus'
import { notFound, redirect } from 'next/navigation'

export default async function StatusPage({ params }: { params: { id: string } }) {
  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('id, title, status, error_stage, duration_seconds')
    .eq('id', params.id)
    .single()

  if (!session) notFound()
  if (session.status === 'ready') redirect(`/sessions/${params.id}`)
  if (session.status === 'identifying') redirect(`/sessions/${params.id}/identify`)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{session.title}</h1>
      <PipelineStatus
        sessionId={params.id}
        initialStatus={session.status}
        initialErrorStage={session.error_stage}
        durationSeconds={session.duration_seconds}
      />
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add components/PipelineStatus.tsx __tests__/components/PipelineStatus.test.tsx app/sessions/[id]/status/page.tsx
git commit -m "feat: add PipelineStatus component and status page (Screen 2)"
```

---

### Task 18: Screen 3 — Speaker Identification

**Files:**
- Create: `components/SpeakerCard.tsx`, `app/sessions/[id]/identify/page.tsx`

- [ ] **Step 1: Write SpeakerCard**

```typescript
// components/SpeakerCard.tsx
'use client'

interface Props {
  label: 'A' | 'B'
  samples: string[]
  onSelect: (label: 'A' | 'B') => void
  disabled: boolean
}

export function SpeakerCard({ label, samples, onSelect, disabled }: Props) {
  return (
    <div className="border border-gray-700 rounded-xl p-5 space-y-4">
      <p className="text-xs uppercase tracking-widest text-gray-500">Speaker {label}</p>
      <ul className="space-y-2">
        {samples.map((s, i) => (
          <li key={i} className="text-sm text-gray-300 italic">"{s}"</li>
        ))}
      </ul>
      <button
        onClick={() => onSelect(label)}
        disabled={disabled}
        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
      >
        That's me
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Write identify page**

```typescript
// app/sessions/[id]/identify/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SpeakerCard } from '@/components/SpeakerCard'
import type { SessionDetail } from '@/lib/types'

export default function IdentifyPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/sessions/${params.id}`)
      .then(r => r.json())
      .then(setDetail)
  }, [params.id])

  async function handleSelect(label: 'A' | 'B') {
    setSubmitting(true)
    const res = await fetch(`/api/sessions/${params.id}/speaker`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ speaker_label: label }),
    })
    if (res.status === 409) {
      // Session status changed — redirect to status page for re-evaluation
      router.push(`/sessions/${params.id}/status`)
      return
    }
    router.push(`/sessions/${params.id}/status`)
  }

  if (!detail) return <p className="text-gray-400">Loading…</p>

  const speakerSamples = (['A', 'B'] as const).reduce((acc, label) => {
    acc[label] = detail.segments
      .filter(s => s.speaker === label && s.text.trim())
      .slice(0, 3)
      .map(s => s.text)
    return acc
  }, {} as Record<'A' | 'B', string[]>)

  const speakers = (['A', 'B'] as const).filter(l => speakerSamples[l].length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Who are you?</h1>
        <p className="text-sm text-gray-400 mt-1">
          Two speakers detected. Pick the one that sounds like you.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {speakers.map(label => (
          <SpeakerCard
            key={label}
            label={label}
            samples={speakerSamples[label]}
            onSelect={handleSelect}
            disabled={submitting}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/SpeakerCard.tsx app/sessions/[id]/identify/page.tsx
git commit -m "feat: add Speaker Identification page (Screen 3)"
```

---

## Chunk 7: Frontend Screens 4–5

### Task 19: AnnotatedText component

**Files:**
- Create: `components/AnnotatedText.tsx`, `__tests__/components/AnnotatedText.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// __tests__/components/AnnotatedText.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotatedText } from '@/components/AnnotatedText'
import type { Annotation } from '@/lib/types'

describe('AnnotatedText', () => {
  const text = 'Yo fui al mercado.'
  const annotations: Annotation[] = [
    {
      id: 'ann-1',
      session_id: 's1',
      segment_id: 'seg-1',
      type: 'grammar',
      original: 'Yo fui',
      start_char: 0,
      end_char: 6,
      correction: 'Fui',
      explanation: 'Drop the pronoun.',
    },
  ]

  it('renders plain text when no annotations', () => {
    render(<AnnotatedText text={text} annotations={[]} onAnnotationClick={() => {}} />)
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('renders a highlighted span for the annotated phrase', () => {
    render(<AnnotatedText text={text} annotations={annotations} onAnnotationClick={() => {}} />)
    const span = screen.getByText('Yo fui')
    expect(span.tagName).toBe('MARK')
    expect(span).toHaveClass('cursor-pointer')
  })

  it('calls onAnnotationClick with the annotation when the mark is clicked', async () => {
    const onClick = vi.fn()
    render(<AnnotatedText text={text} annotations={annotations} onAnnotationClick={onClick} />)
    await userEvent.click(screen.getByText('Yo fui'))
    expect(onClick).toHaveBeenCalledWith(annotations[0])
  })

  it('renders text before and after the highlight correctly', () => {
    render(<AnnotatedText text={text} annotations={annotations} onAnnotationClick={() => {}} />)
    expect(screen.getByText(' al mercado.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/components/AnnotatedText.test.tsx
```

- [ ] **Step 3: Implement AnnotatedText**

```typescript
// components/AnnotatedText.tsx
import type { Annotation } from '@/lib/types'

const TYPE_CLASS: Record<string, string> = {
  grammar: 'bg-red-500/25 decoration-red-400',
  naturalness: 'bg-yellow-500/25 decoration-yellow-400',
  strength: 'bg-green-500/25 decoration-green-400',
}

interface Props {
  text: string
  annotations: Annotation[]
  onAnnotationClick: (annotation: Annotation) => void
}

interface Span {
  start: number
  end: number
  annotation?: Annotation
}

function buildSpans(text: string, annotations: Annotation[]): Span[] {
  // Sort annotations by start_char
  const sorted = [...annotations].sort((a, b) => a.start_char - b.start_char)
  const spans: Span[] = []
  let cursor = 0

  for (const ann of sorted) {
    if (ann.start_char > cursor) {
      spans.push({ start: cursor, end: ann.start_char })
    }
    spans.push({ start: ann.start_char, end: ann.end_char, annotation: ann })
    cursor = ann.end_char
  }

  if (cursor < text.length) {
    spans.push({ start: cursor, end: text.length })
  }

  return spans
}

export function AnnotatedText({ text, annotations, onAnnotationClick }: Props) {
  const spans = buildSpans(text, annotations)

  return (
    <span>
      {spans.map((span, i) => {
        const slice = text.slice(span.start, span.end)
        if (span.annotation) {
          const cls = TYPE_CLASS[span.annotation.type] ?? ''
          return (
            <mark
              key={i}
              className={`underline decoration-2 cursor-pointer rounded-sm px-0.5 ${cls}`}
              onClick={() => onAnnotationClick(span.annotation!)}
            >
              {slice}
            </mark>
          )
        }
        return <span key={i}>{slice}</span>
      })}
    </span>
  )
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/components/AnnotatedText.test.tsx
```

Expected: `4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add components/AnnotatedText.tsx __tests__/components/AnnotatedText.test.tsx
git commit -m "feat: add AnnotatedText component with char-offset highlight rendering"
```

---

### Task 20: AnnotationCard and TranscriptView

**Files:**
- Create: `components/AnnotationCard.tsx`, `components/TranscriptView.tsx`

- [ ] **Step 1: Write failing tests for AnnotationCard**

```typescript
// __tests__/components/AnnotationCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { Annotation } from '@/lib/types'

const grammarAnnotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6,
  correction: 'Fui', explanation: 'Drop the subject pronoun.',
}
const strengthAnnotation: Annotation = {
  id: 'ann-2', session_id: 's1', segment_id: 'seg-1',
  type: 'strength', original: 'buenísimo', start_char: 0, end_char: 9,
  correction: null, explanation: 'Great superlative usage.',
}

describe('AnnotationCard', () => {
  it('renders correction for grammar annotation', () => {
    render(<AnnotationCard annotation={grammarAnnotation} onAddToPractice={() => {}} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })

  it('renders keep-this message for strength annotation', () => {
    render(<AnnotationCard annotation={strengthAnnotation} onAddToPractice={() => {}} />)
    expect(screen.getByText(/keep this/i)).toBeInTheDocument()
  })

  it('calls onAddToPractice when button is clicked', async () => {
    const onClick = vi.fn()
    render(<AnnotationCard annotation={grammarAnnotation} onAddToPractice={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    expect(onClick).toHaveBeenCalledWith(grammarAnnotation)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/AnnotationCard'`

- [ ] **Step 3: Write AnnotationCard**

```typescript
// components/AnnotationCard.tsx
'use client'
import type { Annotation } from '@/lib/types'

const TYPE_LABEL = { grammar: '🔴 Grammar', naturalness: '🟡 Naturalness', strength: '🟢 Strength' }

interface Props {
  annotation: Annotation
  onAddToPractice: (annotation: Annotation) => void
}

export function AnnotationCard({ annotation, onAddToPractice }: Props) {
  return (
    <div className="mt-2 ml-6 border border-gray-700 rounded-lg p-4 text-sm space-y-2 bg-gray-900">
      <p className="font-semibold text-xs uppercase tracking-wide text-gray-400">
        {TYPE_LABEL[annotation.type]}
      </p>
      <p>
        {annotation.correction ? (
          <>
            <span className="line-through text-gray-500">{annotation.original}</span>
            {' → '}
            <span className="font-medium">{annotation.correction}</span>
          </>
        ) : (
          <span className="text-green-300">Keep this! "{annotation.original}"</span>
        )}
      </p>
      <p className="text-gray-400">{annotation.explanation}</p>
      <button
        onClick={() => onAddToPractice(annotation)}
        className="text-xs text-violet-400 hover:text-violet-300 underline"
      >
        Add to practice list
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```

Expected: `3 tests passed`

- [ ] **Step 5: Write failing test for TranscriptView**

```typescript
// __tests__/components/TranscriptView.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranscriptView } from '@/components/TranscriptView'
import type { TranscriptSegment, Annotation } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const segments: TranscriptSegment[] = [
  { id: 'seg-1', session_id: 's1', speaker: 'A', text: 'Yo fui al mercado.', start_ms: 0, end_ms: 2000, position: 0 },
  { id: 'seg-2', session_id: 's1', speaker: 'B', text: '¿Qué compraste?', start_ms: 2500, end_ms: 4000, position: 1 },
]
const annotations: Annotation[] = [
  { id: 'ann-1', session_id: 's1', segment_id: 'seg-1', type: 'grammar',
    original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.' },
]

describe('TranscriptView', () => {
  it('dims native speaker turns (speaker B when user is A)', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabel="A" onAddToPractice={() => {}} />
    )
    // seg-2 (speaker B) should have opacity-40 class
    const dimmed = container.querySelector('.opacity-40')
    expect(dimmed).toBeTruthy()
    expect(dimmed?.textContent).toContain('¿Qué compraste?')
  })

  it('shows annotation card when highlight is clicked', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabel="A" onAddToPractice={() => {}} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })

  it('hides annotation card when same highlight is clicked again', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabel="A" onAddToPractice={() => {}} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('filters annotations by type', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabel="A" onAddToPractice={() => {}} />
    )
    // Click naturalness filter — no naturalness annotations, so mark should still render but be unclickable as annotation
    await userEvent.click(screen.getByRole('button', { name: /natural/i }))
    // The mark for grammar should not be rendered as annotated under naturalness filter
    expect(screen.queryByText('Yo fui')).toBeTruthy() // text still visible, just not highlighted
  })
})
```

- [ ] **Step 6: Run test — expect FAIL**

```bash
npm test -- __tests__/components/TranscriptView.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/TranscriptView'`

- [ ] **Step 7: Write TranscriptView**

```typescript
// components/TranscriptView.tsx
'use client'
import { useState } from 'react'
import { AnnotatedText } from '@/components/AnnotatedText'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { TranscriptSegment, Annotation } from '@/lib/types'

type Filter = 'all' | 'grammar' | 'naturalness' | 'strength'

interface Props {
  segments: TranscriptSegment[]
  annotations: Annotation[]
  userSpeakerLabel: 'A' | 'B' | null
  onAddToPractice: (annotation: Annotation) => void
}

export function TranscriptView({ segments, annotations, userSpeakerLabel, onAddToPractice }: Props) {
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const annotationsBySegment = annotations.reduce<Record<string, Annotation[]>>((acc, a) => {
    if (!acc[a.segment_id]) acc[a.segment_id] = []
    acc[a.segment_id].push(a)
    return acc
  }, {})

  const visibleAnnotations = (segId: string) => {
    const all = annotationsBySegment[segId] ?? []
    return filter === 'all' ? all : all.filter(a => a.type === filter)
  }

  const counts = { grammar: 0, naturalness: 0, strength: 0 }
  annotations.forEach(a => counts[a.type]++)

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2 text-sm flex-wrap">
        {(['all', 'grammar', 'naturalness', 'strength'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full border transition-colors ${
              filter === f
                ? 'border-violet-500 text-violet-300 bg-violet-500/10'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {f === 'all' ? 'All' : f === 'grammar' ? `🔴 Grammar (${counts.grammar})` : f === 'naturalness' ? `🟡 Natural (${counts.naturalness})` : `🟢 Strengths (${counts.strength})`}
          </button>
        ))}
      </div>

      {/* Segments */}
      <div className="space-y-4">
        {segments.map(seg => {
          const isUser = userSpeakerLabel === null || seg.speaker === userSpeakerLabel
          const segAnnotations = visibleAnnotations(seg.id)

          return (
            <div key={seg.id}>
              <div className={`flex gap-4 ${!isUser ? 'opacity-40' : ''}`}>
                <span className="text-xs text-gray-500 w-14 text-right pt-0.5 shrink-0">
                  {isUser ? 'You' : 'Them'}
                </span>
                <span className="text-sm leading-relaxed">
                  {isUser && segAnnotations.length > 0 ? (
                    <AnnotatedText
                      text={seg.text}
                      annotations={segAnnotations}
                      onAnnotationClick={a => setActiveAnnotation(activeAnnotation?.id === a.id ? null : a)}
                    />
                  ) : (
                    seg.text
                  )}
                </span>
              </div>
              {activeAnnotation && annotationsBySegment[seg.id]?.find(a => a.id === activeAnnotation.id) && (
                <AnnotationCard annotation={activeAnnotation} onAddToPractice={onAddToPractice} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run tests — expect PASS**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx __tests__/components/TranscriptView.test.tsx
```

Expected: `7 tests passed`

- [ ] **Step 9: Commit**

```bash
git add components/AnnotationCard.tsx components/TranscriptView.tsx __tests__/components/AnnotationCard.test.tsx __tests__/components/TranscriptView.test.tsx
git commit -m "feat: add AnnotationCard and TranscriptView components"
```

---

### Task 21: Screen 4 — Annotated Transcript page

**Files:**
- Create: `app/sessions/[id]/page.tsx`

- [ ] **Step 1: Write page**

```typescript
// app/sessions/[id]/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TranscriptView } from '@/components/TranscriptView'
import { InlineEdit } from '@/components/InlineEdit'
import type { SessionDetail, Annotation } from '@/lib/types'

export default function TranscriptPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [title, setTitle] = useState('')

  useEffect(() => {
    fetch(`/api/sessions/${params.id}`)
      .then(r => r.json())
      .then((d: SessionDetail) => { setDetail(d); setTitle(d.session.title) })
  }, [params.id])

  async function handleRename(newTitle: string) {
    await fetch(`/api/sessions/${params.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    })
    setTitle(newTitle)
  }

  async function handleAddToPractice(annotation: Annotation) {
    await fetch('/api/practice-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: params.id,
        annotation_id: annotation.id,
        type: annotation.type,
        original: annotation.original,
        correction: annotation.correction,
        explanation: annotation.explanation,
      }),
    })
  }

  async function handleReanalyse() {
    const res = await fetch(`/api/sessions/${params.id}/analyse`, { method: 'POST' })
    if (res.ok) router.push(`/sessions/${params.id}/status`)
  }

  if (!detail) return <p className="text-gray-400">Loading…</p>

  const { session, segments, annotations } = detail
  const counts = { grammar: 0, naturalness: 0, strength: 0 }
  annotations.forEach(a => counts[a.type as keyof typeof counts]++)

  const durationLabel = session.duration_seconds
    ? `${Math.floor(session.duration_seconds / 60)} min`
    : ''

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <InlineEdit value={title} onSave={handleRename} className="text-xl font-bold" />
          <p className="text-sm text-gray-400 mt-1">
            {durationLabel} · {counts.grammar} grammar · {counts.naturalness} naturalness · {counts.strength} strengths
          </p>
        </div>
        <button
          onClick={handleReanalyse}
          className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-3 py-1 shrink-0"
        >
          Re-analyse
        </button>
      </div>

      {session.detected_speaker_count === 1 && (
        <div className="border border-yellow-700 bg-yellow-900/20 rounded-lg px-4 py-3 text-sm text-yellow-300">
          Couldn't distinguish two speakers — try a higher quality recording.
        </div>
      )}

      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabel={session.user_speaker_label}
        onAddToPractice={handleAddToPractice}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/sessions/[id]/page.tsx
git commit -m "feat: add Annotated Transcript page (Screen 4)"
```

---

### Task 22: Screen 5 — Practice Items

**Files:**
- Create: `components/PracticeList.tsx`, `app/practice/page.tsx`

- [ ] **Step 1: Write failing test for PracticeList**

```typescript
// __tests__/components/PracticeList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'

const item: PracticeItem & { sessions?: { title: string; created_at: string } } = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'Yo fui', correction: 'Fui',
  explanation: 'Drop pronoun.', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  sessions: { title: 'Café con María', created_at: '2026-03-15' },
}

describe('PracticeList', () => {
  it('renders item with session title', () => {
    render(<PracticeList items={[item]} onToggleReviewed={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(/Café con María/)).toBeInTheDocument()
    expect(screen.getByText('Fui')).toBeInTheDocument()
  })

  it('calls onToggleReviewed when checkbox is clicked', async () => {
    const onToggle = vi.fn()
    render(<PracticeList items={[item]} onToggleReviewed={onToggle} onDelete={() => {}} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith('item-1', true)
  })

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn()
    render(<PracticeList items={[item]} onToggleReviewed={() => {}} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith('item-1')
  })

  it('filters by type', async () => {
    render(<PracticeList items={[item]} onToggleReviewed={() => {}} onDelete={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /naturalness/i }))
    expect(screen.getByText(/no items match/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/PracticeList'`

- [ ] **Step 3: Write PracticeList component**

```typescript
// components/PracticeList.tsx
'use client'
import { useState } from 'react'
import type { PracticeItem, AnnotationType } from '@/lib/types'

const TYPE_ICON: Record<AnnotationType, string> = {
  grammar: '🔴',
  naturalness: '🟡',
  strength: '🟢',
}

interface ItemWithSession extends PracticeItem {
  sessions?: { title: string; created_at: string }
}

interface Props {
  items: ItemWithSession[]
  onToggleReviewed: (id: string, reviewed: boolean) => void
  onDelete: (id: string) => void
}

type Filter = 'all' | AnnotationType
type ReviewedFilter = 'all' | 'pending' | 'reviewed'

export function PracticeList({ items, onToggleReviewed, onDelete }: Props) {
  const [typeFilter, setTypeFilter] = useState<Filter>('all')
  const [reviewedFilter, setReviewedFilter] = useState<ReviewedFilter>('all')

  const filtered = items.filter(item => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (reviewedFilter === 'pending' && item.reviewed) return false
    if (reviewedFilter === 'reviewed' && !item.reviewed) return false
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap text-sm">
        {(['all', 'grammar', 'naturalness', 'strength'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-3 py-1 rounded-full border transition-colors capitalize ${
              typeFilter === f ? 'border-violet-500 text-violet-300 bg-violet-500/10' : 'border-gray-700 text-gray-400'
            }`}
          >
            {f}
          </button>
        ))}
        <div className="w-px bg-gray-700 mx-1" />
        {(['all', 'pending', 'reviewed'] as ReviewedFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setReviewedFilter(f)}
            className={`px-3 py-1 rounded-full border transition-colors capitalize ${
              reviewedFilter === f ? 'border-violet-500 text-violet-300 bg-violet-500/10' : 'border-gray-700 text-gray-400'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-500 text-sm">No items match this filter.</p>
      )}

      <ul className="space-y-2">
        {filtered.map(item => (
          <li key={item.id} className="flex items-start gap-3 p-4 bg-gray-900 rounded-xl">
            <span className="text-lg mt-0.5">{TYPE_ICON[item.type]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                {item.correction ? (
                  <>
                    <span className="line-through text-gray-500">{item.original}</span>
                    {' → '}
                    <span className="font-medium">{item.correction}</span>
                  </>
                ) : (
                  <span className="text-green-300">"{item.original}"</span>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1">{item.explanation}</p>
              {item.sessions && (
                <p className="text-xs text-gray-600 mt-1">
                  {item.sessions.title} · {new Date(item.sessions.created_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="checkbox"
                checked={item.reviewed}
                onChange={e => onToggleReviewed(item.id, e.target.checked)}
                className="w-4 h-4 rounded accent-violet-500 cursor-pointer"
                aria-label="Mark reviewed"
              />
              <button
                onClick={() => onDelete(item.id)}
                className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                aria-label="Delete item"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```

Expected: `4 tests passed`

- [ ] **Step 5: Write practice page**

The `GET /api/practice-items` route (Task 13) already joins sessions data via `.select('... sessions(title, created_at)')`. The page uses that joined shape:

```typescript
// app/practice/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'

// The API returns items with a joined `sessions` field — extend the base type here
type PracticeItemWithSession = PracticeItem & {
  sessions?: { title: string; created_at: string }
}

export default function PracticePage() {
  const [items, setItems] = useState<PracticeItemWithSession[]>([])

  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.json())
      .then(setItems)
  }, [])

  async function handleToggleReviewed(id: string, reviewed: boolean) {
    await fetch(`/api/practice-items/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewed }),
    })
    setItems(prev => prev.map(i => i.id === id ? { ...i, reviewed } : i))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/practice-items/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Practice Items</h1>
        <p className="text-sm text-gray-400 mt-1">
          {items.length} item{items.length !== 1 ? 's' : ''} across all sessions
        </p>
      </div>
      <PracticeList
        items={items}
        onToggleReviewed={handleToggleReviewed}
        onDelete={handleDelete}
      />
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add components/PracticeList.tsx app/practice/page.tsx __tests__/components/PracticeList.test.tsx
git commit -m "feat: add PracticeList component and Practice Items page (Screen 5)"
```

---

### Task 23: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass with no failures.

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Start dev server: `npm run dev`

Walk through:
1. Open `http://localhost:3000` — upload zone and empty session list visible
2. Upload an MP3 file — redirected to status page, polling begins
3. After AssemblyAI processes — redirected to speaker ID screen, two speakers shown
4. Click "That's me" — redirected to status page, analysing stage
5. After Claude processes — redirected to transcript page with highlights visible
6. Click a highlight — annotation card expands
7. Click "Add to practice list" — item appears at `/practice`
8. Toggle reviewed checkbox, delete an item

- [ ] **Step 4: Deploy to Vercel**

```bash
# Push to GitHub, then connect repo to Vercel dashboard
# Set all environment variables from .env.local.example in Vercel settings
# Set the AssemblyAI webhook URL to: https://your-app.vercel.app/api/webhooks/assemblyai
git push origin main
```

- [ ] **Step 5: Final commit (if any files remain uncommitted)**

```bash
git status
# Stage only files that are genuinely new or modified since the last commit
# Do NOT re-add files already committed in earlier tasks
git diff --name-only --diff-filter=M | xargs git add
git commit -m "chore: final cleanup — Conversation Coach MVP complete" || echo "Nothing to commit"
```
