# Multi-Speaker Selection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to select one or more speaker tracks as themselves on the identify screen, replacing the single `user_speaker_label` column with a `user_speaker_labels text[]` array throughout the stack.

**Architecture:** DB migration renames the column and changes its type to `text[]`. All server-side code (`types.ts`, API routes, pipeline, webhook) is updated to read/write an array. The `SpeakerCard` UI becomes a toggle; the identify page holds a selection set and submits it via a Confirm button. `TranscriptView` uses `.includes()` instead of `===` to identify user segments.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase/PostgreSQL, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-16-multi-speaker-selection-design.md`

---

## Chunk 1: Backend

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/002_multi_speaker_labels.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/002_multi_speaker_labels.sql

-- Add the new array column
alter table sessions
  add column user_speaker_labels text[]
    check (user_speaker_labels <@ array['A','B']::text[]);

-- Backfill from existing single-label column
update sessions
  set user_speaker_labels = array[user_speaker_label]
  where user_speaker_label is not null;

-- Drop the old column
alter table sessions drop column user_speaker_label;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase dashboard (SQL editor) or your preferred migration tool.
Verify by running `SELECT id, user_speaker_labels FROM sessions LIMIT 5;` in the dashboard — existing rows should show `{A}` or `{B}`.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/002_multi_speaker_labels.sql
git commit -m "feat: migrate user_speaker_label to user_speaker_labels array"
```

---

### Task 2: Update Types and Simple String References

**Files:**
- Modify: `lib/types.ts`
- Modify: `app/api/sessions/[id]/route.ts`

- [ ] **Step 1: Update `lib/types.ts`**

In the `Session` interface, replace:
```ts
user_speaker_label: 'A' | 'B' | null
```
with:
```ts
user_speaker_labels: ('A' | 'B')[] | null
```

In the `SessionDetail` interface, update the `Pick` to use the new field name:
```ts
export interface SessionDetail {
  session: Pick<Session,
    'id' | 'title' | 'status' | 'error_stage' | 'duration_seconds' |
    'detected_speaker_count' | 'user_speaker_labels' | 'created_at'
  >
  segments: TranscriptSegment[]
  annotations: Annotation[]
}
```

- [ ] **Step 2: Update the GET handler select string in `app/api/sessions/[id]/route.ts` (line 12)**

```ts
// Before
.select('id, title, status, error_stage, duration_seconds, detected_speaker_count, user_speaker_label, created_at')

// After
.select('id, title, status, error_stage, duration_seconds, detected_speaker_count, user_speaker_labels, created_at')
```

- [ ] **Step 3: Run the build to surface remaining type errors**

```bash
npm run build
```

Expected: TypeScript will report errors in every file that still references `user_speaker_label`. This gives you a complete list of files that need updating — work through them in the tasks below.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts app/api/sessions/[id]/route.ts
git commit -m "feat: rename user_speaker_label to user_speaker_labels array in types and GET route"
```

---

### Task 3: Speaker Route — Tests Then Implementation

**Files:**
- Create: `__tests__/api/speaker.test.ts`
- Modify: `app/api/sessions/[id]/speaker/route.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/api/speaker.test.ts`:

```ts
// __tests__/api/speaker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/pipeline', () => ({ runClaudeAnalysis: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { runClaudeAnalysis } from '@/lib/pipeline'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/sessions/s1/speaker', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDb(status = 'identifying') {
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const mockDb = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { status }, error: null }),
        }),
      }),
      update: updateMock,
    }),
    updateMock,
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  return mockDb
}

beforeEach(() => { vi.clearAllMocks() })

