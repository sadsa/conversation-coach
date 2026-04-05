# Auto-title, Annotation Modal, Simplified Practice Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Claude-generated session titles, replace the inline annotation card with a centred modal, and simplify the practice items list with swipe/bulk deletion.

**Architecture:** Four independent features implemented in dependency order: DB + plumbing first (auto-title), then frontend modal, then practice items simplification + bulk delete. Each task is a complete vertical slice: tests first, then implementation, then commit.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library, Supabase (PostgreSQL), Anthropic SDK, react-swipeable v7

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260320000000_add_original_filename.sql` | New — adds `original_filename` column |
| `lib/types.ts` | Add `original_filename` to `Session` interface |
| `app/api/sessions/route.ts` | Accept + store `original_filename` |
| `app/page.tsx` | Remove title input; send `original_filename` |
| `lib/claude.ts` | New signature, prompt, response schema |
| `lib/pipeline.ts` | Fetch `original_filename`; destructure result; save title |
| `components/Modal.tsx` | New — generic centred modal with focus trap |
| `components/AnnotationCard.tsx` | Remove `onClose`, outer shell, header row; export `TYPE_LABEL` |
| `components/TranscriptView.tsx` | Remove inline card; add single `<Modal>` at bottom |
| `components/PracticeList.tsx` | New simplified layout, swipe-to-delete, bulk select |
| `app/practice/page.tsx` | Remove handlers; pass plain `PracticeItem[]` |
| `app/api/practice-items/route.ts` | Remove sessions join + reviewed filter |
| `__tests__/lib/claude.test.ts` | Update existing + add title tests |
| `__tests__/lib/pipeline.test.ts` | Update mocks for new return type; add title-save test |
| `__tests__/components/AnnotationCard.test.tsx` | Update for removed props |
| `__tests__/components/TranscriptView.test.tsx` | Update for modal render |
| `__tests__/components/Modal.test.tsx` | New — modal behaviour tests |
| `__tests__/components/PracticeList.test.tsx` | Rewrite for new interface |

---

## Task 1: DB migration + `original_filename` plumbing

Adds the `original_filename` column and wires it from the upload page through to the sessions API. No Claude changes yet.

**Files:**
- Create: `supabase/migrations/20260320000000_add_original_filename.sql`
- Modify: `lib/types.ts`
- Modify: `app/api/sessions/route.ts`
- Modify: `app/page.tsx`
- Test: `__tests__/api/sessions.test.ts`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260320000000_add_original_filename.sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS original_filename TEXT;
```

- [ ] **Step 2: Add `original_filename` to the `Session` type**

In `lib/types.ts`, find the `Session` interface and add after `updated_at`:

```ts
original_filename: string | null
```

- [ ] **Step 3: Write a failing test for the sessions API accepting `original_filename`**

In `__tests__/api/sessions.test.ts`, add a new `it` block inside the existing `POST /api/sessions` describe:

```ts
it('stores original_filename when provided', async () => {
  // Arrange: mock DB insert to capture the inserted row
  const insertMock = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'sess-1', audio_r2_key: 'audio/sess-1.mp3' },
        error: null,
      }),
    }),
  })
  const mockDb = {
    from: vi.fn().mockReturnValue({ insert: insertMock }),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  vi.mocked(presignedUploadUrl).mockResolvedValue('https://r2.example.com/upload')

  const req = new NextRequest('http://localhost/api/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Untitled', extension: 'ogg', original_filename: 'PTT-20260315-001.ogg' }),
  })
  await POST(req)

  const insertedRow = insertMock.mock.calls[0][0]
  expect(insertedRow).toMatchObject({ original_filename: 'PTT-20260315-001.ogg' })
})
```

- [ ] **Step 4: Run the test — verify it fails**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: test fails because `original_filename` is not yet destructured or inserted.

- [ ] **Step 5: Update `app/api/sessions/route.ts` to accept `original_filename`**

Find the line that destructures the request body (currently `const { title, extension } = body as { ... }`) and update:

```ts
const { title, extension, original_filename } = body as {
  title?: string
  extension?: string
  original_filename?: string
}
```

Find the Supabase `.insert(...)` call and add `original_filename` to the inserted object:

```ts
original_filename: original_filename ?? null,
```

- [ ] **Step 6: Run the test — verify it passes**

```bash
npm test -- __tests__/api/sessions.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Update `app/page.tsx` to send `original_filename` and remove the title input**

Remove these lines entirely:
```ts
const [title, setTitle] = useState('')
```
```tsx
<input
  type="text"
  placeholder="Session title (optional)"
  value={title}
  onChange={e => setTitle(e.target.value)}
  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm outline-none focus:border-violet-500"
