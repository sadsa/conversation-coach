# Practice Toggle, Processing Time & Home Polling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add remove-from-practice-list toggle, track pipeline processing time per session, and keep the user on the home page after upload with live status polling instead of navigating away.

**Architecture:** Three independent features sharing a common data flow. Feature 1 changes the `addedAnnotations` shape from a flat array to a `Record<annotationId, practiceItemId>` map so the AnnotationCard can call DELETE. Feature 2 adds a `processing_completed_at` DB column written by the pipeline and surfaced through the session list API. Feature 3 removes the post-upload navigation and replaces it with a polling loop that updates session state in place.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (PostgreSQL), Vitest + React Testing Library, Tailwind CSS.

---

## File Map

| File | Change |
|---|---|
| `lib/types.ts` | Update `SessionDetail`, `SessionListItem`, `Session` |
| `app/api/sessions/[id]/route.ts` | Select `id` from practice_items, return `addedAnnotations` map |
| `app/api/sessions/route.ts` | Add `processing_completed_at` to select |
| `lib/pipeline.ts` | Set `processing_completed_at` when marking ready |
| `supabase/migrations/20260328000000_add_processing_completed_at.sql` | New column |
| `components/AnnotationCard.tsx` | Toggle add/remove, track `practiceItemId` in state |
| `components/TranscriptView.tsx` | Thread `addedAnnotations` Map + both callbacks |
| `components/SessionList.tsx` | Show `⚡ Xs` for processing time; spinner + border for in-progress |
| `app/sessions/[id]/page.tsx` | Map state, `handleAnnotationRemoved`, updated TranscriptView props |
| `app/page.tsx` | Remove router.push, prepend session, start polling |
| `__tests__/components/AnnotationCard.test.tsx` | Update for new props + remove behaviour |
| `__tests__/api/sessions.test.ts` | Update for `addedAnnotations` map shape |
| `__tests__/components/SessionList.test.tsx` | Add `processing_completed_at` to fixtures |

---

## Task 1: Session detail API — return addedAnnotations map

**Files:**
- Modify: `app/api/sessions/[id]/route.ts`
- Modify: `lib/types.ts`
- Modify: `__tests__/api/sessions.test.ts`

- [ ] **Step 1: Update the failing test to expect the new shape**

In `__tests__/api/sessions.test.ts`, find the `'GET /api/sessions/:id'` describe block and replace the test:

```ts
describe('GET /api/sessions/:id', () => {
  it('returns session detail with segments, annotations, and addedAnnotations map', async () => {
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 's1', title: 'Test', status: 'ready', error_stage: null,
                    duration_seconds: 60, detected_speaker_count: 2, user_speaker_labels: ['A'],
                    created_at: '2026-03-15' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'practice_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'pi-1', annotation_id: 'ann-1' }],
                error: null,
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
    expect(body.addedAnnotations).toEqual({ 'ann-1': 'pi-1' })
  })
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: FAIL — `body.addedAnnotations` is undefined.

- [ ] **Step 3: Update the session detail API route**

Replace the practice_items query and response in `app/api/sessions/[id]/route.ts`:

```ts
  const { data: practiceItems } = await db
    .from('practice_items')
    .select('id, annotation_id')
    .eq('session_id', params.id)

  const addedAnnotations = (practiceItems ?? []).reduce<Record<string, string>>(
    (acc, p: { id: string; annotation_id: string | null }) => {
      if (p.annotation_id) acc[p.annotation_id] = p.id
      return acc
    },
    {}
  )

  return NextResponse.json({
    session,
    segments: segments ?? [],
    annotations: annotations ?? [],
    addedAnnotations,
  })