describe('POST /api/sessions/:id/speaker', () => {
  it('returns 400 for missing speaker_labels', async () => {
    makeDb()
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({}), { params: { id: 's1' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty array', async () => {
    makeDb()
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: [] }), { params: { id: 's1' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid label values', async () => {
    makeDb()
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: ['C'] }), { params: { id: 's1' } })
    expect(res.status).toBe(400)
  })

  it('returns 409 if session is not in identifying state', async () => {
    makeDb('ready')
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: ['A'] }), { params: { id: 's1' } })
    expect(res.status).toBe(409)
  })

  it('accepts ["A"] and writes user_speaker_labels to DB', async () => {
    vi.mocked(runClaudeAnalysis).mockResolvedValue(undefined)
    const { updateMock } = makeDb()
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: ['A'] }), { params: { id: 's1' } })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      user_speaker_labels: ['A'],
      status: 'analysing',
    }))
  })

  it('accepts ["B"] and writes user_speaker_labels to DB', async () => {
    vi.mocked(runClaudeAnalysis).mockResolvedValue(undefined)
    const { updateMock } = makeDb()
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: ['B'] }), { params: { id: 's1' } })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      user_speaker_labels: ['B'],
      status: 'analysing',
    }))
  })

  it('accepts ["A", "B"] and writes both labels to DB', async () => {
    vi.mocked(runClaudeAnalysis).mockResolvedValue(undefined)
    const { updateMock } = makeDb()
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: ['A', 'B'] }), { params: { id: 's1' } })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      user_speaker_labels: ['A', 'B'],
      status: 'analysing',
    }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/api/speaker.test.ts
```

Expected: FAIL — the route still uses `speaker_label` (singular).

- [ ] **Step 3: Rewrite `app/api/sessions/[id]/speaker/route.ts`**

```ts
// app/api/sessions/[id]/speaker/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { runClaudeAnalysis } from '@/lib/pipeline'

const VALID_LABELS = new Set(['A', 'B'])

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json() as { speaker_labels?: unknown }
  const { speaker_labels } = body

  if (
    !Array.isArray(speaker_labels) ||
    speaker_labels.length === 0 ||
    !speaker_labels.every(l => VALID_LABELS.has(l))
  ) {
    return NextResponse.json(
      { error: 'speaker_labels must be a non-empty array of "A" and/or "B"' },
      { status: 400 }
    )
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
    user_speaker_labels: speaker_labels as ('A' | 'B')[],
    status: 'analysing',
  }).eq('id', params.id)

  runClaudeAnalysis(params.id).catch(err =>
    console.error(`Claude analysis failed for session ${params.id}:`, err)
  )

  return NextResponse.json({ status: 'analysing' })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/api/speaker.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add __tests__/api/speaker.test.ts app/api/sessions/[id]/speaker/route.ts
