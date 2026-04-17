# Session Workflow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the session and practice screens so annotation states (unreviewed/saved/written) are scannable at a glance, practice items show transcript context snippets, and gestures are simplified.

**Architecture:** CSS tokens drive three annotation highlight states (amber/violet/green) across both themes. The session API response gains a `writtenAnnotations` field. The practice-items API gains a secondary lookup to supply segment text. Components are updated bottom-up: AnnotatedText → TranscriptView/page → AnnotationCard → PracticeList.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase JS v2, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-04-15-session-workflow-redesign.md`

---

## File Map

| File | Change |
|---|---|
| `app/globals.css` | Add annotation-state CSS custom properties (light + dark) |
| `lib/i18n.ts` | Add 8 new keys, remove 3 obsolete keys |
| `lib/types.ts` | Add `segment_text/start_char/end_char` to `PracticeItem`; add `writtenAnnotations` to `SessionDetail` |
| `app/api/sessions/[id]/route.ts` | Select `written_down` on practice_items, build + return `writtenAnnotations` array |
| `app/api/practice-items/route.ts` | Secondary lookup for segment text after fetching items |
| `components/AnnotatedText.tsx` | Three-state highlight via CSS tokens; rename `addedAnnotationIds` → `savedAnnotationIds`, add `writtenAnnotationIds` |
| `components/TranscriptView.tsx` | Accept + pass `writtenAnnotations`, `onAnnotationWritten`, `onAnnotationUnwritten` |
| `app/sessions/[id]/page.tsx` | Manage `writtenAnnotations` Set state; wire new callbacks |
| `components/AnnotationCard.tsx` | Replace full-width button with compact star + check icon row |
| `components/PracticeList.tsx` | Context snippet; `writtenFilter` state ('hidden'/'only'/'all'); animate-out on mark-written; remove swipe-left delete |
| `app/practice/page.tsx` | Remove `initialFilterNotWritten` prop (no longer needed) |
| `__tests__/lib/i18n.test.ts` | Smoke-check new keys |
| `__tests__/api/sessions.test.ts` | Assert `writtenAnnotations` in GET /api/sessions/:id response |
| `__tests__/api/practice-items.test.ts` | Assert `segment_text` in GET /api/practice-items response |
| `__tests__/components/AnnotatedText.test.tsx` | Update for new prop names; add three-state tests |
| `__tests__/components/AnnotationCard.test.tsx` | Replace button tests with icon-row tests |
| `__tests__/components/TranscriptView.test.tsx` | Add `writtenAnnotations` prop to render calls |
| `__tests__/components/PracticeList.test.tsx` | Update for new filter default, context snippet, gesture changes |

---

## Task 1: CSS tokens for annotation states

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add annotation CSS custom properties**

  Open `app/globals.css`. Find the `:root` block and add after the existing custom properties:

  ```css
  /* Annotation highlight states */
  --annotation-unreviewed-bg: rgba(245, 158, 11, 0.12);
  --annotation-unreviewed-border: #b45309;
  --annotation-unreviewed-text: #92400e;

  --annotation-saved-bg: rgba(139, 92, 246, 0.12);
  --annotation-saved-border: #6d28d9;
  --annotation-saved-text: #4c1d95;

  --annotation-written-bg: rgba(34, 197, 94, 0.1);
  --annotation-written-border: #15803d;
  --annotation-written-text: #14532d;
  ```

  Find the `.dark` block and add after the existing dark properties:

  ```css
  /* Annotation highlight states — dark */
  --annotation-unreviewed-bg: rgba(245, 158, 11, 0.15);
  --annotation-unreviewed-border: #d97706;
  --annotation-unreviewed-text: #fde68a;

  --annotation-saved-bg: rgba(139, 92, 246, 0.2);
  --annotation-saved-border: #8b5cf6;
  --annotation-saved-text: #ddd6fe;

  --annotation-written-bg: rgba(34, 197, 94, 0.12);
  --annotation-written-border: #22c55e;
  --annotation-written-text: #86efac;
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/globals.css
  git commit -m "feat: add annotation-state CSS tokens for light/dark themes"
  ```

---

## Task 2: i18n — add new keys, remove obsolete

**Files:**
- Modify: `lib/i18n.ts`
- Modify: `__tests__/lib/i18n.test.ts`

- [ ] **Step 1: Write failing i18n tests**

  Add to `__tests__/lib/i18n.test.ts`:

  ```ts
  describe('annotation action i18n keys', () => {
    it('annotation.starAria exists in en', () => {
      expect(t('annotation.starAria', 'en')).not.toBe('annotation.starAria')
    })
    it('annotation.starAria exists in es', () => {
      expect(t('annotation.starAria', 'es')).not.toBe('annotation.starAria')
    })
    it('annotation.stateUnsaved exists in en', () => {
      expect(t('annotation.stateUnsaved', 'en')).not.toBe('annotation.stateUnsaved')
    })
    it('practiceList.filterWritten exists in en', () => {
      expect(t('practiceList.filterWritten', 'en')).not.toBe('practiceList.filterWritten')
    })
    it('annotation.addToPractice is removed (falls back to key)', () => {
      expect(t('annotation.addToPractice', 'en')).toBe('annotation.addToPractice')
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npm test -- __tests__/lib/i18n.test.ts
  ```

  Expected: `annotation.starAria exists in en` FAILS (key missing); `annotation.addToPractice is removed` FAILS (key still present).

- [ ] **Step 3: Update lib/i18n.ts**

  In the `en` locale, **remove** these keys:
  - `annotation.addToPractice`
  - `annotation.addedToPractice`
  - `practiceList.filterNotWritten`
  - `practiceList.notWrittenDown`

  In the `en` locale, **add** these keys (in the annotation card comment block):

  ```ts
  'annotation.starAria': 'Save this correction',
  'annotation.unstarAria': 'Remove from saved',
  'annotation.markWrittenAria': 'Mark as written down',
  'annotation.unmarkWrittenAria': 'Unmark as written',
  'annotation.stateUnsaved': 'Not saved',
  'annotation.stateSaved': 'Saved',
  'annotation.stateWritten': 'Written ✓',
  ```

  In the `en` locale, **add** in the practice list comment block:

  ```ts
  'practiceList.filterWritten': 'Written',
  ```

  In the `es` locale, **remove** the same four keys, then **add**:

  ```ts
  'annotation.starAria': 'Guardar esta corrección',
  'annotation.unstarAria': 'Quitar de guardados',
  'annotation.markWrittenAria': 'Marcar como escrito',
  'annotation.unmarkWrittenAria': 'Desmarcar como escrito',
  'annotation.stateUnsaved': 'No guardado',
  'annotation.stateSaved': 'Guardado',
  'annotation.stateWritten': 'Escrito ✓',
  'practiceList.filterWritten': 'Escrito',
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npm test -- __tests__/lib/i18n.test.ts
  ```

  Expected: all PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/i18n.ts __tests__/lib/i18n.test.ts
  git commit -m "feat: add annotation-state and filter i18n keys; remove obsolete addToPractice keys"
  ```

---

## Task 3: TypeScript types

**Files:**
- Modify: `lib/types.ts`

No tests needed — TypeScript compilation catches type errors across dependents.

- [ ] **Step 1: Update PracticeItem**

  In `lib/types.ts`, find the `PracticeItem` interface and add three fields after `importance_note`:

  ```ts
  export interface PracticeItem {
    id: string
    session_id: string
    annotation_id: string | null
    type: AnnotationType
    original: string
    correction: string | null
    explanation: string
    sub_category: SubCategory
    reviewed: boolean
    written_down: boolean
    created_at: string
    updated_at: string
    flashcard_front: string | null
    flashcard_back: string | null
    flashcard_note: string | null
    importance_score: number | null
    importance_note: string | null
    // Enriched by API — null for legacy items without annotation_id
    segment_text: string | null
    start_char: number | null
    end_char: number | null
  }
  ```

- [ ] **Step 2: Update SessionDetail**

  Find `SessionDetail` and add `writtenAnnotations`:

  ```ts
  export interface SessionDetail {
    session: Pick<Session,
      'id' | 'title' | 'status' | 'error_stage' | 'duration_seconds' |
      'detected_speaker_count' | 'user_speaker_labels' | 'created_at'
    >
    segments: TranscriptSegment[]
    annotations: Annotation[]
    addedAnnotations: Record<string, string>   // annotationId -> practiceItemId
    writtenAnnotations: string[]               // annotation IDs where written_down = true
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add lib/types.ts
  git commit -m "feat: add segment_text fields to PracticeItem and writtenAnnotations to SessionDetail"
  ```

---

## Task 4: API — sessions/:id GET adds writtenAnnotations

**Files:**
- Modify: `app/api/sessions/[id]/route.ts`
- Modify: `__tests__/api/sessions.test.ts`

- [ ] **Step 1: Write failing test**

  In `__tests__/api/sessions.test.ts`, find the `GET /api/sessions/:id` describe block. If it doesn't exist, add one after the `POST /api/sessions` describe block. Add this test:

  ```ts
  describe('GET /api/sessions/:id', () => {
    it('returns writtenAnnotations array with IDs of written practice items', async () => {
      vi.mocked(createServerClient).mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'sessions') return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 's1', title: 'Test', status: 'ready', error_stage: null, duration_seconds: 60, detected_speaker_count: 2, user_speaker_labels: ['A'], created_at: '2026-03-15' },
                    error: null,
                  }),
                }),
              }),
            }),
          }
          if (table === 'transcript_segments') return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
          if (table === 'annotations') return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }
          // practice_items — one written, one not
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'pi-1', annotation_id: 'ann-1', written_down: true },
                  { id: 'pi-2', annotation_id: 'ann-2', written_down: false },
                ],
                error: null,
              }),
            }),
          }
        }),
      } as unknown as ReturnType<typeof createServerClient>)

      const { GET: getDetail } = await import('@/app/api/sessions/[id]/route')
      const req = new NextRequest('http://localhost/api/sessions/s1')
      const res = await getDetail(req, { params: { id: 's1' } })
      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.writtenAnnotations).toEqual(['ann-1'])
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test -- __tests__/api/sessions.test.ts
  ```

  Expected: FAIL — `writtenAnnotations` is undefined.

- [ ] **Step 3: Update app/api/sessions/[id]/route.ts**

  In the `GET` handler, change the practice_items select to include `written_down`:

  ```ts
  const { data: practiceItems } = await db
    .from('practice_items')
    .select('id, annotation_id, written_down')
    .eq('session_id', params.id)
  ```

  After building `addedAnnotations`, add:

  ```ts
  const writtenAnnotations = (practiceItems ?? [])
    .filter((p: { annotation_id: string | null; written_down: boolean }) => p.annotation_id && p.written_down)
    .map((p: { annotation_id: string }) => p.annotation_id)
  ```

  Update the return to include `writtenAnnotations`:

  ```ts
  return NextResponse.json({
    session,
    segments: segments ?? [],
    annotations: annotations ?? [],
    addedAnnotations,
    writtenAnnotations,
  })
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npm test -- __tests__/api/sessions.test.ts
  ```

  Expected: all PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add app/api/sessions/\[id\]/route.ts __tests__/api/sessions.test.ts
  git commit -m "feat: include writtenAnnotations in GET /api/sessions/:id response"
  ```

---

## Task 5: API — practice-items GET adds segment text

**Files:**
- Modify: `app/api/practice-items/route.ts`
- Modify: `__tests__/api/practice-items.test.ts`

- [ ] **Step 1: Write failing test**

  In `__tests__/api/practice-items.test.ts`, add a new test after the existing GET test:

  ```ts
  it('enriches items with segment_text, start_char, end_char via secondary lookup', async () => {
    vi.resetModules()
    vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
    vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
    const { createServerClient } = await import('@/lib/supabase-server')
    const { getAuthenticatedUser } = await import('@/lib/auth')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)

    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [{ id: 'session-1' }], error: null }),
          }),
        }
        if (table === 'practice_items') return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'item-1', annotation_id: 'ann-1', written_down: false }],
                error: null,
              }),
            }),
          }),
        }
        if (table === 'annotations') return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'ann-1', segment_id: 'seg-1', start_char: 5, end_char: 11 }],
              error: null,
            }),
          }),
        }
        if (table === 'transcript_segments') return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'seg-1', text: 'Hola mundo amigo mío.' }],
              error: null,
            }),
          }),
        }
        return { select: vi.fn() }
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { GET } = await import('@/app/api/practice-items/route')
    const req = new NextRequest('http://localhost/api/practice-items')
    const res = await GET(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body[0].segment_text).toBe('Hola mundo amigo mío.')
    expect(body[0].start_char).toBe(5)
    expect(body[0].end_char).toBe(11)
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test -- __tests__/api/practice-items.test.ts
  ```

  Expected: FAIL — `segment_text` is undefined.

- [ ] **Step 3: Update app/api/practice-items/route.ts GET handler**

  After the main `.order()` query (after the `if (error) return ...` check), add the secondary lookup and enrichment. Replace the final `return NextResponse.json(data)` with:

  ```ts
  // Secondary lookup: fetch segment text for each annotation_id
  const annotationIds = (data ?? [])
    .map((i: { annotation_id: string | null }) => i.annotation_id)
    .filter(Boolean) as string[]

  type AnnRow = { id: string; segment_id: string; start_char: number; end_char: number }
  type SegRow = { id: string; text: string }
  let annotationMap = new Map<string, AnnRow>()
  let segmentTextMap = new Map<string, string>()

  if (annotationIds.length > 0) {
    const { data: annRows } = await db
      .from('annotations')
      .select('id, segment_id, start_char, end_char')
      .in('id', annotationIds)

    annotationMap = new Map((annRows ?? []).map((a: AnnRow) => [a.id, a]))

    const segmentIds = [...new Set((annRows ?? []).map((a: AnnRow) => a.segment_id))]
    if (segmentIds.length > 0) {
      const { data: segRows } = await db
        .from('transcript_segments')
        .select('id, text')
        .in('id', segmentIds)

      segmentTextMap = new Map((segRows ?? []).map((s: SegRow) => [s.id, s.text]))
    }
  }

  const enriched = (data ?? []).map((item: { annotation_id: string | null }) => {
    if (!item.annotation_id) {
      return { ...item, segment_text: null, start_char: null, end_char: null }
    }
    const ann = annotationMap.get(item.annotation_id)
    if (!ann) return { ...item, segment_text: null, start_char: null, end_char: null }
    return {
      ...item,
      segment_text: segmentTextMap.get(ann.segment_id) ?? null,
      start_char: ann.start_char,
      end_char: ann.end_char,
    }
  })

  return NextResponse.json(enriched)
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npm test -- __tests__/api/practice-items.test.ts
  ```

  Expected: all PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add app/api/practice-items/route.ts __tests__/api/practice-items.test.ts
  git commit -m "feat: enrich practice items with segment_text via secondary annotation lookup"
  ```