/>
```

Replace the `sessionTitle` line and the POST body:
```ts
// Remove:  const sessionTitle = title.trim() || file.name.replace(/\.[^.]+$/, '')
// Remove:  body: JSON.stringify({ title: sessionTitle, extension: ext }),

// Add:
body: JSON.stringify({ title: 'Untitled', extension: ext, original_filename: file.name }),
```

Update the `useCallback` dependency array from `[title, router]` to `[router]`.

- [ ] **Step 8: Run full test suite — no regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260320000000_add_original_filename.sql lib/types.ts app/api/sessions/route.ts app/page.tsx __tests__/api/sessions.test.ts
git commit -m "feat: add original_filename to sessions for auto-title"
```

---

## Task 2: Update `analyseUserTurns` — new signature and response schema

Changes Claude's response from a bare annotation array to `{ title, annotations }`. Updates the test suite to match.

**Files:**
- Modify: `lib/claude.ts`
- Modify: `__tests__/lib/claude.test.ts`

- [ ] **Step 1: Update the existing claude tests for the new return shape and add a title test**

Replace `__tests__/lib/claude.test.ts` entirely:

```ts
// __tests__/lib/claude.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyseUserTurns, type UserTurn } from '@/lib/claude'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}))

import Anthropic from '@anthropic-ai/sdk'

describe('analyseUserTurns', () => {
  const mockCreate = vi.fn()

  beforeEach(() => {
    vi.mocked(Anthropic).mockImplementation(function () {
      return { messages: { create: mockCreate } } as unknown as Anthropic
    })
  })

  it('returns parsed annotations and title from Claude JSON response', async () => {
    const turns: UserTurn[] = [{ id: 'seg-1', text: 'Yo fui al mercado ayer.' }]
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: 'Football con Kevin',
          annotations: [{
            segment_id: 'seg-1',
            type: 'grammar',
            original: 'Yo fui',
            start_char: 0,
            end_char: 6,
            correction: 'Fui',
            explanation: 'Drop the subject pronoun.',
          }],
        }),
      }],
    })

    const result = await analyseUserTurns(turns, null)
    expect(result.title).toBe('Football con Kevin')
    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]).toMatchObject({ segment_id: 'seg-1', type: 'grammar' })
  })

  it('returns empty annotations and title when Claude returns empty array', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ title: 'Sin tema', annotations: [] }) }],
    })
    const result = await analyseUserTurns([{ id: 'seg-1', text: 'Perfecto.' }], null)
    expect(result.annotations).toEqual([])
    expect(result.title).toBe('Sin tema')
  })

  it('falls back to "Untitled" when title is missing or empty', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ title: '', annotations: [] }) }],
    })
    const result = await analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], null)
    expect(result.title).toBe('Untitled')
  })

  it('throws when Claude response is not valid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Sorry, I cannot help with that.' }],
    })
    await expect(analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], null)).rejects.toThrow()
  })

  it('includes original_filename in the user message when provided', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ title: 'WhatsApp: Algo', annotations: [] }) }],
    })
    await analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], 'PTT-20260315-001.ogg')
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('PTT-20260315-001.ogg')
  })
})
```

- [ ] **Step 2: Run — verify tests fail**

```bash
npm test -- __tests__/lib/claude.test.ts
```

Expected: tests fail because `analyseUserTurns` still returns a bare array and has the old signature.

- [ ] **Step 3: Update `lib/claude.ts`**

Replace the entire file:

```ts
// lib/claude.ts
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are an expert Spanish language coach specialising in Rioplatense (Argentine) Spanish. Analyse the speech turns provided and identify:

1. Grammar errors — mistakes the speaker made (type: "grammar")
2. Unnatural phrasing — things that are technically correct but would sound more natural said differently in everyday Argentine speech (type: "naturalness")
3. Strengths — things the speaker did well, especially correct use of voseo, lunfardo, or natural Argentine expressions (type: "strength")

For each annotation:
- "segment_id": the ID from the [ID: ...] prefix of the turn being annotated
- "type": one of "grammar", "naturalness", or "strength"
- "original": copy the exact substring from the turn's text
- "start_char" / "end_char": character offsets of "original" within the turn's text content only — do NOT count the [ID: ...] prefix line; offset 0 is the first character of the text itself
- "correction": the improved version (null for strengths)
- "explanation": a concise plain-language explanation tuned to Argentine Spanish conventions

Be tuned to Rioplatense register: voseo verb forms, Rioplatense vocabulary, lunfardo where relevant. Prefer natural everyday Argentine speech over textbook Castilian.

For the title:
- Summarise the conversation topic in 5 words or fewer using natural Spanish/English mix (e.g. "Football con Kevin", "Planificando el fin de semana").
- If the original filename matches a WhatsApp audio pattern (starts with "PTT-" or contains "WhatsApp Audio"), prepend "WhatsApp: " to the title (e.g. "WhatsApp: Football con Kevin").
- Otherwise use the topic only.

Respond ONLY with a JSON object with this exact shape: { "title": string, "annotations": [...] }. No other text.`

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