git commit -m "feat: speaker route accepts array of labels"
```

---

### Task 4: Pipeline — Tests Then Implementation

**Files:**
- Modify: `__tests__/lib/pipeline.test.ts`
- Modify: `lib/pipeline.ts`

- [ ] **Step 1: Update pipeline tests**

In `__tests__/lib/pipeline.test.ts`, make three changes:

1. In the existing test's mock, replace the `user_speaker_label` key with `user_speaker_labels` (array). Find and replace this exact block:

```ts
// OLD — find this in the existing test mock
single: vi.fn().mockResolvedValue({
  data: { user_speaker_label: 'A', audio_r2_key: 'audio/test.mp3' },
  error: null,
}),
```

```ts
// NEW — replace with
single: vi.fn().mockResolvedValue({
  data: { user_speaker_labels: ['A'], audio_r2_key: 'audio/test.mp3' },
  error: null,
}),
```

2. Add a test for `['B']` only — add it after the existing test:

```ts
it('passes only speaker B segments when user_speaker_labels is ["B"]', async () => {
  const insertAnnotationsMock = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [], error: null }),
  })
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { user_speaker_labels: ['B'], audio_r2_key: null },
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
                data: [
                  { id: 'seg-1', speaker: 'A', text: 'Hola.' },
                  { id: 'seg-2', speaker: 'B', text: 'Buenos días.' },
                ],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'annotations') return { insert: insertAnnotationsMock }
      if (table === 'practice_items') return { insert: vi.fn().mockResolvedValue({ error: null }) }
      return {}
    }),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  vi.mocked(analyseUserTurns).mockResolvedValue([])
  vi.mocked(deleteObject).mockResolvedValue(undefined)

  await runClaudeAnalysis('session-1')

  // Only the speaker B segment should be passed to Claude
  expect(vi.mocked(analyseUserTurns)).toHaveBeenCalledWith([
    { id: 'seg-2', text: 'Buenos días.' },
  ])
})
```

3. Add a test for the both-speakers case — add it after the `['B']` test:

```ts
it('passes segments from both speakers when user_speaker_labels is ["A","B"]', async () => {
  const insertAnnotationsMock = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [], error: null }),
  })
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { user_speaker_labels: ['A', 'B'], audio_r2_key: null },
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
                data: [
                  { id: 'seg-1', speaker: 'A', text: 'Hola.' },
                  { id: 'seg-2', speaker: 'B', text: 'Buenos días.' },
                ],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'annotations') return { insert: insertAnnotationsMock }
      if (table === 'practice_items') return { insert: vi.fn().mockResolvedValue({ error: null }) }
      return {}
    }),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  vi.mocked(analyseUserTurns).mockResolvedValue([])
  vi.mocked(deleteObject).mockResolvedValue(undefined)

  await runClaudeAnalysis('session-1')

  // Both segments should be passed to Claude
  expect(vi.mocked(analyseUserTurns)).toHaveBeenCalledWith([
    { id: 'seg-1', text: 'Hola.' },
    { id: 'seg-2', text: 'Buenos días.' },
  ])
})
```

- [ ] **Step 2: Run tests to verify the existing test fails** (before implementing)

```bash
npm test -- __tests__/lib/pipeline.test.ts
```

Expected: the existing test FAILS because the mock still references `user_speaker_label` in the source code (old column name).

- [ ] **Step 3: Update `lib/pipeline.ts`**

Change the `.select()` call (line 12) and the `.filter()` call (line 24–26):

```ts
// line 12 — update select
const { data: session } = await db
  .from('sessions')
  .select('user_speaker_labels, audio_r2_key')
  .eq('id', sessionId)
  .single()

// line 24–26 — update filter
const userTurns = (segments ?? [])
  .filter((s: TranscriptSegment) => session.user_speaker_labels.includes(s.speaker))
  .map((s: TranscriptSegment) => ({ id: s.id, text: s.text }))
```

- [ ] **Step 4: Run tests to verify all three pass**

```bash
npm test -- __tests__/lib/pipeline.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add __tests__/lib/pipeline.test.ts lib/pipeline.ts
git commit -m "feat: pipeline filters user turns by labels array"
```

---

### Task 5: Webhook — Update Test Then Implementation

**Files:**
- Modify: `__tests__/api/webhook.test.ts`
- Modify: `app/api/webhooks/assemblyai/route.ts`

- [ ] **Step 1: Replace the single-speaker test in `__tests__/api/webhook.test.ts`**

Find the `it('triggers Claude analysis immediately for single-speaker', ...)` block and **replace the entire `it(...)` body** with the version below. The replacement introduces a named `updateMock` and adds an assertion that `user_speaker_labels: ['A']` is written (the existing test only asserted `runClaudeAnalysis` was called).

```ts
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
  const req = requestWithSecret({ transcript_id: 'known-job', status: 'completed', utterances: [] })
  await POST(req)

  expect(vi.mocked(runClaudeAnalysis)).toHaveBeenCalledWith('session-1')
  // Verify the array column is used, not the old singular column
  expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
    user_speaker_labels: ['A'],
  }))
})
```

- [ ] **Step 2: Run tests to verify the updated test fails**

```bash
npm test -- __tests__/api/webhook.test.ts
```

Expected: `'triggers Claude analysis immediately for single-speaker'` FAILS — the route still writes `user_speaker_label: 'A'`.

- [ ] **Step 3: Update `app/api/webhooks/assemblyai/route.ts`**

In the single-speaker branch (~line 86), change the DB update:

```ts
// Before
await db.from('sessions').update({
  status: 'analysing',
  detected_speaker_count: 1,
  user_speaker_label: 'A',
}).eq('id', session.id)