```

- [ ] **Step 4: Update `lib/types.ts` — SessionDetail**

Replace the `addedAnnotationIds` field in `SessionDetail`:

```ts
export interface SessionDetail {
  session: Pick<Session,
    'id' | 'title' | 'status' | 'error_stage' | 'duration_seconds' |
    'detected_speaker_count' | 'user_speaker_labels' | 'created_at'
  >
  segments: TranscriptSegment[]
  annotations: Annotation[]
  addedAnnotations: Record<string, string>   // annotationId -> practiceItemId
}
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/sessions/\[id\]/route.ts lib/types.ts __tests__/api/sessions.test.ts
git commit -m "feat: session detail API returns addedAnnotations map (annotationId -> practiceItemId)"
```

---

## Task 2: AnnotationCard — add/remove toggle

**Files:**
- Modify: `components/AnnotationCard.tsx`
- Modify: `__tests__/components/AnnotationCard.test.tsx`

- [ ] **Step 1: Rewrite the AnnotationCard tests**

Replace the entire contents of `__tests__/components/AnnotationCard.test.tsx`:

```ts
// __tests__/components/AnnotationCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { Annotation } from '@/lib/types'

const grammarAnnotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6,
  correction: 'Fui', explanation: 'Drop the subject pronoun.', sub_category: 'subjunctive',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
}

const defaultProps = {
  sessionId: 's1',
  practiceItemId: null,
  onAnnotationAdded: vi.fn(),
  onAnnotationRemoved: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AnnotationCard', () => {
  it('renders correction for grammar annotation', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })

  it('shows muted "Added" button when practiceItemId is set', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} practiceItemId="pi-1" />)
    const btn = screen.getByRole('button', { name: /added to practice/i })
    expect(btn).not.toBeDisabled()
    expect(btn).toHaveClass('bg-gray-700')
  })

  it('shows indigo "Add" button when practiceItemId is null', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    const btn = screen.getByRole('button', { name: /add to practice list/i })
    expect(btn).toHaveClass('bg-indigo-600')
  })

  it('calls POST and onAnnotationAdded with both ids on successful add', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'pi-1' }),
    } as Response)
    const onAnnotationAdded = vi.fn()
    render(
      <AnnotationCard
        annotation={grammarAnnotation}
        {...defaultProps}
        onAnnotationAdded={onAnnotationAdded}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to practice list/i }))
    expect(fetchSpy).toHaveBeenCalledWith('/api/practice-items', expect.objectContaining({ method: 'POST' }))
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1', 'pi-1')
    expect(screen.getByRole('button', { name: /added to practice/i })).toBeInTheDocument()
  })

  it('leaves add button visible on POST failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice list/i }))
    expect(screen.getByRole('button', { name: /add to practice list/i })).toBeInTheDocument()
  })

  it('calls DELETE and onAnnotationRemoved on remove', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationRemoved = vi.fn()
    render(
      <AnnotationCard
        annotation={grammarAnnotation}
        {...defaultProps}
        practiceItemId="pi-1"
        onAnnotationRemoved={onAnnotationRemoved}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /added to practice/i }))
    expect(fetchSpy).toHaveBeenCalledWith('/api/practice-items/pi-1', expect.objectContaining({ method: 'DELETE' }))
    expect(onAnnotationRemoved).toHaveBeenCalledWith('ann-1')
    expect(screen.getByRole('button', { name: /add to practice list/i })).toBeInTheDocument()
  })

  it('keeps added button on DELETE failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} practiceItemId="pi-1" />)
    await userEvent.click(screen.getByRole('button', { name: /added to practice/i }))
    expect(screen.getByRole('button', { name: /added to practice/i })).toBeInTheDocument()
  })

  it('renders sub-category pill', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.getByText('Subjunctive')).toBeInTheDocument()
  })

  it('includes sub_category in POST body when adding to practice', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice list/i }))
    expect(capturedBody.sub_category).toBe('subjunctive')
  })

  it('includes flashcard fields in POST body when annotation has them', async () => {
    const annotationWithFlashcard: Annotation = {
      ...grammarAnnotation,
      flashcard_front: 'I [[went]] to the market.',
      flashcard_back: '[[Fui]] al mercado.',
      flashcard_note: 'Subject pronouns are dropped in Rioplatense.',
    }
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={annotationWithFlashcard} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice list/i }))
    expect(capturedBody.flashcard_front).toBe('I [[went]] to the market.')
    expect(capturedBody.flashcard_back).toBe('[[Fui]] al mercado.')
    expect(capturedBody.flashcard_note).toBe('Subject pronouns are dropped in Rioplatense.')
  })

  it('sends null flashcard fields when annotation has none', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice list/i }))
    expect(capturedBody.flashcard_front).toBeNull()
    expect(capturedBody.flashcard_back).toBeNull()
    expect(capturedBody.flashcard_note).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```

Expected: multiple FAIL — wrong props, missing `onAnnotationRemoved`, etc.

- [ ] **Step 3: Rewrite `components/AnnotationCard.tsx`**

```tsx
// components/AnnotationCard.tsx
'use client'
import { useState } from 'react'
import type { Annotation, AnnotationType } from '@/lib/types'
import { SUB_CATEGORY_DISPLAY } from '@/lib/types'