export async function analyseUserTurns(
  turns: UserTurn[],
  originalFilename: string | null,
): Promise<{ title: string; annotations: ClaudeAnnotation[] }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const filenamePrefix = originalFilename ? `Original filename: ${originalFilename}\n\n` : ''
  const userContent = filenamePrefix + turns
    .map(t => `[ID: ${t.id}]\n${t.text}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const text = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

  console.log('[claude] raw response:', text.slice(0, 500))

  const parsed = JSON.parse(text) as { title: string; annotations: ClaudeAnnotation[] }
  return {
    title: parsed.title?.trim() || 'Untitled',
    annotations: parsed.annotations,
  }
}
```

- [ ] **Step 4: Run — verify tests pass**

```bash
npm test -- __tests__/lib/claude.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/claude.ts __tests__/lib/claude.test.ts
git commit -m "feat: update analyseUserTurns to return title alongside annotations"
```

---

## Task 3: Update `runClaudeAnalysis` to use new signature and save title

Wires `original_filename` into the pipeline and saves the generated title to the session on completion.

**Files:**
- Modify: `lib/pipeline.ts`
- Modify: `__tests__/lib/pipeline.test.ts`

- [ ] **Step 1: Update the pipeline test mock and add a title-save assertion**

In `__tests__/lib/pipeline.test.ts`, find every `vi.mocked(analyseUserTurns).mockResolvedValue([])` and replace with:

```ts
vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test Session', annotations: [] })
```

Update the existing `data` mock for the sessions select to include `original_filename`:

```ts
data: { user_speaker_labels: ['B'], audio_r2_key: 'audio/test.mp3', original_filename: 'PTT-20260315.ogg' },
```

Add a new test asserting the title is saved:

```ts
it('saves the generated title to the session on success', async () => {
  const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'sessions') return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { user_speaker_labels: ['A'], audio_r2_key: null, original_filename: null },
              error: null,
            }),
          }),
        }),
        update: updateMock,
      }
      if (table === 'transcript_segments') return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [{ id: 'seg-a', speaker: 'A', text: 'Hola.' }], error: null }),
          }),
        }),
      }
      if (table === 'annotations') return { insert: vi.fn().mockResolvedValue({ error: null }) }
      return {}
    }),
  }
  vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
  vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Charla con Ana', annotations: [] })
  vi.mocked(deleteObject).mockResolvedValue(undefined)

  await runClaudeAnalysis('session-title-test')

  // The final status update should include the generated title
  const updateCalls = updateMock.mock.calls
  const readyUpdate = updateCalls.find(([payload]: [Record<string, unknown>]) => payload.status === 'ready')
  expect(readyUpdate[0]).toMatchObject({ status: 'ready', title: 'Charla con Ana' })
})
```

- [ ] **Step 2: Run — verify new test fails**

```bash
npm test -- __tests__/lib/pipeline.test.ts
```

Expected: tests fail (TypeScript errors and assertion failure on the title save).

- [ ] **Step 3: Update `lib/pipeline.ts`**

Replace the entire file:

```ts
// lib/pipeline.ts
import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import type { TranscriptSegment } from '@/lib/types'
import type { ClaudeAnnotation } from '@/lib/claude'

export async function runClaudeAnalysis(sessionId: string): Promise<void> {
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('user_speaker_labels, audio_r2_key, original_filename')
    .eq('id', sessionId)
    .single()

  if (!session) throw new Error(`Session ${sessionId} not found`)

  const { data: segments } = await db
    .from('transcript_segments')
    .select('*')
    .eq('session_id', sessionId)
    .order('position')

  const userTurns = (segments ?? [])
    .filter((s: TranscriptSegment) => (session.user_speaker_labels ?? []).includes(s.speaker))
    .map((s: TranscriptSegment) => ({ id: s.id, text: s.text }))

  let annotations: ClaudeAnnotation[] = []
  let title = 'Untitled'
  try {
    const result = await analyseUserTurns(userTurns, session.original_filename ?? null)
    annotations = result.annotations
    title = result.title
  } catch (err) {
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'analysing',
    }).eq('id', sessionId)
    throw err
  }

  // Build a map so we can validate/correct character offsets from Claude
  const segmentTextById = new Map(userTurns.map(t => [t.id, t.text]))

  const correctedAnnotations = annotations.map(a => {
    const segText = segmentTextById.get(a.segment_id)
    if (!segText) return a
    if (segText.slice(a.start_char, a.end_char) !== a.original) {
      const idx = segText.indexOf(a.original)
      if (idx !== -1) {
        return { ...a, start_char: idx, end_char: idx + a.original.length }
      }
    }
    return a
  })

  if (correctedAnnotations.length > 0) {
    const { error: annotationError } = await db.from('annotations').insert(
      correctedAnnotations.map(a => ({
        session_id: sessionId,
        segment_id: a.segment_id,
        type: a.type,
        original: a.original,
        start_char: a.start_char,
        end_char: a.end_char,
        correction: a.correction,
        explanation: a.explanation,
      }))
    )

    if (annotationError) {
      throw new Error(`Failed to insert annotations: ${annotationError.message}`)
    }
  }

  // Delete audio from R2
  if (session.audio_r2_key) {
    await deleteObject(session.audio_r2_key)
    await db.from('sessions').update({ audio_r2_key: null }).eq('id', sessionId)
  }

  await db.from('sessions').update({ status: 'ready', title }).eq('id', sessionId)
}
```

- [ ] **Step 4: Run — verify all pipeline tests pass**

```bash
npm test -- __tests__/lib/pipeline.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full test suite — no regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline.ts __tests__/lib/pipeline.test.ts
git commit -m "feat: save Claude-generated title to session after analysis"
```

---

## Task 4: Build the `Modal` component

A generic centred overlay with backdrop, focus management, and keyboard dismissal.

**Files:**
- Create: `components/Modal.tsx`
- Create: `__tests__/components/Modal.test.tsx`

- [ ] **Step 1: Write the failing Modal tests**

```tsx
// __tests__/components/Modal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '@/components/Modal'

describe('Modal', () => {
  it('renders children and title', () => {
    render(
      <Modal title={<span>Grammar</span>} onClose={() => {}}>
        <p>Correction content</p>
      </Modal>
    )
    expect(screen.getByText('Grammar')).toBeInTheDocument()
    expect(screen.getByText('Correction content')).toBeInTheDocument()
  })

  it('calls onClose when X button is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal title="Test" onClose={onClose}><p>Content</p></Modal>)
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal title="Test" onClose={onClose}><p>Content</p></Modal>)
    // Click the backdrop (the outermost element, not the card)
    await userEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT call onClose when card content is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal title="Test" onClose={onClose}><p>Content</p></Modal>)
    await userEvent.click(screen.getByText('Content'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run — verify tests fail**

```bash
npm test -- __tests__/components/Modal.test.tsx
```

Expected: fail with "Cannot find module '@/components/Modal'".

- [ ] **Step 3: Create `components/Modal.tsx`**

```tsx
// components/Modal.tsx
'use client'
import { useEffect, useRef } from 'react'

interface Props {
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}

export function Modal({ title, onClose, children }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      previousFocusRef.current?.focus()
    }
  }, [])

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 bg-black/65 flex items-center justify-center p-5 z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-700">
          <div className="text-sm font-semibold">{title}</div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors text-sm"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run — verify tests pass**