// After
await db.from('sessions').update({
  status: 'analysing',
  detected_speaker_count: 1,
  user_speaker_labels: ['A'],
}).eq('id', session.id)
```

- [ ] **Step 4: Run tests to verify all webhook tests pass**

```bash
npm test -- __tests__/api/webhook.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add __tests__/api/webhook.test.ts app/api/webhooks/assemblyai/route.ts
git commit -m "feat: webhook writes user_speaker_labels array for single-speaker sessions"
```

---

## Chunk 2: Frontend

### Task 6: SpeakerCard — Tests Then Implementation

**Files:**
- Create: `__tests__/components/SpeakerCard.test.tsx`
- Modify: `components/SpeakerCard.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/SpeakerCard.test.tsx`:

```tsx
// __tests__/components/SpeakerCard.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SpeakerCard } from '@/components/SpeakerCard'

const samples = ['Che, ¿cómo andás?', 'No sé bien.']

describe('SpeakerCard', () => {
  it('renders speaker label and sample text', () => {
    render(<SpeakerCard label="A" samples={samples} onToggle={vi.fn()} selected={false} disabled={false} />)
    expect(screen.getByText(/speaker a/i)).toBeInTheDocument()
    expect(screen.getByText(/che/i)).toBeInTheDocument()
  })

  it('calls onToggle with the label when clicked', async () => {
    const onToggle = vi.fn()
    render(<SpeakerCard label="A" samples={samples} onToggle={onToggle} selected={false} disabled={false} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledWith('A')
  })

  it('shows a checkmark when selected', () => {
    const { container } = render(
      <SpeakerCard label="A" samples={samples} onToggle={vi.fn()} selected={true} disabled={false} />
    )
    // Selected card should have a visual indicator — a checkmark element
    expect(container.querySelector('[data-testid="checkmark"]')).toBeInTheDocument()
  })

  it('does not call onToggle when disabled', async () => {
    const onToggle = vi.fn()
    render(<SpeakerCard label="A" samples={samples} onToggle={onToggle} selected={false} disabled={true} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/components/SpeakerCard.test.tsx
```

Expected: FAIL — current `SpeakerCard` uses `onSelect`, not `onToggle`, and has no `selected` prop.

- [ ] **Step 3: Rewrite `components/SpeakerCard.tsx`**

```tsx
// components/SpeakerCard.tsx
'use client'

interface Props {
  label: 'A' | 'B'
  samples: string[]
  onToggle: (label: 'A' | 'B') => void
  selected: boolean
  disabled: boolean
}

export function SpeakerCard({ label, samples, onToggle, selected, disabled }: Props) {
  return (
    <button
      onClick={() => onToggle(label)}
      disabled={disabled}
      className={`text-left border rounded-xl p-5 space-y-4 w-full transition-colors ${
        selected
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-gray-700 hover:border-gray-500'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-gray-500">Speaker {label}</p>
        {selected && (
          <span data-testid="checkmark" className="text-violet-400 text-sm">✓</span>
        )}
      </div>
      <ul className="space-y-2">
        {samples.map((s, i) => (
          <li key={i} className="text-sm text-gray-300 italic">&ldquo;{s}&rdquo;</li>
        ))}
      </ul>
    </button>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/components/SpeakerCard.test.tsx
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add __tests__/components/SpeakerCard.test.tsx components/SpeakerCard.tsx
git commit -m "feat: SpeakerCard becomes a toggle with selected state"
```

---

### Task 7: Identify Page — Tests Then Implementation

**Files:**
- Create: `__tests__/pages/IdentifyPage.test.tsx`
- Modify: `app/sessions/[id]/identify/page.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/pages/IdentifyPage.test.tsx`:

```tsx
// __tests__/pages/IdentifyPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

import IdentifyPage from '@/app/sessions/[id]/identify/page'

const mockDetail = {
  session: { id: 's1' },
  segments: [
    { id: 'seg-1', session_id: 's1', speaker: 'A', text: 'Hola.', start_ms: 0, end_ms: 1000, position: 0 },
    { id: 'seg-2', session_id: 's1', speaker: 'B', text: 'Buenos días.', start_ms: 1100, end_ms: 2000, position: 1 },
    { id: 'seg-3', session_id: 's1', speaker: 'A', text: '¿Cómo andás?', start_ms: 2100, end_ms: 3000, position: 2 },
  ],
  annotations: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockResolvedValue({
    json: () => Promise.resolve(mockDetail),
    status: 200,
    ok: true,
  })
})

describe('IdentifyPage', () => {
  it('renders speaker cards after loading', async () => {
    render(<IdentifyPage params={{ id: 's1' }} />)
    await waitFor(() => {
      expect(screen.getByText(/speaker a/i)).toBeInTheDocument()
      expect(screen.getByText(/speaker b/i)).toBeInTheDocument()
    })
  })

  it('confirm button is disabled when no speakers selected', async () => {
    render(<IdentifyPage params={{ id: 's1' }} />)
    await waitFor(() => screen.getByText(/confirm/i))
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
  })

  it('confirm button is enabled after selecting one speaker', async () => {
    render(<IdentifyPage params={{ id: 's1' }} />)
    await waitFor(() => screen.getByText(/speaker a/i))
    await userEvent.click(screen.getAllByRole('button')[0]) // click Speaker A card
    expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled()
  })

  it('posts speaker_labels array on confirm', async () => {
    // Second fetch call is the POST
    mockFetch
      .mockResolvedValueOnce({ json: () => Promise.resolve(mockDetail), status: 200, ok: true })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ status: 'analysing' }), status: 200, ok: true })

    render(<IdentifyPage params={{ id: 's1' }} />)
    await waitFor(() => screen.getByText(/speaker a/i))

    // Select Speaker A, then click Confirm
    await userEvent.click(screen.getAllByRole('button')[0])
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      const postCall = mockFetch.mock.calls.find(
        ([url, opts]) => url.includes('/speaker') && opts?.method === 'POST'
      )
      expect(postCall).toBeTruthy()
      const body = JSON.parse(postCall![1].body)
      expect(body.speaker_labels).toEqual(['A'])
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/pages/IdentifyPage.test.tsx
```

Expected: FAIL — current page uses `onSelect` and has no Confirm button.

- [ ] **Step 3: Rewrite `app/sessions/[id]/identify/page.tsx`**

```tsx
// app/sessions/[id]/identify/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SpeakerCard } from '@/components/SpeakerCard'
import type { SessionDetail } from '@/lib/types'

export default function IdentifyPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [selectedLabels, setSelectedLabels] = useState<Set<'A' | 'B'>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/sessions/${params.id}`)
      .then(r => r.json())
      .then(setDetail)
  }, [params.id])

  function handleToggle(label: 'A' | 'B') {
    setSelectedLabels(prev => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  async function handleConfirm() {
    setSubmitting(true)
    const res = await fetch(`/api/sessions/${params.id}/speaker`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ speaker_labels: [...selectedLabels] }),
    })
    if (res.status === 409) {
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
        <h1 className="text-xl font-semibold">Select all speakers that are you</h1>
        <p className="text-sm text-gray-400 mt-1">
          Tap a speaker to select it. You can select both if they&apos;re all you.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {speakers.map(label => (
          <SpeakerCard
            key={label}
            label={label}
            samples={speakerSamples[label]}
            onToggle={handleToggle}
            selected={selectedLabels.has(label)}
            disabled={submitting}
          />
        ))}
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={selectedLabels.size === 0 || submitting}
          className="px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          Confirm →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/pages/IdentifyPage.test.tsx
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add __tests__/pages/IdentifyPage.test.tsx app/sessions/[id]/identify/page.tsx
git commit -m "feat: identify page multi-select with confirm button"
```

---

### Task 8: TranscriptView + Transcript Page — Tests Then Implementation

**Files:**
- Modify: `__tests__/components/TranscriptView.test.tsx`
- Modify: `components/TranscriptView.tsx`
- Modify: `app/sessions/[id]/page.tsx`

- [ ] **Step 1: Update `TranscriptView` tests**

In `__tests__/components/TranscriptView.test.tsx`, make three changes:

1. Rename all `userSpeakerLabel` prop usages to `userSpeakerLabels` and wrap values in arrays:
   - `userSpeakerLabel="A"` → `userSpeakerLabels={['A']}`

2. Update the existing `'dims native speaker turns'` test — the assertion is unchanged (Speaker B should still be dimmed when user is `['A']`).

3. Add a new test for the both-speakers case:

```tsx
it('does not dim any segments when userSpeakerLabels is ["A","B"]', () => {
  const { container } = render(
    <TranscriptView
      segments={segments}
      annotations={[]}
      userSpeakerLabels={['A', 'B']}
      onAddToPractice={() => {}}
    />
  )
  expect(container.querySelector('.opacity-40')).toBeNull()
})
```

The full updated file:

```tsx
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
  it('dims native speaker turns (speaker B when user is ["A"])', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} onAddToPractice={() => {}} />
    )
    const dimmed = container.querySelector('.opacity-40')
    expect(dimmed).toBeTruthy()
    expect(dimmed?.textContent).toContain('¿Qué compraste?')
  })

  it('does not dim any segments when userSpeakerLabels is ["A","B"]', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={[]} userSpeakerLabels={['A', 'B']} onAddToPractice={() => {}} />
    )
    expect(container.querySelector('.opacity-40')).toBeNull()
  })

  it('shows annotation card when highlight is clicked', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} onAddToPractice={() => {}} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })

  it('hides annotation card when same highlight is clicked again', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} onAddToPractice={() => {}} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('filters annotations by type', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} onAddToPractice={() => {}} />
    )
    await userEvent.click(screen.getByRole('button', { name: /natural/i }))
    expect(screen.queryByText('Yo fui')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/components/TranscriptView.test.tsx
```

Expected: FAIL — `TranscriptView` still uses `userSpeakerLabel` (singular).

- [ ] **Step 3: Update `components/TranscriptView.tsx`**

Change the `Props` interface and `isUser` logic:

```ts
// Props interface — rename prop
interface Props {
  segments: TranscriptSegment[]
  annotations: Annotation[]
  userSpeakerLabels: ('A' | 'B')[] | null   // was: userSpeakerLabel: 'A' | 'B' | null
  onAddToPractice: (annotation: Annotation) => void
}
```

Update the function signature:
```ts
export function TranscriptView({ segments, annotations, userSpeakerLabels, onAddToPractice }: Props) {
```

Update the `isUser` logic (line ~52):
```ts
// Before
const isUser = userSpeakerLabel === null || seg.speaker === userSpeakerLabel

// After
const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)
```

- [ ] **Step 4: Update `app/sessions/[id]/page.tsx` (line 85)**

```tsx
// Before
userSpeakerLabel={session.user_speaker_label}

// After
userSpeakerLabels={session.user_speaker_labels}
```

- [ ] **Step 5: Run TranscriptView tests to verify they pass**

```bash
npm test -- __tests__/components/TranscriptView.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: all tests PASS with no failures.

- [ ] **Step 7: Run build to verify no TypeScript errors**

```bash
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add __tests__/components/TranscriptView.test.tsx components/TranscriptView.tsx app/sessions/[id]/page.tsx
git commit -m "feat: TranscriptView supports multiple user speaker labels"
```