---

## Task 6: AnnotatedText — three-state highlighting

**Files:**
- Modify: `components/AnnotatedText.tsx`
- Modify: `__tests__/components/AnnotatedText.test.tsx`

- [ ] **Step 1: Write failing tests**

  Replace the contents of `__tests__/components/AnnotatedText.test.tsx` with:

  ```tsx
  // __tests__/components/AnnotatedText.test.tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { AnnotatedText } from '@/components/AnnotatedText'
  import type { Annotation } from '@/lib/types'

  const text = 'Yo fui al mercado.'
  const annotation: Annotation = {
    id: 'ann-1',
    session_id: 's1',
    segment_id: 'seg-1',
    type: 'grammar',
    original: 'Yo fui',
    start_char: 0,
    end_char: 6,
    correction: 'Fui',
    explanation: 'Drop the pronoun.',
    sub_category: 'other',
    flashcard_front: null,
    flashcard_back: null,
    flashcard_note: null,
    importance_score: null,
    importance_note: null,
  }

  describe('AnnotatedText', () => {
    it('renders plain text when no annotations', () => {
      render(<AnnotatedText text={text} annotations={[]} onAnnotationClick={() => {}} />)
      expect(screen.getByText(text)).toBeInTheDocument()
    })

    it('renders a highlighted mark for the annotated phrase', () => {
      render(<AnnotatedText text={text} annotations={[annotation]} onAnnotationClick={() => {}} />)
      expect(screen.getByText('Yo fui').tagName).toBe('MARK')
    })

    it('calls onAnnotationClick when mark is clicked', async () => {
      const onClick = vi.fn()
      render(<AnnotatedText text={text} annotations={[annotation]} onAnnotationClick={onClick} />)
      await userEvent.click(screen.getByText('Yo fui'))
      expect(onClick).toHaveBeenCalledWith(annotation)
    })

    it('renders text before and after the highlight', () => {
      render(<AnnotatedText text={text} annotations={[annotation]} onAnnotationClick={() => {}} />)
      expect(screen.getByText(' al mercado.')).toBeInTheDocument()
    })

    it('applies unreviewed style when not in savedAnnotationIds or writtenAnnotationIds', () => {
      render(<AnnotatedText text={text} annotations={[annotation]} onAnnotationClick={() => {}} />)
      const mark = screen.getByText('Yo fui')
      expect(mark).toHaveClass('annotation-unreviewed')
    })

    it('applies saved style when annotation is in savedAnnotationIds', () => {
      render(
        <AnnotatedText
          text={text}
          annotations={[annotation]}
          onAnnotationClick={() => {}}
          savedAnnotationIds={new Set(['ann-1'])}
        />
      )
      expect(screen.getByText('Yo fui')).toHaveClass('annotation-saved')
    })

    it('applies written style when annotation is in writtenAnnotationIds', () => {
      render(
        <AnnotatedText
          text={text}
          annotations={[annotation]}
          onAnnotationClick={() => {}}
          savedAnnotationIds={new Set(['ann-1'])}
          writtenAnnotationIds={new Set(['ann-1'])}
        />
      )
      expect(screen.getByText('Yo fui')).toHaveClass('annotation-written')
    })

    it('written style takes priority over saved style', () => {
      render(
        <AnnotatedText
          text={text}
          annotations={[annotation]}
          onAnnotationClick={() => {}}
          savedAnnotationIds={new Set(['ann-1'])}
          writtenAnnotationIds={new Set(['ann-1'])}
        />
      )
      const mark = screen.getByText('Yo fui')
      expect(mark).toHaveClass('annotation-written')
      expect(mark).not.toHaveClass('annotation-saved')
    })

    it('still calls onAnnotationClick on a saved annotation', async () => {
      const onClick = vi.fn()
      render(
        <AnnotatedText
          text={text}
          annotations={[annotation]}
          onAnnotationClick={onClick}
          savedAnnotationIds={new Set(['ann-1'])}
        />
      )
      await userEvent.click(screen.getByText('Yo fui'))
      expect(onClick).toHaveBeenCalledWith(annotation)
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npm test -- __tests__/components/AnnotatedText.test.tsx
  ```

  Expected: FAIL on `annotation-unreviewed`, `annotation-saved`, `annotation-written` class tests (prop names don't exist yet).

- [ ] **Step 3: Rewrite components/AnnotatedText.tsx**

  ```tsx
  // components/AnnotatedText.tsx
  import type { Annotation } from '@/lib/types'

  interface Props {
    text: string
    annotations: Annotation[]
    onAnnotationClick: (annotation: Annotation) => void
    savedAnnotationIds?: Set<string>
    writtenAnnotationIds?: Set<string>
  }

  interface Span {
    start: number
    end: number
    annotation?: Annotation
  }

  function buildSpans(text: string, annotations: Annotation[]): Span[] {
    const sorted = [...annotations].sort((a, b) => a.start_char - b.start_char)
    const spans: Span[] = []
    let cursor = 0
    for (const ann of sorted) {
      if (ann.start_char > cursor) spans.push({ start: cursor, end: ann.start_char })
      spans.push({ start: ann.start_char, end: ann.end_char, annotation: ann })
      cursor = ann.end_char
    }
    if (cursor < text.length) spans.push({ start: cursor, end: text.length })
    return spans
  }

  function annotationClass(id: string, saved: Set<string>, written: Set<string>): string {
    if (written.has(id)) return 'annotation-written'
    if (saved.has(id)) return 'annotation-saved'
    return 'annotation-unreviewed'
  }

  export function AnnotatedText({
    text,
    annotations,
    onAnnotationClick,
    savedAnnotationIds = new Set(),
    writtenAnnotationIds = new Set(),
  }: Props) {
    const spans = buildSpans(text, annotations)

    return (
      <span>
        {spans.map((span, i) => {
          const slice = text.slice(span.start, span.end)
          if (span.annotation) {
            const stateClass = annotationClass(span.annotation.id, savedAnnotationIds, writtenAnnotationIds)
            return (
              <mark
                key={i}
                className={`underline decoration-2 cursor-pointer rounded-sm px-1 ${stateClass}`}
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

  Then add the CSS classes to `app/globals.css` under `@layer components` (or at the end of the file, outside any layer):

  ```css
  .annotation-unreviewed {
    background-color: var(--annotation-unreviewed-bg);
    text-decoration-color: var(--annotation-unreviewed-border);
    color: var(--annotation-unreviewed-text);
  }

  .annotation-saved {
    background-color: var(--annotation-saved-bg);
    text-decoration-color: var(--annotation-saved-border);
    color: var(--annotation-saved-text);
  }

  .annotation-written {
    background-color: var(--annotation-written-bg);
    text-decoration-color: var(--annotation-written-border);
    color: var(--annotation-written-text);
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npm test -- __tests__/components/AnnotatedText.test.tsx
  ```

  Expected: all PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add components/AnnotatedText.tsx app/globals.css __tests__/components/AnnotatedText.test.tsx
  git commit -m "feat: three-state annotation highlights (unreviewed/saved/written) with theme-aware CSS tokens"
  ```

---

## Task 7: TranscriptView + session page — wire writtenAnnotations

**Files:**
- Modify: `components/TranscriptView.tsx`
- Modify: `app/sessions/[id]/page.tsx`
- Modify: `__tests__/components/TranscriptView.test.tsx`

- [ ] **Step 1: Write failing test**

  In `__tests__/components/TranscriptView.test.tsx`, update `defaultProps` and add a test. First change `defaultProps` to include the new required props:

  ```tsx
  const defaultProps = {
    sessionId: 's1',
    addedAnnotations: new Map<string, string>(),
    writtenAnnotations: new Set<string>(),
    onAnnotationAdded: vi.fn(),
    onAnnotationRemoved: vi.fn(),
    onAnnotationWritten: vi.fn(),
    onAnnotationUnwritten: vi.fn(),
  }
  ```

  Add this test inside the `TranscriptView` describe block:

  ```tsx
  it('passes writtenAnnotationIds to AnnotatedText so written annotations get written style', () => {
    const { container } = render(
      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={['A']}
        {...defaultProps}
        writtenAnnotations={new Set(['ann-1'])}
      />
    )
    const mark = container.querySelector('mark')
    expect(mark).toHaveClass('annotation-written')
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npm test -- __tests__/components/TranscriptView.test.tsx
  ```

  Expected: FAIL — `writtenAnnotations` prop not accepted; type error or mark lacks class.

- [ ] **Step 3: Update components/TranscriptView.tsx**

  ```tsx
  // components/TranscriptView.tsx
  'use client'
  import { useState } from 'react'
  import { AnnotatedText } from '@/components/AnnotatedText'
  import { Modal } from '@/components/Modal'
  import { AnnotationCard } from '@/components/AnnotationCard'
  import { useTranslation } from '@/components/LanguageProvider'
  import type { TranscriptSegment, Annotation } from '@/lib/types'

  interface Props {
    segments: TranscriptSegment[]
    annotations: Annotation[]
    userSpeakerLabels: ('A' | 'B')[] | null
    sessionId: string
    addedAnnotations: Map<string, string>
    writtenAnnotations: Set<string>
    onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
    onAnnotationRemoved: (annotationId: string) => void
    onAnnotationWritten: (annotationId: string) => void
    onAnnotationUnwritten: (annotationId: string) => void
  }

  export function TranscriptView({
    segments, annotations, userSpeakerLabels, sessionId,
    addedAnnotations, writtenAnnotations,
    onAnnotationAdded, onAnnotationRemoved, onAnnotationWritten, onAnnotationUnwritten,
  }: Props) {
    const { t } = useTranslation()
    const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null)

    const annotationsBySegment = annotations.reduce<Record<string, Annotation[]>>((acc, a) => {
      if (!acc[a.segment_id]) acc[a.segment_id] = []
      acc[a.segment_id].push(a)
      return acc
    }, {})

    const savedAnnotationIds = new Set(addedAnnotations.keys())

    return (
      <div className="space-y-4">
        <div className="space-y-4">
          {segments.map(seg => {
            const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)
            return (
              <div key={seg.id}>
                <div className={!isUser ? 'opacity-40' : ''}>
                  <p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
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
                        savedAnnotationIds={savedAnnotationIds}
                        writtenAnnotationIds={writtenAnnotations}
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
            title={<span>{t(`type.${activeAnnotation.type}`)}</span>}
            onClose={() => setActiveAnnotation(null)}
          >
            <AnnotationCard
              annotation={activeAnnotation}
              sessionId={sessionId}
              practiceItemId={addedAnnotations.get(activeAnnotation.id) ?? null}
              isWrittenDown={writtenAnnotations.has(activeAnnotation.id)}
              onAnnotationAdded={onAnnotationAdded}
              onAnnotationRemoved={onAnnotationRemoved}
              onAnnotationWritten={onAnnotationWritten}
              onAnnotationUnwritten={onAnnotationUnwritten}
            />
          </Modal>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 4: Update app/sessions/[id]/page.tsx**

  ```tsx
  // app/sessions/[id]/page.tsx
  'use client'
  import { useEffect, useState } from 'react'
  import { useRouter } from 'next/navigation'
  import { TranscriptView } from '@/components/TranscriptView'
  import { InlineEdit } from '@/components/InlineEdit'
  import { useTranslation } from '@/components/LanguageProvider'
  import type { SessionDetail } from '@/lib/types'

  export default function TranscriptPage({ params }: { params: { id: string } }) {
    const { t } = useTranslation()
    const router = useRouter()
    const [detail, setDetail] = useState<SessionDetail | null>(null)
    const [title, setTitle] = useState('')
    const [addedAnnotations, setAddedAnnotations] = useState<Map<string, string>>(new Map())
    const [writtenAnnotations, setWrittenAnnotations] = useState<Set<string>>(new Set())

    useEffect(() => {
      fetch(`/api/sessions/${params.id}`)
        .then(r => r.json())
        .then((d: SessionDetail) => {
          setDetail(d)
          setTitle(d.session.title)
          setAddedAnnotations(new Map(Object.entries(d.addedAnnotations)))
          setWrittenAnnotations(new Set(d.writtenAnnotations))
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
      setWrittenAnnotations(prev => { const next = new Set(prev); next.delete(annotationId); return next })
    }

    function handleAnnotationWritten(annotationId: string) {
      setWrittenAnnotations(prev => new Set([...prev, annotationId]))
    }

    function handleAnnotationUnwritten(annotationId: string) {
      setWrittenAnnotations(prev => { const next = new Set(prev); next.delete(annotationId); return next })
    }

    async function handleReanalyse() {
      const res = await fetch(`/api/sessions/${params.id}/analyse`, { method: 'POST' })
      if (res.ok) router.push(`/sessions/${params.id}/status`)
    }

    if (!detail) return <p className="text-text-secondary">{t('transcript.loading')}</p>

    const { session, segments, annotations } = detail
    const counts = { grammar: 0, naturalness: 0 }
    annotations.forEach(a => counts[a.type as keyof typeof counts]++)

    const durationLabel = session.duration_seconds
      ? `${Math.floor(session.duration_seconds / 60)} ${t('transcript.min')}`
      : ''

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <InlineEdit value={title} onSave={handleRename} className="text-xl font-bold break-words" />
            <p className="text-sm text-text-secondary mt-1">
              {durationLabel} · {counts.grammar} {t('transcript.grammar')} · {counts.naturalness}{' '}
              {t('transcript.naturalness')}
            </p>
          </div>
          <button
            onClick={handleReanalyse}
            className="text-xs text-text-tertiary hover:text-text-secondary border border-border rounded px-3 py-1 shrink-0"
          >
            {t('transcript.reanalyse')}
          </button>
        </div>

        <TranscriptView
          segments={segments}
          annotations={annotations}
          userSpeakerLabels={session.user_speaker_labels ?? null}
          sessionId={params.id}
          addedAnnotations={addedAnnotations}
          writtenAnnotations={writtenAnnotations}
          onAnnotationAdded={handleAnnotationAdded}
          onAnnotationRemoved={handleAnnotationRemoved}
          onAnnotationWritten={handleAnnotationWritten}
          onAnnotationUnwritten={handleAnnotationUnwritten}
        />
      </div>
    )
  }
  ```

- [ ] **Step 5: Run tests**

  ```bash
  npm test -- __tests__/components/TranscriptView.test.tsx
  ```

  Expected: all PASS.

- [ ] **Step 6: Commit**

  ```bash
  git add components/TranscriptView.tsx app/sessions/\[id\]/page.tsx __tests__/components/TranscriptView.test.tsx
  git commit -m "feat: wire writtenAnnotations state through TranscriptView to AnnotatedText"
  ```

---

## Task 8: AnnotationCard — compact star + check icon row

**Files:**
- Modify: `components/AnnotationCard.tsx`
- Modify: `__tests__/components/AnnotationCard.test.tsx`

- [ ] **Step 1: Write failing tests**

  Replace the contents of `__tests__/components/AnnotationCard.test.tsx` with:

  ```tsx
  // __tests__/components/AnnotationCard.test.tsx
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { AnnotationCard } from '@/components/AnnotationCard'
  import type { Annotation } from '@/lib/types'

  const annotation: Annotation = {
    id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
    type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6,
    correction: 'Fui', explanation: 'Drop the subject pronoun.', sub_category: 'subjunctive',
    flashcard_front: null, flashcard_back: null, flashcard_note: null,
    importance_score: null, importance_note: null,
  }

  const defaultProps = {
    sessionId: 's1',
    practiceItemId: null,
    isWrittenDown: false,
    onAnnotationAdded: vi.fn(),
    onAnnotationRemoved: vi.fn(),
    onAnnotationWritten: vi.fn(),
    onAnnotationUnwritten: vi.fn(),
  }

  beforeEach(() => { vi.resetAllMocks() })

  describe('AnnotationCard — content', () => {
    it('renders original, correction, explanation and sub-category', () => {
      render(<AnnotationCard annotation={annotation} {...defaultProps} />)
      expect(screen.getByText('Yo fui')).toBeInTheDocument()
      expect(screen.getByText('Fui')).toBeInTheDocument()
      expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
      expect(screen.getByText('Subjunctive')).toBeInTheDocument()
    })
  })

  describe('AnnotationCard — state hint', () => {
    it('shows "Not saved" when practiceItemId is null', () => {
      render(<AnnotationCard annotation={annotation} {...defaultProps} />)
      expect(screen.getByText('Not saved')).toBeInTheDocument()
    })

    it('shows "Saved" when practiceItemId is set and not written', () => {
      render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" />)
      expect(screen.getByText('Saved')).toBeInTheDocument()
    })

    it('shows "Written ✓" when isWrittenDown is true', () => {
      render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" isWrittenDown={true} />)
      expect(screen.getByText('Written ✓')).toBeInTheDocument()
    })
  })

  describe('AnnotationCard — star button', () => {
    it('star button is present', () => {
      render(<AnnotationCard annotation={annotation} {...defaultProps} />)
      expect(screen.getByRole('button', { name: /save this correction/i })).toBeInTheDocument()
    })

    it('calls POST and onAnnotationAdded when star is tapped with no practice item', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'pi-1' }),
      } as Response)
      const onAnnotationAdded = vi.fn()
      render(<AnnotationCard annotation={annotation} {...defaultProps} onAnnotationAdded={onAnnotationAdded} />)
      await userEvent.click(screen.getByRole('button', { name: /save this correction/i }))
      expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1', 'pi-1')
    })

    it('calls DELETE and onAnnotationRemoved when star is tapped with existing practice item', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
      const onAnnotationRemoved = vi.fn()
      render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" onAnnotationRemoved={onAnnotationRemoved} />)
      await userEvent.click(screen.getByRole('button', { name: /remove from saved/i }))
      expect(onAnnotationRemoved).toHaveBeenCalledWith('ann-1')
    })

    it('includes required fields in POST body', async () => {
      let capturedBody: Record<string, unknown> = {}
      vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
        capturedBody = JSON.parse((init as RequestInit).body as string)
        return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
      })
      render(<AnnotationCard annotation={annotation} {...defaultProps} />)
      await userEvent.click(screen.getByRole('button', { name: /save this correction/i }))
      expect(capturedBody.annotation_id).toBe('ann-1')
      expect(capturedBody.sub_category).toBe('subjunctive')
      expect(capturedBody.original).toBe('Yo fui')
      expect(capturedBody.correction).toBe('Fui')
    })
  })

  describe('AnnotationCard — check button', () => {
    it('check button is disabled when not saved', () => {
      render(<AnnotationCard annotation={annotation} {...defaultProps} />)
      expect(screen.getByRole('button', { name: /mark as written down/i })).toBeDisabled()
    })

    it('check button is enabled when saved', () => {
      render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" />)
      expect(screen.getByRole('button', { name: /mark as written down/i })).not.toBeDisabled()
    })

    it('calls PATCH written_down:true and onAnnotationWritten when check is tapped (unwritten)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
      const onAnnotationWritten = vi.fn()
      render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" onAnnotationWritten={onAnnotationWritten} />)
      await userEvent.click(screen.getByRole('button', { name: /mark as written down/i }))
      expect(global.fetch).toHaveBeenCalledWith('/api/practice-items/pi-1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ written_down: true }),
      }))
      expect(onAnnotationWritten).toHaveBeenCalledWith('ann-1')
    })

    it('calls PATCH written_down:false and onAnnotationUnwritten when check is tapped (already written)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
      const onAnnotationUnwritten = vi.fn()
      render(<AnnotationCard annotation={annotation} {...defaultProps} practiceItemId="pi-1" isWrittenDown={true} onAnnotationUnwritten={onAnnotationUnwritten} />)
      await userEvent.click(screen.getByRole('button', { name: /unmark as written/i }))
      expect(global.fetch).toHaveBeenCalledWith('/api/practice-items/pi-1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ written_down: false }),
      }))
      expect(onAnnotationUnwritten).toHaveBeenCalledWith('ann-1')
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npm test -- __tests__/components/AnnotationCard.test.tsx
  ```

  Expected: multiple FAILs — new props not present, new buttons not present.

- [ ] **Step 3: Rewrite components/AnnotationCard.tsx**

  ```tsx
  // components/AnnotationCard.tsx
  'use client'
  import { useState } from 'react'
  import type { Annotation } from '@/lib/types'
  import { useTranslation } from '@/components/LanguageProvider'

  function importanceStars(score: number | null): string | null {
    if (score === 3) return '★★★'
    if (score === 2) return '★★☆'
    if (score === 1) return '★☆☆'
    return null
  }

  interface Props {
    annotation: Annotation
    sessionId: string
    practiceItemId: string | null
    isWrittenDown: boolean
    onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
    onAnnotationRemoved: (annotationId: string) => void
    onAnnotationWritten: (annotationId: string) => void
    onAnnotationUnwritten: (annotationId: string) => void
  }

  export function AnnotationCard({
    annotation, sessionId, practiceItemId: initialPracticeItemId, isWrittenDown: initialIsWrittenDown,
    onAnnotationAdded, onAnnotationRemoved, onAnnotationWritten, onAnnotationUnwritten,
  }: Props) {
    const { t } = useTranslation()
    const [practiceItemId, setPracticeItemId] = useState<string | null>(initialPracticeItemId)
    const [isWrittenDown, setIsWrittenDown] = useState(initialIsWrittenDown)
    const [loadingStar, setLoadingStar] = useState(false)
    const [loadingCheck, setLoadingCheck] = useState(false)
    const [importanceExpanded, setImportanceExpanded] = useState(false)

    async function handleStar() {
      if (practiceItemId) {
        // Unstar — delete practice item
        setLoadingStar(true)
        const res = await fetch(`/api/practice-items/${practiceItemId}`, { method: 'DELETE' })
        if (res.ok) {
          setPracticeItemId(null)
          setIsWrittenDown(false)
          onAnnotationRemoved(annotation.id)
        }
        setLoadingStar(false)
      } else {
        // Star — create practice item
        setLoadingStar(true)
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
            importance_score: annotation.importance_score ?? null,
            importance_note: annotation.importance_note ?? null,
          }),
        })
        if (res.ok) {
          const { id } = await res.json() as { id: string }
          setPracticeItemId(id)
          onAnnotationAdded(annotation.id, id)
        }
        setLoadingStar(false)
      }
    }

    async function handleCheck() {
      if (!practiceItemId) return
      setLoadingCheck(true)
      const newValue = !isWrittenDown
      const res = await fetch(`/api/practice-items/${practiceItemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ written_down: newValue }),
      })
      if (res.ok) {
        setIsWrittenDown(newValue)
        if (newValue) onAnnotationWritten(annotation.id)
        else onAnnotationUnwritten(annotation.id)
      }
      setLoadingCheck(false)
    }

    const stateHint = isWrittenDown
      ? t('annotation.stateWritten')
      : practiceItemId
      ? t('annotation.stateSaved')
      : t('annotation.stateUnsaved')

    const starAriaLabel = practiceItemId
      ? t('annotation.unstarAria')
      : t('annotation.starAria')

    const checkAriaLabel = isWrittenDown
      ? t('annotation.unmarkWrittenAria')
      : t('annotation.markWrittenAria')

    return (
      <div className="space-y-3">
        <p className="text-base">
          <span className="bg-error-surface text-on-error-surface px-1.5 py-0.5 rounded">
            {annotation.original}
          </span>
          {' → '}
          <span className="font-semibold text-lg text-correction">
            {annotation.correction}
          </span>
        </p>
        <p className="text-sm text-text-secondary leading-relaxed">{annotation.explanation}</p>
        <span className="border border-accent-chip-border text-on-accent-chip bg-accent-chip rounded-full px-2 py-0.5 text-xs">
          {t(`subCat.${annotation.sub_category}`)}
        </span>
        {importanceStars(annotation.importance_score) && (
          <div>
            {annotation.importance_note ? (
              <>
                <button
                  onClick={() => setImportanceExpanded(e => !e)}
                  className="text-amber-400 text-base leading-none focus:outline-none"
                  aria-label={t('practiceList.importanceToggleAria')}
                >
                  {importanceStars(annotation.importance_score)}
                </button>
                {importanceExpanded && (
                  <p className="mt-1.5 text-text-secondary text-xs leading-relaxed">
                    {annotation.importance_note}
                  </p>
                )}
              </>
            ) : (
              <span className="text-amber-400 text-base leading-none">
                {importanceStars(annotation.importance_score)}
              </span>
            )}
          </div>
        )}
        {/* Action row */}
        <div className="flex items-center gap-2 pt-4 border-t border-border">
          <span className="text-xs text-text-tertiary mr-auto">{stateHint}</span>
          {/* Star button */}
          <button
            onClick={handleStar}
            disabled={loadingStar}
            aria-label={starAriaLabel}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base transition-colors disabled:opacity-40 ${
              practiceItemId
                ? 'border-[var(--annotation-saved-border)] bg-[var(--annotation-saved-bg)] text-[var(--annotation-saved-text)]'
                : 'border-border bg-surface text-text-tertiary hover:border-border-hover'
            }`}
          >
            {practiceItemId ? '★' : '☆'}
          </button>
          {/* Check button */}
          <button
            onClick={handleCheck}
            disabled={!practiceItemId || loadingCheck}
            aria-label={checkAriaLabel}
            className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base transition-colors disabled:opacity-30 ${
              isWrittenDown
                ? 'border-[var(--annotation-written-border)] bg-[var(--annotation-written-bg)] text-[var(--annotation-written-text)]'
                : 'border-border bg-surface text-text-tertiary hover:border-border-hover'
            }`}
          >
            ✓
          </button>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npm test -- __tests__/components/AnnotationCard.test.tsx
  ```

  Expected: all PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add components/AnnotationCard.tsx __tests__/components/AnnotationCard.test.tsx
  git commit -m "feat: replace full-width add button with compact star/check icon row in AnnotationCard"
  ```

---

## Task 9: PracticeList — context snippet, filter, gestures

**Files:**
- Modify: `components/PracticeList.tsx`
- Modify: `app/practice/page.tsx`
- Modify: `__tests__/components/PracticeList.test.tsx`

- [ ] **Step 1: Update test fixtures and write failing tests**

  In `__tests__/components/PracticeList.test.tsx`, update the `grammarItem` fixture and `subjectiveItem` fixture to include the new fields (add at end of each object):

  ```ts
  const grammarItem: PracticeItem = {
    id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
    type: 'grammar', original: 'Yo fui', correction: 'Fui',
    explanation: 'Drop pronoun.', sub_category: 'other', reviewed: false,
    written_down: false,
    created_at: '2026-03-15', updated_at: '2026-03-15',
    flashcard_front: null, flashcard_back: null, flashcard_note: null,
    importance_score: null, importance_note: null,
    segment_text: 'Ayer Yo fui al mercado con ella.',
    start_char: 6,
    end_char: 12,
  }

  const subjectiveItem: PracticeItem = {
    id: 'item-2', session_id: 's1', annotation_id: 'ann-2',
    type: 'grammar', original: 'vengas', correction: 'venís',
    explanation: '', sub_category: 'subjunctive', reviewed: false,
    written_down: false,
    created_at: '2026-03-15', updated_at: '2026-03-15',
    flashcard_front: null, flashcard_back: null, flashcard_note: null,
    importance_score: null, importance_note: null,
    segment_text: null, start_char: null, end_char: null,
  }
  ```

  Also update all inline `PracticeItem` literal objects in the test file to add `importance_score: null, importance_note: null, segment_text: null, start_char: null, end_char: null`.

  Then add new test blocks:

  ```ts
  describe('PracticeList — default filter hides written items', () => {
    const writtenItem: PracticeItem = {
      ...grammarItem, id: 'item-w', written_down: true, original: 'escrito', correction: 'correcto',
    }

    it('hides written items by default', () => {
      render(<PracticeList items={[grammarItem, writtenItem]} />)
      expect(screen.getByText('Yo fui')).toBeInTheDocument()
      expect(screen.queryByText('escrito')).not.toBeInTheDocument()
    })

    it('shows written items when Written filter is active', async () => {
      render(<PracticeList items={[grammarItem, writtenItem]} />)
      await userEvent.click(screen.getByRole('button', { name: /^written$/i }))
      expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
      expect(screen.getByText('escrito')).toBeInTheDocument()
    })

    it('shows all items when All is clicked after Written filter', async () => {
      render(<PracticeList items={[grammarItem, writtenItem]} />)
      await userEvent.click(screen.getByRole('button', { name: /^written$/i }))
      await userEvent.click(screen.getByRole('button', { name: /^all$/i }))
      expect(screen.getByText('Yo fui')).toBeInTheDocument()
      expect(screen.getByText('escrito')).toBeInTheDocument()
    })
  })

  describe('PracticeList — context snippet', () => {
    it('renders context snippet when segment_text is present', () => {
      render(<PracticeList items={[grammarItem]} />)
      // grammarItem has segment_text 'Ayer Yo fui al mercado con ella.' start=6 end=12
      // snippet should contain 'Yo fui'
      expect(screen.getByText(/Yo fui/)).toBeInTheDocument()
    })

    it('does not render snippet when segment_text is null', () => {
      render(<PracticeList items={[subjectiveItem]} />)
      // subjectiveItem has no segment_text — no snippet div
      expect(screen.queryByTestId('context-snippet-item-2')).not.toBeInTheDocument()
    })

    it('renders context snippet in detail modal', async () => {
      render(<PracticeList items={[grammarItem]} />)
      await userEvent.click(screen.getByText('Fui'))
      // Modal should also show the snippet
      expect(screen.getAllByText(/Yo fui/).length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('PracticeList — swipe right animates out (mark written)', () => {
    it('removes item from list after successful mark-written', async () => {
      vi.useFakeTimers()
      global.fetch = vi.fn().mockResolvedValue({ ok: true })
      const onDeleted = vi.fn()
      render(<PracticeList items={[grammarItem]} onDeleted={onDeleted} />)

      const writeButton = screen.getByTestId(`write-item-${grammarItem.id}`)
      await act(async () => {
        fireEvent.click(writeButton)
        await vi.runAllTimersAsync()
      })

      expect(global.fetch).toHaveBeenCalledWith(
        `/api/practice-items/${grammarItem.id}`,
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ written_down: true }) })
      )
      // Item removed from DOM
      expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
      vi.useRealTimers()
    })
  })

  describe('PracticeList — no swipe-left delete', () => {
    it('does not have a swipe-left delete test seam', () => {
      render(<PracticeList items={[grammarItem]} />)
      expect(screen.queryByTestId(`delete-item-${grammarItem.id}`)).not.toBeInTheDocument()
    })
  })
  ```

  Also **update** the existing `PracticeList — written_down status tag` tests: the "not written" and "✓ written" chip is removed. Delete those two tests or change them to verify the chips are gone:

  ```ts
  describe('PracticeList — written_down status chip removed', () => {
    it('does not show "not written" chip on list items', () => {
      render(<PracticeList items={[grammarItem]} />)
      expect(screen.queryByText('not written')).not.toBeInTheDocument()
    })
  })
  ```

  Also **update** `PracticeList — Not written filter pill` tests — that describe block tests the old "Not written" pill. Replace entirely:

  ```ts
  describe('PracticeList — Written filter pill', () => {
    it('shows "Written" pill as second pill after "All"', () => {
      render(<PracticeList items={[grammarItem]} />)
      const buttons = screen.getAllByRole('button')
      const allIdx = buttons.findIndex(b => /^all$/i.test(b.textContent?.trim() ?? ''))
      const writtenIdx = buttons.findIndex(b => /^written$/i.test(b.textContent?.trim() ?? ''))
      expect(allIdx).toBeGreaterThanOrEqual(0)
      expect(writtenIdx).toBe(allIdx + 1)
    })
  })
  ```

  Also **update** the `initialFilterNotWritten` describe block — remove it entirely (prop being removed):

  Delete the entire `describe('PracticeList — initialFilterNotWritten', ...)` block.

  Update the `swipe delete` describe block — the delete test seam is removed, so replace with a note that delete is bulk-only. Remove those two tests and add:

  ```ts
  describe('PracticeList — delete is bulk-only', () => {
    it('delete button appears in bulk toolbar when items selected', async () => {
      render(<PracticeList items={[grammarItem]} />)
      await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
      // Bulk toolbar delete button should be present (aria-label contains "Delete")
      expect(screen.getByRole('button', { name: /delete.*selected/i })).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run tests to verify the new ones fail**

  ```bash
  npm test -- __tests__/components/PracticeList.test.tsx
  ```

  Expected: new tests FAIL; some existing tests may also fail (written chip, old filter pill).

- [ ] **Step 3: Add ContextSnippet helper and update SwipeableItem in PracticeList.tsx**

  At the top of `components/PracticeList.tsx`, add the snippet helper before `SwipeableItem`:

  ```tsx
  const SNIPPET_CONTEXT = 30

  function ContextSnippet({ segmentText, startChar, endChar, testId }: {
    segmentText: string
    startChar: number
    endChar: number
    testId: string
  }) {
    const snippetStart = Math.max(0, startChar - SNIPPET_CONTEXT)
    const snippetEnd = Math.min(segmentText.length, endChar + SNIPPET_CONTEXT)
    const prefix = segmentText.slice(snippetStart, startChar)
    const error = segmentText.slice(startChar, endChar)
    const suffix = segmentText.slice(endChar, snippetEnd)
    return (
      <p
        data-testid={testId}
        className="text-[11px] italic text-text-tertiary border-l-2 border-border pl-2 mt-2 leading-relaxed"
      >
        {snippetStart > 0 && '...'}
        {prefix}
        <span className="not-italic bg-[var(--annotation-unreviewed-bg)] text-[var(--annotation-unreviewed-text)] rounded-sm px-0.5">
          {error}
        </span>
        {suffix}
        {snippetEnd < segmentText.length && '...'}
      </p>
    )
  }
  ```

- [ ] **Step 4: Update SwipeableItem props and implementation**

  Update the `SwipeableItem` props interface — remove `onDelete`, replace with updated `onMarkWritten` (now returns Promise<boolean> and removes item), remove `isWrittenDown` state:

  ```tsx
  function SwipeableItem({
    item,
    isBulkMode,
    isSelected,
    onToggleSelect,
    onMarkWritten,
    onOpen,
  }: {
    item: PracticeItem
    isBulkMode: boolean
    isSelected: boolean
    onToggleSelect: (id: string) => void
    onMarkWritten: (id: string) => Promise<boolean>
    onOpen: (item: PracticeItem) => void
  })
  ```

  Update `triggerMarkWritten` to animate out (slide right + collapse), mirroring `triggerDelete`:

  ```tsx
  async function triggerMarkWritten() {
    if (isAnimating || !rowRef.current) return
    setIsAnimating(true)

    setTranslateX(window.innerWidth)
    const markPromise = onMarkWritten(item.id)

    await new Promise(r => setTimeout(r, 200))
    if (!mountedRef.current) return

    const h = rowRef.current?.offsetHeight ?? 0
    setRowHeight(h)
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    if (!mountedRef.current) return
    setRowHeight(0)

    const [, markResult] = await Promise.allSettled([
      new Promise(r => setTimeout(r, 200)),
      markPromise,
    ])
    if (!mountedRef.current) return

    const succeeded = markResult.status === 'fulfilled' && markResult.value === true
    if (!succeeded) {
      setRowHeight(null)
      setTranslateX(0)
      setIsAnimating(false)
    }
  }
  ```

  Update `handlers` — remove `onSwipedLeft`, keep `onSwipedRight`:

  ```tsx
  const handlers = useSwipeable({
    delta: 10,
    onSwiping: (e) => {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
      if (e.dir === 'Right') setTranslateX(e.absX)
      else setTranslateX(0)
    },
    onSwipedRight: (e) => {
      if (e.absX > 80) triggerMarkWritten()
      else setTranslateX(0)
    },
    trackMouse: false,
  })
  ```

  In the JSX, remove the swipe-left red background div. Remove the hidden delete test seam button. Remove the `isWrittenDown` state variable and the written/not-written chip. Keep the swipe-right (written) background div. Remove the hidden test seam for delete. Keep the hidden test seam for mark-written:

  ```tsx
  return (
    <li
      ref={rowRef}
      className="relative overflow-hidden rounded-xl"
      style={
        rowHeight !== null
          ? { height: rowHeight, transition: 'height 0.2s ease', overflow: 'hidden' }
          : undefined
      }
    >
      {/* Swipe-to-written background */}
      <div className={`absolute inset-0 bg-green-800 flex items-center pl-5 rounded-xl ${translateX <= 0 ? 'invisible' : ''}`}>
        <span className="text-white text-sm font-medium">{t('practiceList.revealWritten')}</span>
      </div>
      {/* Item card */}
      <div
        {...handlers}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating ? 'transform 0.2s ease' : translateX === 0 ? 'transform 0.2s' : 'none',
          userSelect: 'none',
          touchAction: 'pan-y',
        }}
        className="relative flex items-start gap-3 px-4 py-3 bg-surface rounded-xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={() => {
          if (isBulkMode) onToggleSelect(item.id)
          else if (translateX === 0) onOpen(item)
        }}
      >
        {/* Hidden test seam for mark-written */}
        <button
          data-testid={`write-item-${item.id}`}
          className="sr-only"
          onClick={e => { e.stopPropagation(); triggerMarkWritten() }}
          tabIndex={-1}
          aria-hidden="true"
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          inert=""
        />
        {/* Bulk-select checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item.id)}
          onClick={e => e.stopPropagation()}
          className={`w-4 h-4 rounded accent-violet-500 flex-shrink-0 ${isBulkMode ? 'block' : 'hidden sm:block'}`}
          aria-label={t('practiceList.selectItem')}
        />
        <div className="flex-1 min-w-0 text-sm flex flex-col gap-0.5">
          <div>
            <span className="bg-error-surface text-on-error-surface px-1.5 py-0.5 rounded">
              {item.original}
            </span>
            {' → '}
            <span className="font-medium text-correction">{item.correction}</span>
            {(() => {
              const stars = importanceStars(item.importance_score)
              return stars ? <span className="text-amber-400 text-xs ml-1">{stars}</span> : null
            })()}
          </div>
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="border border-accent-chip-border text-on-accent-chip bg-accent-chip rounded-full px-2 py-0.5 text-xs">
              {t(`subCat.${item.sub_category}`)}
            </span>
          </div>
          {item.segment_text !== null && item.start_char !== null && item.end_char !== null && (
            <ContextSnippet
              segmentText={item.segment_text}
              startChar={item.start_char}
              endChar={item.end_char}
              testId={`context-snippet-${item.id}`}
            />
          )}
        </div>
      </div>
    </li>
  )
  ```

- [ ] **Step 5: Update PracticeList state and filter logic**

  Replace the existing `filterNotWritten` state with `writtenFilter`:

  ```tsx
  type WrittenFilter = 'hidden' | 'only' | 'all'
  const [writtenFilter, setWrittenFilter] = useState<WrittenFilter>('hidden')
  ```

  Update `allPillClass`:
  ```tsx
  const allPillClass = writtenFilter === 'all' && subCategoryFilter === null
    ? 'border-violet-500 text-pill-violet bg-violet-500/10'
    : 'border-border text-text-secondary'
  ```

  Update the `filtered` array:
  ```tsx
  const filtered = displayItems.filter(item => {
    if (writtenFilter === 'hidden' && item.written_down) return false
    if (writtenFilter === 'only' && !item.written_down) return false
    if (subCategoryFilter !== null && item.sub_category !== subCategoryFilter) return false
    return true
  })
  ```

  Update `markWritten` to remove item from list on success:
  ```tsx
  async function markWritten(id: string): Promise<boolean> {
    const res = await fetch(`/api/practice-items/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ written_down: true }),
    })
    if (!res.ok) {
      setToastMessage(t('practiceList.markWrittenError'))
      return false
    }
    setDisplayItems(prev => prev.filter(i => i.id !== id))
    return true
  }
  ```

  Remove the `deleteItem` function (delete is now bulk-only via the toolbar).

  Update `SwipeableItem` render call — remove `onDelete`, pass updated `onMarkWritten`:
  ```tsx
  <SwipeableItem
    key={item.id}
    item={item}
    isBulkMode={isBulkMode}
    isSelected={selectedIds.has(item.id)}
    onToggleSelect={handleToggleSelect}
    onMarkWritten={markWritten}
    onOpen={setOpenItem}
  />
  ```

  Update the filter pill row — replace the "Not written" pill with a "Written" pill:
  ```tsx
  <button
    onClick={() => setWrittenFilter(f => f === 'only' ? 'hidden' : 'only')}
    className={`px-3 py-1 rounded-full border transition-colors ${
      writtenFilter === 'only'
        ? 'border-amber-500 text-pill-amber bg-amber-500/10'
        : 'border-pill-inactive-border text-pill-inactive'
    }`}
  >
    {t('practiceList.filterWritten')}
  </button>
  ```

  Update the "All" pill click handler:
  ```tsx
  onClick={() => { setSubCategoryFilter(null); setWrittenFilter('all') }}
  ```

  Remove `initialFilterNotWritten` from `Props` interface and from the component.

  Update the modal for `openItem` to include the context snippet after the sub-category chip:
  ```tsx
  {openItem.segment_text !== null && openItem.start_char !== null && openItem.end_char !== null && (
    <ContextSnippet
      segmentText={openItem.segment_text}
      startChar={openItem.start_char}
      endChar={openItem.end_char}
      testId={`context-snippet-modal-${openItem.id}`}
    />
  )}
  ```

- [ ] **Step 6: Update app/practice/page.tsx**

  Remove the `rawWrittenDown` / `initialFilterNotWritten` logic and the `initialFilterNotWritten` prop from `PracticeList`:

  ```tsx
  // Remove these lines:
  const rawWrittenDown = searchParams.get('written_down')
  const initialFilterNotWritten = rawWrittenDown === 'false'

  // Update the useEffect strip condition:
  useEffect(() => {
    if (rawSubCat) router.replace(pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Remove initialFilterNotWritten from PracticeList:
  <PracticeList
    items={items}
    initialSubCategory={initialSubCategory}
    onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
  />
  ```

- [ ] **Step 7: Run all tests**

  ```bash
  npm test -- __tests__/components/PracticeList.test.tsx
  ```

  Expected: all PASS.

- [ ] **Step 8: Run full test suite**

  ```bash
  npm test
  ```

  Expected: all PASS. Fix any TypeScript errors caught by the build.

- [ ] **Step 9: Commit**

  ```bash
  git add components/PracticeList.tsx app/practice/page.tsx __tests__/components/PracticeList.test.tsx
  git commit -m "feat: context snippets, hidden-by-default written items, animate-out on mark-written, remove swipe-left delete"
  ```

---

## Final check

- [ ] **Run full test suite**

  ```bash
  npm test
  ```

  Expected: all PASS.

- [ ] **Run build to catch type errors**

  ```bash
  npm run build
  ```

  Expected: builds without errors.

- [ ] **Lint**

  ```bash
  npm run lint
  ```

  Expected: no new errors.