```bash
npm test -- __tests__/components/Modal.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/Modal.tsx __tests__/components/Modal.test.tsx
git commit -m "feat: add Modal component with backdrop and focus management"
```

---

## Task 5: Wire modal into TranscriptView + slim down AnnotationCard

Replaces the inline annotation card with the new modal. Updates existing tests.

**Files:**
- Modify: `components/AnnotationCard.tsx`
- Modify: `components/TranscriptView.tsx`
- Modify: `__tests__/components/AnnotationCard.test.tsx`
- Modify: `__tests__/components/TranscriptView.test.tsx`

- [ ] **Step 1: Replace `__tests__/components/AnnotationCard.test.tsx`**

The `onClose` prop is removed. Remove it from `defaultProps` and delete the close-button test:

```tsx
// __tests__/components/AnnotationCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
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

const defaultProps = {
  sessionId: 's1',
  isAdded: false,
  onAnnotationAdded: vi.fn(),
  // onClose removed — now owned by Modal
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

  it('renders keep-this message for strength annotation', () => {
    render(<AnnotationCard annotation={strengthAnnotation} {...defaultProps} />)
    expect(screen.getByText(/keep this/i)).toBeInTheDocument()
  })

  it('renders disabled "Added" button when isAdded is true', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} isAdded={true} />)
    const btn = screen.getByRole('button', { name: /added to practice/i })
    expect(btn).toBeDisabled()
  })

  it('does not call fetch when isAdded is true and button is clicked', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} isAdded={true} />)
    await userEvent.click(screen.getByRole('button', { name: /added to practice/i }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls fetch and onAnnotationAdded on successful add', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationAdded = vi.fn()
    render(
      <AnnotationCard
        annotation={grammarAnnotation}
        {...defaultProps}
        onAnnotationAdded={onAnnotationAdded}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    expect(fetchSpy).toHaveBeenCalledWith('/api/practice-items', expect.objectContaining({ method: 'POST' }))
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1')
    expect(screen.getByRole('button', { name: /added to practice/i })).toBeDisabled()
  })

  it('leaves button enabled on fetch failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await userEvent.click(screen.getByRole('button', { name: /add to practice/i }))
    expect(screen.getByRole('button', { name: /add to practice/i })).not.toBeDisabled()
  })
})
```