export const TYPE_LABEL: Record<AnnotationType, string> = {
  grammar: '🔴 Grammar',
  naturalness: '🟡 Naturalness',
}

interface Props {
  annotation: Annotation
  sessionId: string
  practiceItemId: string | null
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
}

export function AnnotationCard({ annotation, sessionId, practiceItemId: initialPracticeItemId, onAnnotationAdded, onAnnotationRemoved }: Props) {
  const [practiceItemId, setPracticeItemId] = useState<string | null>(initialPracticeItemId)

  async function handleAdd() {
    const res = await fetch('/api/practice-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        annotation_id: annotation.id,
        type: annotation.type,
        original: annotation.original,
        correction: annotation.correction,
        explanation: annotation.explanation,
        sub_category: annotation.sub_category,
        flashcard_front: annotation.flashcard_front ?? null,
        flashcard_back: annotation.flashcard_back ?? null,
        flashcard_note: annotation.flashcard_note ?? null,
      }),
    })
    if (res.ok) {
      const { id } = await res.json() as { id: string }
      setPracticeItemId(id)
      onAnnotationAdded(annotation.id, id)
    } else {
      console.error('Failed to add practice item')
    }
  }

  async function handleRemove() {
    const res = await fetch(`/api/practice-items/${practiceItemId}`, { method: 'DELETE' })
    if (res.ok) {
      setPracticeItemId(null)
      onAnnotationRemoved(annotation.id)
    } else {
      console.error('Failed to remove practice item')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-base">
        <>
          <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
            {annotation.original}
          </span>
          {' → '}
          <span className="font-semibold text-lg text-[#86efac]">
            {annotation.correction}
          </span>
        </>
      </p>
      <p className="text-sm text-gray-400 leading-relaxed">{annotation.explanation}</p>
      <span className="border border-indigo-800 text-indigo-400 bg-indigo-950 rounded-full px-2 py-0.5 text-xs">
        {SUB_CATEGORY_DISPLAY[annotation.sub_category]}
      </span>
      {practiceItemId ? (
        <button
          onClick={handleRemove}
          className="w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm text-gray-400 transition-colors"
        >
          ✓ Added to practice list
        </button>
      ) : (
        <button
          onClick={handleAdd}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-base font-semibold text-white transition-colors"
        >
          Add to practice list
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/AnnotationCard.tsx __tests__/components/AnnotationCard.test.tsx
git commit -m "feat: AnnotationCard toggle — clicking added button removes from practice list"
```

---

## Task 3: Thread new props through TranscriptView and session page

**Files:**
- Modify: `components/TranscriptView.tsx`
- Modify: `app/sessions/[id]/page.tsx`

- [ ] **Step 1: Update `components/TranscriptView.tsx`**

Replace the entire file:

```tsx
// components/TranscriptView.tsx
'use client'
import { useState } from 'react'
import { AnnotatedText } from '@/components/AnnotatedText'
import { Modal } from '@/components/Modal'
import { AnnotationCard, TYPE_LABEL } from '@/components/AnnotationCard'
import type { TranscriptSegment, Annotation } from '@/lib/types'

interface Props {
  segments: TranscriptSegment[]
  annotations: Annotation[]
  userSpeakerLabels: ('A' | 'B')[] | null
  sessionId: string
  addedAnnotations: Map<string, string>           // annotationId -> practiceItemId
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
}

export function TranscriptView({ segments, annotations, userSpeakerLabels, sessionId, addedAnnotations, onAnnotationAdded, onAnnotationRemoved }: Props) {
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null)

  const annotationsBySegment = annotations.reduce<Record<string, Annotation[]>>((acc, a) => {
    if (!acc[a.segment_id]) acc[a.segment_id] = []
    acc[a.segment_id].push(a)
    return acc
  }, {})

  const addedAnnotationIds = new Set(addedAnnotations.keys())

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {segments.map(seg => {
          const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)

          return (
            <div key={seg.id}>
              <div className={!isUser ? 'opacity-40' : ''}>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                  {isUser ? 'You' : 'Them'}
                </p>
                <span className="text-sm leading-relaxed break-words">
                  {isUser && (annotationsBySegment[seg.id] ?? []).length > 0 ? (
                    <AnnotatedText
                      text={seg.text}
                      annotations={annotationsBySegment[seg.id] ?? []}
                      onAnnotationClick={a => {
                        setActiveAnnotation(activeAnnotation?.id === a.id ? null : a)
                      }}
                      addedAnnotationIds={addedAnnotationIds}
                    />
                  ) : (
                    seg.text
                  )}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {activeAnnotation && (
        <Modal
          title={<span>{TYPE_LABEL[activeAnnotation.type]}</span>}
          onClose={() => setActiveAnnotation(null)}
        >
          <AnnotationCard
            annotation={activeAnnotation}
            sessionId={sessionId}
            practiceItemId={addedAnnotations.get(activeAnnotation.id) ?? null}
            onAnnotationAdded={onAnnotationAdded}
            onAnnotationRemoved={onAnnotationRemoved}
          />
        </Modal>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `app/sessions/[id]/page.tsx`**

Replace the entire file:

```tsx
// app/sessions/[id]/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TranscriptView } from '@/components/TranscriptView'
import { InlineEdit } from '@/components/InlineEdit'
import type { SessionDetail } from '@/lib/types'

export default function TranscriptPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [title, setTitle] = useState('')
  const [addedAnnotations, setAddedAnnotations] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    fetch(`/api/sessions/${params.id}`)
      .then(r => r.json())
      .then((d: SessionDetail) => {
        setDetail(d)
        setTitle(d.session.title)
        setAddedAnnotations(new Map(Object.entries(d.addedAnnotations)))
      })
  }, [params.id])

  async function handleRename(newTitle: string) {
    await fetch(`/api/sessions/${params.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    })
    setTitle(newTitle)
  }

  function handleAnnotationAdded(annotationId: string, practiceItemId: string) {
    setAddedAnnotations(prev => { const next = new Map(prev); next.set(annotationId, practiceItemId); return next })
  }

  function handleAnnotationRemoved(annotationId: string) {
    setAddedAnnotations(prev => { const next = new Map(prev); next.delete(annotationId); return next })
  }

  async function handleReanalyse() {
    const res = await fetch(`/api/sessions/${params.id}/analyse`, { method: 'POST' })
    if (res.ok) router.push(`/sessions/${params.id}/status`)
  }

  if (!detail) return <p className="text-gray-400">Loading…</p>

  const { session, segments, annotations } = detail
  const counts = { grammar: 0, naturalness: 0 }
  annotations.forEach(a => counts[a.type as keyof typeof counts]++)

  const durationLabel = session.duration_seconds
    ? `${Math.floor(session.duration_seconds / 60)} min`
    : ''

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <InlineEdit value={title} onSave={handleRename} className="text-xl font-bold break-words" />
          <p className="text-sm text-gray-400 mt-1">
            {durationLabel} · {counts.grammar} grammar · {counts.naturalness} naturalness
          </p>
        </div>
        <button
          onClick={handleReanalyse}
          className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-3 py-1 shrink-0"
        >
          Re-analyse
        </button>
      </div>

      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={session.user_speaker_labels ?? null}
        sessionId={params.id}
        addedAnnotations={addedAnnotations}
        onAnnotationAdded={handleAnnotationAdded}
        onAnnotationRemoved={handleAnnotationRemoved}
      />
    </div>
  )
}
```

- [ ] **Step 3: Run the full test suite to check nothing broke**

```bash
npm test
```

Expected: all tests PASS (TypeScript will catch mismatched props at compile time).

- [ ] **Step 4: Commit**

```bash
git add components/TranscriptView.tsx app/sessions/\[id\]/page.tsx
git commit -m "feat: thread addedAnnotations Map and remove callback through TranscriptView"
```

---

## Task 4: DB migration + set processing_completed_at in pipeline

**Files:**
- Create: `supabase/migrations/20260328000000_add_processing_completed_at.sql`
- Modify: `lib/pipeline.ts`

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/20260328000000_add_processing_completed_at.sql
alter table sessions
  add column if not exists processing_completed_at timestamptz;
```

- [ ] **Step 2: Apply locally (if running a local Supabase)**

```bash
supabase db push
```

If not running locally, apply via the Supabase dashboard SQL editor — paste the migration content. Skip this step if deploying migrations through CI.

- [ ] **Step 3: Update `lib/pipeline.ts` — set timestamp when marking ready**

In the final `update` call at the bottom of `runClaudeAnalysis`, add `processing_completed_at`:

```ts
  await db.from('sessions').update({
    status: 'ready',
    title,
    processing_completed_at: new Date().toISOString(),
  }).eq('id', sessionId)
```

The full updated line (replace the existing single-field update at line 114):

```ts
  log.info('Claude analysis complete', { sessionId, annotationCount: correctedAnnotations.length })
  await db.from('sessions').update({
    status: 'ready',
    title,
    processing_completed_at: new Date().toISOString(),
  }).eq('id', sessionId)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260328000000_add_processing_completed_at.sql lib/pipeline.ts
git commit -m "feat: add processing_completed_at column, set it when analysis completes"
```

---

## Task 5: Surface processing time in the session list

**Files:**
- Modify: `app/api/sessions/route.ts`
- Modify: `lib/types.ts`
- Modify: `components/SessionList.tsx`
- Modify: `__tests__/components/SessionList.test.tsx`

- [ ] **Step 1: Add `processing_completed_at` to the session list type**

In `lib/types.ts`, update `SessionListItem`:

```ts
export interface SessionListItem {
  id: string
  title: string
  status: SessionStatus
  duration_seconds: number | null
  created_at: string
  processing_completed_at: string | null
}
```

- [ ] **Step 2: Add `processing_completed_at` to the list API select**

In `app/api/sessions/route.ts`, update the `.select()` call:

```ts
    .select('id, title, status, duration_seconds, created_at, processing_completed_at')
```

- [ ] **Step 3: Update `components/SessionList.tsx` to display processing time**

Replace the entire file:

```tsx
// components/SessionList.tsx
import Link from 'next/link'
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

const TERMINAL_STATUSES = new Set(['ready', 'error'])

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

interface Props {
  sessions: SessionListItem[]
}

export function SessionList({ sessions }: Props) {
  if (sessions.length === 0) {
    return <p className="text-gray-500 text-sm">No sessions yet — upload your first conversation above.</p>
  }

  return (
    <ul className="divide-y divide-gray-800">
      {sessions.map(s => {
        const isProcessing = !TERMINAL_STATUSES.has(s.status)
        const processingSeconds =
          s.status === 'ready' && s.processing_completed_at
            ? Math.round(
                (new Date(s.processing_completed_at).getTime() - new Date(s.created_at).getTime()) / 1000
              )
            : null

        return (
          <li key={s.id}>
            <Link
              href={s.status === 'ready' ? `/sessions/${s.id}` : `/sessions/${s.id}/status`}
              className={`flex items-center gap-3 py-3 min-w-0 ${isProcessing ? 'border-l-2 border-indigo-600 pl-3 -ml-3 bg-[#0d0f1e]' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-gray-100">{s.title}</p>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5 flex-wrap">
                  <span className={`flex items-center gap-1 ${STATUS_COLOUR[s.status] ?? 'text-gray-400'}`}>
                    {isProcessing && (
                      <svg
                        className="w-3 h-3 animate-spin text-indigo-400"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                  <span>·</span>
                  <span>{new Date(s.created_at).toLocaleDateString()}</span>
                  {s.duration_seconds != null && (
                    <>
                      <span>·</span>
                      <span>{formatDuration(s.duration_seconds)}</span>
                    </>
                  )}
                  {processingSeconds != null && (
                    <>
                      <span>·</span>
                      <span className="text-indigo-400">⚡ {formatDuration(processingSeconds)}</span>
                    </>
                  )}
                </div>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-4 h-4 text-gray-600 flex-shrink-0" aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 4: Update the SessionList test fixtures to include `processing_completed_at`**

In `__tests__/components/SessionList.test.tsx`, update the fixture objects:

```ts
const readySession: SessionListItem = {
  id: 'sess-1', title: 'Chat with María', status: 'ready',
  duration_seconds: 512, created_at: '2026-03-15T10:00:00Z',
  processing_completed_at: '2026-03-15T10:01:23Z',
}
const transcribingSession: SessionListItem = {
  id: 'sess-2', title: 'Untitled', status: 'transcribing',
  duration_seconds: null, created_at: '2026-03-14T10:00:00Z',
  processing_completed_at: null,
}
```

Also add a test for the processing time display:

```ts
  it('shows processing time for ready session with processing_completed_at', () => {
    render(<SessionList sessions={[readySession]} />)
    // created_at: 10:00:00Z, processing_completed_at: 10:01:23Z = 83 seconds = 1m 23s
    expect(screen.getByText(/⚡ 1m 23s/)).toBeInTheDocument()
  })

  it('omits processing time when processing_completed_at is null', () => {
    render(<SessionList sessions={[{ ...readySession, processing_completed_at: null }]} />)
    expect(screen.queryByText(/⚡/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/sessions/route.ts lib/types.ts components/SessionList.tsx __tests__/components/SessionList.test.tsx
git commit -m "feat: show pipeline processing time inline in session list (⚡ Xm Ys)"
```

---

## Task 6: Home page — poll instead of navigate after upload

**Files:**
- Modify: `app/page.tsx`
- Modify: `lib/types.ts` (add `processing_completed_at` to `Session` for completeness)

- [ ] **Step 1: Update `lib/types.ts` — add `processing_completed_at` to `Session`**

In the `Session` interface, add the new column:

```ts
export interface Session {
  id: string
  title: string
  status: SessionStatus
  error_stage: ErrorStage | null
  duration_seconds: number | null
  audio_r2_key: string | null
  assemblyai_job_id: string | null
  detected_speaker_count: number | null
  user_speaker_labels: ('A' | 'B')[] | null
  processing_completed_at: string | null
  created_at: string
  updated_at: string
  original_filename: string | null
}
```

- [ ] **Step 2: Rewrite `app/page.tsx`**

Replace the entire file:

```tsx
'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { DropZone } from '@/components/DropZone'
import { PendingUploadCard, type SpeakerMode } from '@/components/PendingUploadCard'
import { SessionList } from '@/components/SessionList'
import type { SessionListItem, SessionStatus, ErrorStage } from '@/lib/types'

const SPEAKER_MODE_KEY = 'speakerMode'
const TERMINAL_STATUSES = new Set<SessionStatus>(['ready', 'error'])
const POLL_INTERVAL_MS = 3000

export default function HomePage() {
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [speakerMode, setSpeakerMode] = useState<SpeakerMode>('solo')
  const [speakersExpected, setSpeakersExpected] = useState(2)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  function startPolling(sessionId: string) {
    if (pollingRefs.current.has(sessionId)) return
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/status`)
        if (!res.ok) return
        const { status, error_stage } = await res.json() as { status: SessionStatus; error_stage: ErrorStage | null }

        if (TERMINAL_STATUSES.has(status)) {
          clearInterval(pollingRefs.current.get(sessionId))
          pollingRefs.current.delete(sessionId)
          // Re-fetch full list to get updated title, processing_completed_at, etc.
          const listRes = await fetch('/api/sessions')
          if (listRes.ok) setSessions(await listRes.json())
        } else {
          setSessions(prev =>
            prev.map(s => s.id === sessionId ? { ...s, status } : s)
          )
        }
      } catch {
        // Network error — keep polling
      }
    }, POLL_INTERVAL_MS)
    pollingRefs.current.set(sessionId, intervalId)
  }

  // Load sessions on mount and start polling for any in-progress ones
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then((data: SessionListItem[]) => {
        setSessions(data)
        data.forEach(s => {
          if (!TERMINAL_STATUSES.has(s.status)) startPolling(s.id)
        })
      })
      .catch(console.error)

    return () => {
      pollingRefs.current.forEach(id => clearInterval(id))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restore last-used speaker mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SPEAKER_MODE_KEY)
    if (saved === 'solo' || saved === 'conversation') setSpeakerMode(saved)
  }, [])

  const handleModeChange = useCallback((mode: SpeakerMode) => {
    setSpeakerMode(mode)
    localStorage.setItem(SPEAKER_MODE_KEY, mode)
    if (mode === 'solo') setSpeakersExpected(2)
  }, [])

  const handleFile = useCallback((file: File) => {
    setPendingFile(file)
  }, [])

  const handleConfirmUpload = useCallback(async () => {
    if (!pendingFile) return
    setUploading(true)
    setError(null)
    setPendingFile(null)
    const file = pendingFile
    const ext = file.name.split('.').pop() ?? 'mp3'
    const duration_seconds = await getAudioDuration(file)

    const createRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', extension: ext, original_filename: file.name }),
    })
    if (!createRes.ok) { setError('Failed to create session'); setUploading(false); return }
    const { session_id, upload_url } = await createRes.json() as { session_id: string; upload_url: string }

    try {
      const uploadRes = await fetch(upload_url, { method: 'PUT', body: file })
      if (!uploadRes.ok) throw new Error('Upload failed')
    } catch {
      await fetch(`/api/sessions/${session_id}/upload-failed`, { method: 'POST' })
      setError('Upload failed — please try again')
      setUploading(false)
      return
    }

    await fetch(`/api/sessions/${session_id}/upload-complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        duration_seconds,
        speakers_expected: speakerMode === 'solo' ? 1 : speakersExpected,
      }),
    })

    // Prepend the new session and start polling — no navigation
    const newSession: SessionListItem = {
      id: session_id,
      title: file.name,
      status: 'transcribing',
      duration_seconds,
      created_at: new Date().toISOString(),
      processing_completed_at: null,
    }
    setSessions(prev => [newSession, ...prev])
    startPolling(session_id)
    setUploading(false)
  }, [pendingFile, speakerMode, speakersExpected])

  // Check for a file shared via the PWA share target
  useEffect(() => {
    if (typeof indexedDB === 'undefined') return
    readPendingShare().then(file => {
      if (file) handleFile(file)
    })
  }, [handleFile])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Conversation Coach</h1>
        <p className="text-gray-400 text-sm">Upload a recorded Spanish conversation to get feedback on your speech.</p>
      </div>

      <div className="space-y-3">
        {pendingFile ? (
          <PendingUploadCard
            file={pendingFile}
            speakerMode={speakerMode}
            speakersExpected={speakersExpected}
            onModeChange={handleModeChange}
            onSpeakersChange={setSpeakersExpected}
            onConfirm={handleConfirmUpload}
            onDismiss={() => setPendingFile(null)}
          />
        ) : (
          <DropZone onFile={handleFile} />
        )}
        {uploading && <p className="text-sm text-violet-400">Uploading…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Past Sessions</h2>
        <SessionList sessions={sessions} />
      </div>
    </div>
  )
}

function readPendingShare(): Promise<File | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open('conversation-coach-db', 1)
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result.createObjectStore('pending-share')
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('pending-share', 'readwrite')
      const store = tx.objectStore('pending-share')
      tx.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
      const getReq = store.get('file')
      getReq.onsuccess = () => {
        const file = (getReq as IDBRequest<File | undefined>).result ?? null
        if (file) store.delete('file')
        tx.oncomplete = () => resolve(file)
      }
      getReq.onerror = () => resolve(null)
    }
    req.onerror = () => resolve(null)
  })
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

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests PASS. The home page has no unit tests so TypeScript compilation is the main check here.

- [ ] **Step 4: Smoke test manually**

```bash
npm run dev
```

1. Open http://localhost:3000
2. Upload an audio file
3. Confirm the page stays on the home page — the new session appears at the top with a spinner
4. Watch the status label update every 3 seconds as the pipeline progresses
5. Once the session hits `ready`, confirm the spinner disappears and `⚡ Xm Ys` appears inline

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx lib/types.ts
git commit -m "feat: stay on home page after upload, poll session status, show processing time when ready"
```