- [ ] **Step 3: Replace `__tests__/components/TranscriptView.test.tsx`**

The main change: clicking an annotated word now opens a `Modal`. The explanation text (`Drop pronoun.`) is still visible (AnnotationCard renders it inside the modal). The "toggle card closed" test needs updating since the modal backdrop/X is what closes it now — clicking the same highlight again while a modal is open still works if the component re-sets `activeAnnotation` to null when the same annotation is clicked:

```tsx
// __tests__/components/TranscriptView.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TranscriptView } from '@/components/TranscriptView'
import type { TranscriptSegment, Annotation } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response)

const segments: TranscriptSegment[] = [
  { id: 'seg-1', session_id: 's1', speaker: 'A', text: 'Yo fui al mercado.', start_ms: 0, end_ms: 2000, position: 0 },
  { id: 'seg-2', session_id: 's1', speaker: 'B', text: '¿Qué compraste?', start_ms: 2500, end_ms: 4000, position: 1 },
]
const annotations: Annotation[] = [
  { id: 'ann-1', session_id: 's1', segment_id: 'seg-1', type: 'grammar',
    original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.' },
]

const defaultProps = {
  sessionId: 's1',
  addedAnnotationIds: new Set<string>(),
  onAnnotationAdded: vi.fn(),
}

describe('TranscriptView', () => {
  it('dims native speaker turns (speaker B when user is A)', () => {
    const { container } = render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    const dimmed = container.querySelector('.opacity-40')
    expect(dimmed).toBeTruthy()
    expect(dimmed?.textContent).toContain('¿Qué compraste?')
  })

  it('shows modal with annotation content when highlight is clicked', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    // Explanation is rendered inside AnnotationCard inside the Modal
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
    // Modal close button should be present
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('closes modal when X button is clicked', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    await userEvent.click(screen.getByText('Yo fui'))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('filters annotations by type', async () => {
    render(
      <TranscriptView segments={segments} annotations={annotations} userSpeakerLabels={['A']} {...defaultProps} />
    )
    await userEvent.click(screen.getByRole('button', { name: /natural/i }))
    expect(screen.queryByText('Yo fui')).toBeTruthy()
  })

  it('renders speaker label as a stacked paragraph above segment text', () => {
    render(
      <TranscriptView segments={segments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />
    )
    const label = screen.getByText('You')
    expect(label.tagName).toBe('P')
    expect(label).toHaveClass('uppercase')
  })
})
```

- [ ] **Step 4: Run — verify updated tests fail (expected)**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx __tests__/components/TranscriptView.test.tsx
```

Expected: tests fail because the components haven't been updated yet.

- [ ] **Step 5: Update `components/AnnotationCard.tsx`**

Replace the entire file:

```tsx
// components/AnnotationCard.tsx
'use client'
import { useState } from 'react'
import type { Annotation, AnnotationType } from '@/lib/types'

export const TYPE_LABEL: Record<AnnotationType, string> = {
  grammar: '🔴 Grammar',
  naturalness: '🟡 Naturalness',
  strength: '🟢 Strength',
}

interface Props {
  annotation: Annotation
  sessionId: string
  isAdded: boolean
  onAnnotationAdded: (annotationId: string) => void
}

export function AnnotationCard({ annotation, sessionId, isAdded, onAnnotationAdded }: Props) {
  const [added, setAdded] = useState(isAdded)

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
      }),
    })
    if (res.ok) {
      setAdded(true)
      onAnnotationAdded(annotation.id)
    } else {
      console.error('Failed to add practice item')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-base">
        {annotation.correction ? (
          <>
            <span className="line-through text-gray-500">{annotation.original}</span>
            {' → '}
            <span className="font-semibold text-lg">{annotation.correction}</span>
          </>
        ) : (
          <span className="text-green-300">Keep this! &ldquo;{annotation.original}&rdquo;</span>
        )}
      </p>
      <p className="text-sm text-gray-400 leading-relaxed">{annotation.explanation}</p>
      {added ? (
        <button disabled className="w-full py-3 rounded-xl bg-gray-700 text-sm text-gray-500 cursor-not-allowed">
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

- [ ] **Step 6: Update `components/TranscriptView.tsx`**

Add imports at the top:
```tsx
import { Modal } from '@/components/Modal'
import { AnnotationCard, TYPE_LABEL } from '@/components/AnnotationCard'
```

Remove the existing `import { AnnotationCard }` line (now importing both from same file).

Find and **delete** the inline `AnnotationCard` conditional block inside the segment `map()`. It looks like:
```tsx
{activeAnnotation?.segment_id === seg.id && (
  <AnnotationCard
    annotation={activeAnnotation}
    ...
    onClose={() => setActiveAnnotation(null)}
  />
)}
```
Delete this entire block.

At the bottom of the returned JSX (after the closing tag of the segments list, before the final `</div>`), add:
```tsx
{activeAnnotation && (
  <Modal
    title={<span>{TYPE_LABEL[activeAnnotation.type]}</span>}
    onClose={() => setActiveAnnotation(null)}
  >
    <AnnotationCard
      annotation={activeAnnotation}
      sessionId={sessionId}
      isAdded={addedAnnotationIds.has(activeAnnotation.id)}
      onAnnotationAdded={onAnnotationAdded}
    />
  </Modal>
)}
```

- [ ] **Step 7: Run — verify tests pass**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx __tests__/components/TranscriptView.test.tsx
```

Expected: all tests pass.

- [ ] **Step 8: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add components/AnnotationCard.tsx components/TranscriptView.tsx __tests__/components/AnnotationCard.test.tsx __tests__/components/TranscriptView.test.tsx
git commit -m "feat: replace inline annotation card with centred modal overlay"
```

---

## Task 6: Simplify practice items + clean up API

Strips the practice list to essentials (type dot, original → correction), removes the sessions join from the API, and removes the reviewed filter.

**Files:**
- Modify: `components/PracticeList.tsx`
- Modify: `app/practice/page.tsx`
- Modify: `app/api/practice-items/route.ts`
- Modify: `__tests__/components/PracticeList.test.tsx`
- Modify: `__tests__/api/practice-items.test.ts`

- [ ] **Step 1: Rewrite `__tests__/components/PracticeList.test.tsx`**

Replace entirely — the old tests test props and UI that no longer exist:

```tsx
// __tests__/components/PracticeList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'

// Mock fetch for delete calls
global.fetch = vi.fn().mockResolvedValue({ ok: true })

const grammarItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'Yo fui', correction: 'Fui',
  explanation: 'Drop pronoun.', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
}
const strengthItem: PracticeItem = {
  id: 'item-2', session_id: 's1', annotation_id: 'ann-2',
  type: 'strength', original: 'Dale, vamos', correction: null,
  explanation: 'Natural Argentine expression.', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
}

describe('PracticeList', () => {
  it('renders correction for grammar items', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
  })

  it('renders original (no correction) for strength items', () => {
    render(<PracticeList items={[strengthItem]} />)
    expect(screen.getByText('Dale, vamos')).toBeInTheDocument()
    expect(screen.queryByText('→')).not.toBeInTheDocument()
  })

  it('does not render explanation or session metadata', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('filters by type', async () => {
    render(<PracticeList items={[grammarItem, strengthItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /naturalness/i }))
    expect(screen.getByText(/no items match/i)).toBeInTheDocument()
  })

  it('does not render reviewed filter buttons', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByRole('button', { name: /pending/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reviewed/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — verify tests fail**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```

Expected: failures (component still has old interface and renders old UI).

- [ ] **Step 3: Rewrite `components/PracticeList.tsx`** (swipe and bulk select are added in Task 7; this task establishes the simplified layout with basic delete)

```tsx
// components/PracticeList.tsx
'use client'
import { useState } from 'react'
import type { PracticeItem, AnnotationType } from '@/lib/types'

const TYPE_DOT_CLASS: Record<AnnotationType, string> = {
  grammar: 'bg-red-400',
  naturalness: 'bg-yellow-400',
  strength: 'bg-green-400',
}

type Filter = 'all' | AnnotationType

interface Props {
  items: PracticeItem[]
}

export function PracticeList({ items: initialItems }: Props) {
  const [items, setItems] = useState(initialItems)
  const [typeFilter, setTypeFilter] = useState<Filter>('all')

  const filtered = items.filter(item =>
    typeFilter === 'all' || item.type === typeFilter
  )

  async function deleteItem(id: string) {
    await fetch(`/api/practice-items/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap text-sm">
        {(['all', 'grammar', 'naturalness', 'strength'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-3 py-1 rounded-full border transition-colors capitalize ${
              typeFilter === f
                ? 'border-violet-500 text-violet-300 bg-violet-500/10'
                : 'border-gray-700 text-gray-400'
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
          <li key={item.id} className="flex items-center gap-3 px-4 py-3 bg-gray-900 rounded-xl">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_DOT_CLASS[item.type]}`} />
            <div className="flex-1 min-w-0 text-sm">
              {item.correction ? (
                <>
                  <span className="line-through text-gray-500">{item.original}</span>
                  {' → '}
                  <span className="font-medium">{item.correction}</span>
                </>
              ) : (
                <span className="text-green-300">&ldquo;{item.original}&rdquo;</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Update `app/practice/page.tsx`**

Replace the entire file:

```tsx
// app/practice/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'

export default function PracticePage() {
  const [items, setItems] = useState<PracticeItem[]>([])

  useEffect(() => {
    fetch('/api/practice-items')
      .then(r => r.json())
      .then(setItems)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Practice Items</h1>
        <p className="text-sm text-gray-400 mt-1">
          {items.length} item{items.length !== 1 ? 's' : ''} across all sessions
        </p>
      </div>
      <PracticeList items={items} />
    </div>
  )
}
```

- [ ] **Step 5: Update `app/api/practice-items/route.ts` GET handler**

Replace the `GET` function:

```ts
export async function GET(_req: NextRequest) {
  const db = createServerClient()
  const { data, error } = await db
    .from('practice_items')
    .select('id, session_id, annotation_id, type, original, correction, explanation, reviewed, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

Keep the `POST` handler unchanged.

- [ ] **Step 6: Run practice list tests**

```bash
npm test -- __tests__/components/PracticeList.test.tsx __tests__/api/practice-items.test.ts
```

Expected: all pass. If `practice-items.test.ts` tests for the sessions join, remove those assertions.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add components/PracticeList.tsx app/practice/page.tsx app/api/practice-items/route.ts __tests__/components/PracticeList.test.tsx __tests__/api/practice-items.test.ts
git commit -m "feat: simplify practice items list — correction only, no metadata"
```

---

## Task 7: Add swipe-to-delete and long-press bulk select

Adds mobile swipe gesture and long-press bulk selection mode, plus desktop always-visible checkboxes.

**Files:**
- Modify: `components/PracticeList.tsx`
- Modify: `package.json` (dependency)

- [ ] **Step 1: Install react-swipeable**

```bash
npm install react-swipeable@^7
```

- [ ] **Step 2: Add swipe-to-delete to each list item**

Update `PracticeList.tsx`. This is an in-place edit — replace the `<li>` rendering block with the swipeable version.

First, add the import at the top:
```ts
import { useSwipeable } from 'react-swipeable'
```

Extract the list item into a separate inner component `SwipeableItem` within the same file:

```tsx
function SwipeableItem({
  item,
  isBulkMode,
  isSelected,
  onToggleSelect,
  onDelete,
}: {
  item: PracticeItem
  isBulkMode: boolean
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [translateX, setTranslateX] = useState(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlers = useSwipeable({
    delta: 10,
    onSwiping: (e) => {
      // Cancel long-press if swiping
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      if (e.dir === 'Left') setTranslateX(-e.absX)
      else setTranslateX(0)
    },
    onSwipedLeft: (e) => {
      if (e.absX > 80) onDelete(item.id)
      else setTranslateX(0)
    },
    onSwipedRight: () => setTranslateX(0),
    trackMouse: false,
  })

  function handleTouchStart() {
    if (isBulkMode) return
    longPressTimer.current = setTimeout(() => {
      onToggleSelect(item.id) // entering bulk mode handled in parent
    }, 300)
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  return (
    <li className="relative overflow-hidden rounded-xl">
      {/* Swipe-to-delete background */}
      <div className="absolute inset-0 bg-red-600 flex items-center justify-end pr-5 rounded-xl">
        <span className="text-white text-sm font-medium">Delete</span>
      </div>
      {/* Item card */}
      <div
        {...handlers}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: translateX === 0 ? 'transform 0.2s' : 'none',
          userSelect: 'none',
          touchAction: 'pan-y',
        }}
        className="relative flex items-center gap-3 px-4 py-3 bg-gray-900 rounded-xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => isBulkMode && onToggleSelect(item.id)}
      >
        {/* Bulk-select checkbox — always on desktop, only in bulk mode on mobile */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item.id)}
          onClick={e => e.stopPropagation()}
          className={`w-4 h-4 rounded accent-violet-500 flex-shrink-0 ${isBulkMode ? 'block' : 'hidden sm:block'}`}
          aria-label="Select item"
        />
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_DOT_CLASS[item.type]}`} />
        <div className="flex-1 min-w-0 text-sm">
          {item.correction ? (
            <>
              <span className="line-through text-gray-500">{item.original}</span>
              {' → '}
              <span className="font-medium">{item.correction}</span>
            </>
          ) : (
            <span className="text-green-300">&ldquo;{item.original}&rdquo;</span>
          )}
        </div>
      </div>
    </li>
  )
}
```

**Note:** `style2` above is a placeholder — apply `user-select: none; touch-action: pan-y` via a Tailwind class or inline style. Use `style={{ userSelect: 'none', touchAction: 'pan-y', transform: ... }}` combining both style needs.

- [ ] **Step 3: Update the `PracticeList` parent to manage bulk mode state and render toolbar**

In the `PracticeList` function, add state:
```ts
const [isBulkMode, setIsBulkMode] = useState(false)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
```

Add a `toggleSelect` handler that enters bulk mode on first selection:
```ts
function handleToggleSelect(id: string) {
  setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  if (!isBulkMode) setIsBulkMode(true)
}

function exitBulkMode() {
  setIsBulkMode(false)
  setSelectedIds(new Set())
}

async function deleteSelected() {
  const ids = [...selectedIds]
  await Promise.allSettled(ids.map(id => fetch(`/api/practice-items/${id}`, { method: 'DELETE' })))
  setItems(prev => prev.filter(i => !selectedIds.has(i.id)))
  exitBulkMode()
}
```

Add the toolbar above the list (shown when `selectedIds.size > 0` on desktop, or when `isBulkMode` on mobile):
```tsx
{(isBulkMode || selectedIds.size > 0) && (
  <div className="flex items-center gap-3 px-3 py-2 bg-indigo-950 border border-indigo-800 rounded-xl text-sm">
    <span className="text-indigo-300">{selectedIds.size} selected</span>
    <button onClick={() => setSelectedIds(new Set(filtered.map(i => i.id)))} className="text-indigo-400 hover:text-indigo-200">
      Select all
    </button>
    <div className="flex-1" />
    <button onClick={exitBulkMode} className="text-gray-400 hover:text-gray-200">Cancel</button>
    <button onClick={deleteSelected} className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded-lg text-white font-medium">
      Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
    </button>
  </div>
)}
```

Replace the `<li>` in the filtered map with `<SwipeableItem>`:
```tsx
{filtered.map(item => (
  <SwipeableItem
    key={item.id}
    item={item}
    isBulkMode={isBulkMode}
    isSelected={selectedIds.has(item.id)}
    onToggleSelect={handleToggleSelect}
    onDelete={deleteItem}
  />
))}
```

- [ ] **Step 4: Run the tests**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```

Expected: all tests pass. (Swipe behaviour is gesture-driven and tested manually; unit tests cover the layout and filter logic.)

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/PracticeList.tsx package.json package-lock.json
git commit -m "feat: add swipe-to-delete and long-press bulk select to practice items"
```


---

## Manual Verification Checklist

After all tasks complete, verify in the browser:

**Auto-title:**
- [ ] Upload a `PTT-*.ogg` file → after analysis, session title starts with "WhatsApp: "
- [ ] Upload a generic file → title reflects conversation topic
- [ ] Title is editable via the inline edit field on the transcript screen

**Annotation modal:**
- [ ] Tap/click an annotated word → centred modal appears with backdrop
- [ ] Tap backdrop → modal closes
- [ ] Tap X button → modal closes
- [ ] Tap "Add to practice list" → button shows "✓ Added", modal stays open
- [ ] On mobile: modal is legible and centred on screen

**Practice items:**
- [ ] Items show only type dot + original → correction (no explanation, no session name)
- [ ] Strengths show only the original phrase in green
- [ ] Reviewed filter buttons are gone; type filter still works
- [ ] **Mobile:** Swipe left → red delete background reveals; release past 80px → item deleted
- [ ] **Mobile:** Long-press → bulk checkboxes appear; select multiple → "Delete (N)" → items gone
- [ ] **Desktop:** Checkboxes always visible; check one → toolbar appears; "Select all" → all checked; "Delete" → all gone
