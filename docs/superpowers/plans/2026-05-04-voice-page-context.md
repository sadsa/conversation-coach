# Voice Page Context — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject the user's actual pending corrections (`/write`) and annotated transcript excerpts (`/sessions/[id]`) into the Gemini Live system prompt at voice-connect time, so the coach can discuss them without the user re-explaining.

**Architecture:** A new `lib/voice-context.ts` module holds pure builder functions (`buildSessionContext`, `buildWriteContext`) that transform existing client-state data into a typed `VoicePageContext` payload. Route clients (`WriteClient`, `TranscriptClient`) publish this payload to `window.__ccVoiceContext` on mount (replacing the old `__ccSessionTitle` global). `useVoiceController.start()` reads the global once and passes it through to `connect()`, which passes it to `buildSystemPrompt()` where it renders a structured text block prepended to the agent's context. Everything is pinned at connect time — no mid-session updates.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest + React Testing Library. No new dependencies. Key files: `lib/voice-context.ts` (new), `lib/voice-agent.ts`, `components/VoiceController.tsx`, `components/TranscriptClient.tsx`, `components/WriteClient.tsx`, `types/window.d.ts`.

---

## File Map


| Action     | Path                                               | Purpose                                                                                           |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Create** | `lib/voice-context.ts`                             | `VoicePageContext` types + `buildSessionContext` + `buildWriteContext` + 8000-char cap            |
| **Create** | `__tests__/lib/voice-context.test.ts`              | Unit tests for both builders                                                                      |
| **Modify** | `types/window.d.ts`                                | Replace `__ccSessionTitle` with `__ccVoiceContext: VoicePageContext`                              |
| **Modify** | `lib/voice-agent.ts`                               | Drop `FocusedCorrection`/`items`, add `pageContext` param, update `buildSystemPrompt` + `connect` |
| **Modify** | `__tests__/lib/voice-agent.test.ts`                | Rewrite for new signature; add page-context prompt assertions                                     |
| **Modify** | `components/VoiceController.tsx`                   | Read `__ccVoiceContext` in `start()`, update `connect()` call, update `deriveRouteContext`        |
| **Modify** | `__tests__/components/VoiceController.test.tsx`    | Update mock signatures; add page-context assertions                                               |
| **Modify** | `components/TranscriptClient.tsx`                  | Replace `__ccSessionTitle` effect with `__ccVoiceContext` publish                                 |
| **Modify** | `components/WriteClient.tsx`                       | Add `__ccVoiceContext` publish effect                                                             |
| **Modify** | `__tests__/integration/voice-cross-route.test.tsx` | Update mock for new `connect()` signature                                                         |


---

## Task 1: Types — `lib/voice-context.ts` skeleton + `types/window.d.ts`

**Files:**

- Create: `lib/voice-context.ts`
- Modify: `types/window.d.ts`

No tests yet — this task is pure type definitions that the builder tests in Task 2 depend on.

- **Step 1: Create `lib/voice-context.ts` with types and stubs**

```ts
// lib/voice-context.ts
import type { TranscriptSegment, Annotation, PracticeItem } from '@/lib/types'
import { log } from '@/lib/logger'

export interface SessionExcerpt {
  position: number
  /** Resolved from session.user_speaker_labels at build time. */
  speaker: 'user' | 'other'
  text: string
  /** True iff at least one annotation references this segment. */
  isAnnotated: boolean
}

export interface SessionAnnotation {
  /** Links to SessionExcerpt.position. */
  segmentPosition: number
  type: 'grammar' | 'naturalness'
  original: string
  correction: string | null
  explanation: string
}

export interface WriteContextItem {
  original: string
  correction: string | null
  explanation: string
  /** The full sentence the error appeared in; null for legacy items without annotation_id. */
  segmentText: string | null
  /** Source session title; null only if the session was deleted. */
  sessionTitle: string | null
}

export type VoicePageContext =
  | {
      kind: 'session'
      sessionTitle: string
      excerpts: SessionExcerpt[]
      annotations: SessionAnnotation[]
    }
  | {
      kind: 'write'
      items: WriteContextItem[]
    }

const CAP_CHARS = 8000

export function buildSessionContext(
  _session: { title: string; user_speaker_labels: string[] | null },
  _segments: TranscriptSegment[],
  _annotations: Annotation[]
): VoicePageContext | null {
  throw new Error('not implemented')
}

export function buildWriteContext(
  _items: PracticeItem[]
): VoicePageContext | null {
  throw new Error('not implemented')
}

// Re-export cap so tests can assert against the same value.
export { CAP_CHARS }
```

- **Step 2: Update `types/window.d.ts`** — replace `__ccSessionTitle` with `__ccVoiceContext`

```ts
// types/window.d.ts
import type { VoicePageContext } from '@/lib/voice-context'

declare global {
  interface Window {
    __ccVoiceContext?: VoicePageContext
  }
}

export {}
```

- **Step 3: Commit**

```bash
git add lib/voice-context.ts types/window.d.ts
git commit -m "feat(voice): add VoicePageContext types and window global"
```

---

## Task 2: Implement `buildSessionContext` — TDD

**Files:**

- Create: `__tests__/lib/voice-context.test.ts` (session half)
- Modify: `lib/voice-context.ts`
- **Step 1: Write the failing tests for `buildSessionContext`**

Create `__tests__/lib/voice-context.test.ts`:

```ts
// __tests__/lib/voice-context.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSessionContext, buildWriteContext, CAP_CHARS } from '@/lib/voice-context'
import type { TranscriptSegment, Annotation, PracticeItem } from '@/lib/types'

// --- helpers ---

function seg(position: number, speaker: 'A' | 'B' = 'A', id?: string): TranscriptSegment {
  return {
    id: id ?? `seg-${position}`,
    session_id: 's1',
    speaker,
    text: `Text at position ${position}`,
    start_ms: position * 1000,
    end_ms: (position + 1) * 1000,
    position,
  }
}

function ann(segmentId: string, id?: string): Annotation {
  return {
    id: id ?? `ann-${segmentId}`,
    session_id: 's1',
    segment_id: segmentId,
    type: 'grammar',
    original: 'wrong',
    correction: 'right',
    explanation: 'the reason',
    sub_category: 'other',
    start_char: 0,
    end_char: 5,
    flashcard_front: null,
    flashcard_back: null,
    flashcard_note: null,
    importance_score: null,
    importance_note: null,
    is_unhelpful: false,
    unhelpful_at: null,
  }
}

function item(id: string, overrides: Partial<PracticeItem> = {}): PracticeItem {
  return {
    id,
    session_id: 's1',
    annotation_id: null,
    type: 'grammar',
    original: `original-${id}`,
    correction: `correction-${id}`,
    explanation: `explanation for ${id}`,
    sub_category: 'other',
    reviewed: false,
    written_down: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    flashcard_front: null,
    flashcard_back: null,
    flashcard_note: null,
    importance_score: null,
    importance_note: null,
    segment_text: null,
    start_char: null,
    end_char: null,
    session_title: 'Test Session',
    ...overrides,
  }
}

const session = { title: 'Test Convo', user_speaker_labels: ['A'] as string[] | null }

// --- buildSessionContext ---

describe('buildSessionContext', () => {
  it('returns null when segments is empty', () => {
    expect(buildSessionContext(session, [], [ann('seg-5')])).toBeNull()
  })

  it('returns a session payload with empty excerpts/annotations when there are no annotations', () => {
    const segs = [seg(3), seg(4), seg(5)]
    const result = buildSessionContext(session, segs, [])
    expect(result).not.toBeNull()
    expect(result!.kind).toBe('session')
    if (result!.kind === 'session') {
      expect(result!.sessionTitle).toBe('Test Convo')
      expect(result!.excerpts).toHaveLength(0)
      expect(result!.annotations).toHaveLength(0)
    }
  })

  it('expands a single annotation to ±1 neighbours', () => {
    const segs = [seg(3), seg(4), seg(5), seg(6), seg(7)]
    const result = buildSessionContext(session, segs, [ann('seg-5')])
    expect(result!.kind).toBe('session')
    if (result!.kind === 'session') {
      const positions = result!.excerpts.map(e => e.position).sort((a, b) => a - b)
      expect(positions).toEqual([4, 5, 6])
    }
  })

  it('deduplicates overlapping neighbours for adjacent annotations', () => {
    const segs = [seg(4), seg(5), seg(6), seg(7), seg(8)]
    const annotations = [ann('seg-5', 'ann-a'), ann('seg-6', 'ann-b')]
    const result = buildSessionContext(session, segs, annotations)
    if (result!.kind === 'session') {
      const positions = result!.excerpts.map(e => e.position).sort((a, b) => a - b)
      // 4,5,6 from first + 5,6,7 from second = 4,5,6,7 deduped
      expect(positions).toEqual([4, 5, 6, 7])
    }
  })

  it('does not include position -1 for annotation at position 0', () => {
    const segs = [seg(0), seg(1), seg(2)]
    const result = buildSessionContext(session, segs, [ann('seg-0')])
    if (result!.kind === 'session') {
      const positions = result!.excerpts.map(e => e.position)
      expect(positions).not.toContain(-1)
      expect(positions).toContain(0)
      expect(positions).toContain(1)
    }
  })

  it('does not include a non-existent position after the last segment', () => {
    const segs = [seg(8), seg(9), seg(10)]
    const result = buildSessionContext(session, segs, [ann('seg-10')])
    if (result!.kind === 'session') {
      const positions = result!.excerpts.map(e => e.position)
      expect(positions).not.toContain(11)
      expect(positions).toContain(9)
      expect(positions).toContain(10)
    }
  })

  it('marks the annotated segment with isAnnotated=true, neighbours with false', () => {
    const segs = [seg(4), seg(5), seg(6)]
    const result = buildSessionContext(session, segs, [ann('seg-5')])
    if (result!.kind === 'session') {
      const byPos = Object.fromEntries(result!.excerpts.map(e => [e.position, e]))
      expect(byPos[4].isAnnotated).toBe(false)
      expect(byPos[5].isAnnotated).toBe(true)
      expect(byPos[6].isAnnotated).toBe(false)
    }
  })

  it('resolves speaker A to "user" when user_speaker_labels is ["A"]', () => {
    const segs = [seg(4, 'B'), seg(5, 'A'), seg(6, 'B')]
    const s = { title: 'T', user_speaker_labels: ['A'] }
    const result = buildSessionContext(s, segs, [ann('seg-5')])
    if (result!.kind === 'session') {
      const byPos = Object.fromEntries(result!.excerpts.map(e => [e.position, e]))
      expect(byPos[4].speaker).toBe('other')
      expect(byPos[5].speaker).toBe('user')
      expect(byPos[6].speaker).toBe('other')
    }
  })

  it('maps all segments to "user" when user_speaker_labels is null', () => {
    const segs = [seg(4, 'B'), seg(5, 'A'), seg(6, 'B')]
    const s = { title: 'T', user_speaker_labels: null }
    const result = buildSessionContext(s, segs, [ann('seg-5')])
    if (result!.kind === 'session') {
      result!.excerpts.forEach(e => expect(e.speaker).toBe('user'))
    }
  })

  it('sorts excerpts by position ascending', () => {
    const segs = [seg(3), seg(4), seg(5), seg(6), seg(7)]
    const annotations = [ann('seg-7', 'ann-b'), ann('seg-3', 'ann-a')]
    const result = buildSessionContext(session, segs, annotations)
    if (result!.kind === 'session') {
      const positions = result!.excerpts.map(e => e.position)
      expect(positions).toEqual([...positions].sort((a, b) => a - b))
    }
  })

  it('drops annotations from the end when the prompt block exceeds 8000 chars', () => {
    const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const segs = Array.from({ length: 20 }, (_, i) => ({
      ...seg(i),
      text: 'x'.repeat(500),
    }))
    const annotations = Array.from({ length: 20 }, (_, i) =>
      ann(`seg-${i}`, `ann-${i}`)
    )
    const result = buildSessionContext(session, segs, annotations)
    expect(result!.kind).toBe('session')
    if (result!.kind === 'session') {
      expect(result!.annotations.length).toBeLessThan(20)
    }
    // Assert warn log was emitted
    const loggedLines = warnSpy.mock.calls.map(c => c[0] as string)
    expect(loggedLines.some(l => l.includes('voice-context cap hit'))).toBe(true)
    warnSpy.mockRestore()
  })
})
```

- **Step 2: Run the tests — expect all to fail with "not implemented"**

```bash
npm test -- __tests__/lib/voice-context.test.ts
```

Expected: all `buildSessionContext` tests fail with `Error: not implemented`.

- **Step 3: Implement `buildSessionContext` in `lib/voice-context.ts`**

Replace the stub in `lib/voice-context.ts` (keep all the types and `buildWriteContext` stub):

```ts
export function buildSessionContext(
  session: { title: string; user_speaker_labels: string[] | null },
  segments: TranscriptSegment[],
  annotations: Annotation[]
): VoicePageContext | null {
  if (segments.length === 0) return null

  const segById = new Map(segments.map(s => [s.id, s]))
  const segByPos = new Map(segments.map(s => [s.position, s]))

  // Resolve which positions have at least one annotation.
  const annotatedPositions = new Set<number>()
  for (const a of annotations) {
    const s = segById.get(a.segment_id)
    if (s) annotatedPositions.add(s.position)
  }

  // Expand each annotated position ±1, bounded to segments that exist.
  const expandedPositions = new Set<number>()
  for (const pos of annotatedPositions) {
    if (segByPos.has(pos - 1)) expandedPositions.add(pos - 1)
    expandedPositions.add(pos)
    if (segByPos.has(pos + 1)) expandedPositions.add(pos + 1)
  }

  const userLabels = session.user_speaker_labels

  function makeExcerpts(positions: Set<number>): SessionExcerpt[] {
    return [...positions]
      .sort((a, b) => a - b)
      .map(pos => {
        const s = segByPos.get(pos)!
        return {
          position: pos,
          speaker: userLabels === null || userLabels.includes(s.speaker) ? 'user' : 'other',
          text: s.text,
          isAnnotated: annotatedPositions.has(pos),
        }
      })
  }

  // Build the full annotation list sorted by segment position.
  const allAnnotations: SessionAnnotation[] = annotations
    .map(a => {
      const s = segById.get(a.segment_id)
      return {
        segmentPosition: s?.position ?? 0,
        type: a.type as 'grammar' | 'naturalness',
        original: a.original,
        correction: a.correction,
        explanation: a.explanation,
      }
    })
    .sort((a, b) => a.segmentPosition - b.segmentPosition)

  // Apply the 8000-char cap: drop annotations from the end until under cap.
  function renderBlock(excerpts: SessionExcerpt[], anns: SessionAnnotation[]): string {
    if (excerpts.length === 0) return `The user is reviewing the conversation titled '${session.title}'.`
    const excerptLines = excerpts
      .map(e => `[${e.speaker}, position ${e.position}]: ${e.text}${e.isAnnotated ? '  ← annotated' : ''}`)
      .join('\n')
    const annotationLines = anns
      .map((a, i) => {
        const corrPart = a.correction ? ` → "${a.correction}"` : ''
        return `${i + 1}. On the ${a.type} at position ${a.segmentPosition}: "${a.original}"${corrPart} — ${a.explanation}`
      })
      .join('\n')
    return `The user is reviewing this conversation excerpt:\n${excerptLines}\n\nAnnotations on this excerpt:\n${annotationLines}`
  }

  let kept = allAnnotations
  let keptExcerpts = makeExcerpts(expandedPositions)

  while (kept.length > 0 && renderBlock(keptExcerpts, kept).length > CAP_CHARS) {
    kept = kept.slice(0, -1)
    // Recompute expanded positions from remaining annotations.
    const remainingPositions = new Set(kept.map(a => a.segmentPosition))
    const reExpanded = new Set<number>()
    for (const pos of remainingPositions) {
      if (segByPos.has(pos - 1)) reExpanded.add(pos - 1)
      reExpanded.add(pos)
      if (segByPos.has(pos + 1)) reExpanded.add(pos + 1)
    }
    keptExcerpts = makeExcerpts(reExpanded)
  }

  if (kept.length < allAnnotations.length) {
    log.warn('voice-context cap hit', {
      kind: 'session',
      originalCount: allAnnotations.length,
      keptCount: kept.length,
    })
  }

  return {
    kind: 'session',
    sessionTitle: session.title,
    excerpts: keptExcerpts,
    annotations: kept,
  }
}
```

- **Step 4: Run the `buildSessionContext` tests — expect them to pass**

```bash
npm test -- __tests__/lib/voice-context.test.ts --reporter=verbose
```

Expected: all `buildSessionContext` describe block tests pass. `buildWriteContext` tests will still fail (not yet added).

- **Step 5: Commit**

```bash
git add lib/voice-context.ts __tests__/lib/voice-context.test.ts
git commit -m "feat(voice): implement buildSessionContext with ±1 expansion and cap"
```

---

## Task 3: Implement `buildWriteContext` — TDD

**Files:**

- Modify: `__tests__/lib/voice-context.test.ts` (add write tests)
- Modify: `lib/voice-context.ts`
- **Step 1: Add `buildWriteContext` tests** to the bottom of `__tests__/lib/voice-context.test.ts`

```ts
// --- buildWriteContext ---

describe('buildWriteContext', () => {
  it('returns null for an empty array', () => {
    expect(buildWriteContext([])).toBeNull()
  })

  it('returns null when all items are written_down', () => {
    expect(buildWriteContext([item('a', { written_down: true })])).toBeNull()
  })

  it('returns a write payload with only pending (not written_down) items', () => {
    const items = [
      item('a', { written_down: false }),
      item('b', { written_down: true }),
      item('c', { written_down: false }),
    ]
    const result = buildWriteContext(items)
    expect(result!.kind).toBe('write')
    if (result!.kind === 'write') {
      expect(result!.items).toHaveLength(2)
      expect(result!.items.map(i => i.original)).toEqual(['original-a', 'original-c'])
    }
  })

  it('maps WriteContextItem fields correctly from PracticeItem', () => {
    const src = item('x', {
      original: 'mal',
      correction: 'bien',
      explanation: 'because',
      segment_text: 'Yo dije mal antes.',
      session_title: 'Chat with Ana',
    })
    const result = buildWriteContext([src])
    if (result!.kind === 'write') {
      const ci = result!.items[0]
      expect(ci.original).toBe('mal')
      expect(ci.correction).toBe('bien')
      expect(ci.explanation).toBe('because')
      expect(ci.segmentText).toBe('Yo dije mal antes.')
      expect(ci.sessionTitle).toBe('Chat with Ana')
    }
  })

  it('passes null correction and sessionTitle through', () => {
    const src = item('y', { correction: null, session_title: null })
    const result = buildWriteContext([src])
    if (result!.kind === 'write') {
      expect(result!.items[0].correction).toBeNull()
      expect(result!.items[0].sessionTitle).toBeNull()
    }
  })

  it('drops items from the end when the prompt block exceeds 8000 chars', () => {
    const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const bigItems = Array.from({ length: 30 }, (_, i) =>
      item(`big-${i}`, { explanation: 'e'.repeat(500) })
    )
    const result = buildWriteContext(bigItems)
    expect(result!.kind).toBe('write')
    if (result!.kind === 'write') {
      expect(result!.items.length).toBeLessThan(30)
      // The first item (index 0) is preserved; only tail items are dropped.
      expect(result!.items[0].original).toBe('original-big-0')
    }
    const loggedLines = warnSpy.mock.calls.map(c => c[0] as string)
    expect(loggedLines.some(l => l.includes('voice-context cap hit'))).toBe(true)
    warnSpy.mockRestore()
  })
})
```

- **Step 2: Run the tests — expect `buildWriteContext` tests to fail with "not implemented"**

```bash
npm test -- __tests__/lib/voice-context.test.ts
```

- **Step 3: Implement `buildWriteContext` in `lib/voice-context.ts`**

Replace the `buildWriteContext` stub:

```ts
export function buildWriteContext(
  items: PracticeItem[]
): VoicePageContext | null {
  const pending = items.filter(i => !i.written_down)
  if (pending.length === 0) return null

  const contextItems: WriteContextItem[] = pending.map(i => ({
    original: i.original,
    correction: i.correction,
    explanation: i.explanation,
    segmentText: i.segment_text,
    sessionTitle: i.session_title,
  }))

  function renderWriteBlock(list: WriteContextItem[]): string {
    return `Pending corrections the user has saved:\n${list
      .map((ci, idx) => {
        const corrPart = ci.correction ? ` → "${ci.correction}"` : ''
        const fromPart = ci.sessionTitle ? ` (from "${ci.sessionTitle}")` : ''
        return `${idx + 1}. "${ci.original}"${corrPart} — ${ci.explanation}${fromPart}`
      })
      .join('\n')}`
  }

  let kept = contextItems
  while (kept.length > 1 && renderWriteBlock(kept).length > CAP_CHARS) {
    kept = kept.slice(0, -1)
  }

  if (kept.length < contextItems.length) {
    log.warn('voice-context cap hit', {
      kind: 'write',
      originalCount: contextItems.length,
      keptCount: kept.length,
    })
  }

  return { kind: 'write', items: kept }
}
```

- **Step 4: Run all `voice-context` tests — expect full pass**

```bash
npm test -- __tests__/lib/voice-context.test.ts --reporter=verbose
```

Expected: all tests in both `buildSessionContext` and `buildWriteContext` describe blocks pass.

- **Step 5: Commit**

```bash
git add lib/voice-context.ts __tests__/lib/voice-context.test.ts
git commit -m "feat(voice): implement buildWriteContext with cap"
```

---

## Task 4: Update `lib/voice-agent.ts` — drop `items`, add `pageContext`

**Files:**

- Modify: `lib/voice-agent.ts`
- Modify: `__tests__/lib/voice-agent.test.ts`

The existing `buildSystemPrompt` and `connect()` signatures change:

- **Before:** `buildSystemPrompt(targetLanguage, items: FocusedCorrection[], routeContext?)`
- **After:** `buildSystemPrompt(targetLanguage, routeContext, pageContext?)`
- **Before:** `connect(targetLanguage, items, callbacks, routeContext?)`
- **After:** `connect(targetLanguage, callbacks, routeContext?, pageContext?)`
- **Step 1: Rewrite `__tests__/lib/voice-agent.test.ts`** to cover the new signature and page-context rendering

Replace the entire file:

```ts
// __tests__/lib/voice-agent.test.ts
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '@/lib/voice-agent'
import type { VoicePageContext } from '@/lib/voice-context'

const writeContext: VoicePageContext = {
  kind: 'write',
  items: [
    { original: 'fui', correction: 'anduve', explanation: '"Andar" for movement.', segmentText: null, sessionTitle: 'Café con Mati' },
    { original: 'tengo calor', correction: 'hace calor', explanation: 'Impersonal weather expression.', segmentText: 'Hoy tengo calor.', sessionTitle: 'Clase de español' },
  ],
}

const sessionContext: VoicePageContext = {
  kind: 'session',
  sessionTitle: 'Cena con Marcela',
  excerpts: [
    { position: 4, speaker: 'other', text: '¿Qué querés tomar?', isAnnotated: false },
    { position: 5, speaker: 'user', text: 'Yo quiero agua.', isAnnotated: true },
    { position: 6, speaker: 'other', text: 'Perfecto.', isAnnotated: false },
  ],
  annotations: [
    { segmentPosition: 5, type: 'grammar', original: 'Yo quiero', correction: 'Quiero', explanation: 'Drop pronoun in Rioplatense.' },
  ],
}

const emptySessionContext: VoicePageContext = {
  kind: 'session',
  sessionTitle: 'Clase corta',
  excerpts: [],
  annotations: [],
}

describe('buildSystemPrompt', () => {
  // --- language block ---

  it('includes Rioplatense instructions for es-AR', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'other' })
    expect(prompt).toContain('Rioplatense')
    expect(prompt).toContain('voseo')
    expect(prompt).toContain('Argentine Spanish')
  })

  it('includes Kiwi instructions for en-NZ', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'other' })
    expect(prompt).toContain('New Zealand')
    expect(prompt).toContain('Kiwi')
  })

  // --- route hint ---

  it('appends a Write-list hint (es-AR) when routeContext.kind is "write"', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'write' })
    expect(prompt).toContain('lista de cosas para escribir')
  })

  it('appends a Write-list hint (en-NZ) when routeContext.kind is "write"', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'write' })
    expect(prompt).toContain('Write list')
    expect(prompt).toContain('saved corrections')
  })

  it('appends a session-review hint (es-AR) when routeContext.kind is "session"', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'session', sessionTitle: 'Café con Mati' })
    expect(prompt).toContain("'Café con Mati'")
    expect(prompt).toContain('repasando')
  })

  it('appends a session-review hint (en-NZ) when routeContext.kind is "session"', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'session', sessionTitle: 'Coffee with Mati' })
    expect(prompt).toContain("'Coffee with Mati'")
    expect(prompt).toContain('reviewing')
  })

  it('strips apostrophes from session titles in the route hint', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'session', sessionTitle: "Lucia's birthday" })
    expect(prompt).toContain("'Lucias birthday'")
    expect(prompt).not.toContain("'Lucia's birthday'")
  })

  it('appends no route hint when routeContext.kind is "other"', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'other' })
    expect(prompt).not.toContain('Write list')
    expect(prompt).not.toContain('lista de cosas')
    expect(prompt).not.toContain('repasando')
    expect(prompt).not.toContain('reviewing')
  })

  // --- page-context block: write ---

  it('renders the write corrections block when pageContext is kind=write', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'write' }, writeContext)
    expect(prompt).toContain('Pending corrections the user has saved:')
    expect(prompt).toContain('"fui" → "anduve"')
    expect(prompt).toContain('"Andar" for movement.')
    expect(prompt).toContain('(from "Café con Mati")')
    expect(prompt).toContain('"tengo calor" → "hace calor"')
  })

  it('omits the (from "…") part when sessionTitle is null', () => {
    const ctx: VoicePageContext = {
      kind: 'write',
      items: [{ original: 'x', correction: 'y', explanation: 'z', segmentText: null, sessionTitle: null }],
    }
    const prompt = buildSystemPrompt('en-NZ', { kind: 'other' }, ctx)
    expect(prompt).not.toContain('from "')
  })

  it('renders correction as original when correction is null (write context)', () => {
    const ctx: VoicePageContext = {
      kind: 'write',
      items: [{ original: 'x', correction: null, explanation: 'z', segmentText: null, sessionTitle: null }],
    }
    const prompt = buildSystemPrompt('en-NZ', { kind: 'other' }, ctx)
    // No " → " arrow when correction is null
    expect(prompt).not.toContain(' → ')
    expect(prompt).toContain('"x"')
  })

  // --- page-context block: session ---

  it('renders the transcript excerpt block when pageContext is kind=session', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'session', sessionTitle: 'Cena con Marcela' }, sessionContext)
    expect(prompt).toContain('The user is reviewing this conversation excerpt:')
    expect(prompt).toContain('[user, position 5]: Yo quiero agua.  ← annotated')
    expect(prompt).toContain('[other, position 4]: ¿Qué querés tomar?')
    expect(prompt).toContain('Annotations on this excerpt:')
    expect(prompt).toContain('"Yo quiero" → "Quiero"')
    expect(prompt).toContain('Drop pronoun in Rioplatense.')
  })

  it('collapses to a single title line when excerpts is empty', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'other' }, emptySessionContext)
    expect(prompt).toContain("The user is reviewing the conversation titled 'Clase corta'.")
    expect(prompt).not.toContain('Annotations on this excerpt:')
  })

  // --- opening guidance ---

  it('uses "greet briefly" guidance when pageContext is absent', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'other' })
    expect(prompt).toContain('Greet them briefly and ask how you can help')
  })

  it('uses "greet briefly" guidance even on the write route when pageContext is absent', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'write' })
    expect(prompt).toContain('Greet them briefly and ask how you can help')
  })

  it('uses the deixis guidance when pageContext is present', () => {
    const prompt = buildSystemPrompt('es-AR', { kind: 'write' }, writeContext)
    expect(prompt).toContain('may refer to these by deixis')
    expect(prompt).toContain('Be brief')
    expect(prompt).not.toContain('Greet them briefly')
  })

  it('uses the deixis guidance for session context too', () => {
    const prompt = buildSystemPrompt('en-NZ', { kind: 'session', sessionTitle: 'T' }, sessionContext)
    expect(prompt).toContain('may refer to these by deixis')
  })

  // --- page-context is independent of target language ---

  it('renders the same page-context block for both target languages', () => {
    const esPrompt = buildSystemPrompt('es-AR', { kind: 'write' }, writeContext)
    const enPrompt = buildSystemPrompt('en-NZ', { kind: 'write' }, writeContext)
    // Both contain the (English) structural label
    expect(esPrompt).toContain('Pending corrections the user has saved:')
    expect(enPrompt).toContain('Pending corrections the user has saved:')
    // Both contain the same item content
    expect(esPrompt).toContain('"fui" → "anduve"')
    expect(enPrompt).toContain('"fui" → "anduve"')
  })
})
```

- **Step 2: Run the tests — expect failures because `buildSystemPrompt` still takes `items`**

```bash
npm test -- __tests__/lib/voice-agent.test.ts
```

Expected: TypeScript errors and test failures.

- **Step 3: Update `lib/voice-agent.ts`** — drop `FocusedCorrection`, update signatures and prompt body

Replace the entire `lib/voice-agent.ts` file content. Key changes:

1. Remove `FocusedCorrection` interface.
2. `buildSystemPrompt(targetLanguage, routeContext, pageContext?)` — new signature.
3. `connect(targetLanguage, callbacks, routeContext?, pageContext?)` — new signature.

```ts
// lib/voice-agent.ts

import type { TargetLanguage } from '@/lib/types'
import type { VoicePageContext } from '@/lib/voice-context'

export type VoiceRouteContext =
  | { kind: 'write' }
  | { kind: 'session'; sessionTitle: string }
  | { kind: 'other' }

export type VoiceAgentState = 'connecting' | 'active' | 'ended'

export interface VoiceAgentCallbacks {
  onStateChange: (state: VoiceAgentState) => void
  onError: (message: string) => void
  onUserAudio?: (rms: number) => void
  onAgentAudio?: (rms: number) => void
}

/** Compute normalised RMS (0..1) over a PCM16 sample buffer. */
function pcm16Rms(samples: Int16Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] / 32768
    sum += s * s
  }
  return Math.sqrt(sum / samples.length)
}

function playStartTone(ctx: AudioContext) {
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = 0.18
  master.connect(ctx.destination)

  function note(freq: number, startOffset: number, duration: number) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const gain = ctx.createGain()
    const start = now + startOffset
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(1, start + 0.014)
    gain.gain.linearRampToValueAtTime(0, start + duration)
    osc.connect(gain)
    gain.connect(master)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  note(523.25, 0, 0.1)
  note(783.99, 0.06, 0.14)
}

export interface VoiceAgent {
  setMuted: (muted: boolean) => void
  disconnect: () => void
}

const WS_ENDPOINT =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent'

const DEFAULT_VOICE = 'Aoede'

/** Pure function — builds the system prompt injected on connect. */
export function buildSystemPrompt(
  targetLanguage: TargetLanguage,
  routeContext: VoiceRouteContext = { kind: 'other' },
  pageContext?: VoicePageContext
): string {
  const isEsAR = targetLanguage === 'es-AR'

  const languageBlock = isEsAR
    ? `You are a Rioplatense Argentine Spanish coach.\nSpeak exclusively in Argentine Spanish with a Rioplatense accent.\nUse voseo verb forms and natural everyday Rioplatense vocabulary.`
    : `You are a New Zealand English coach.\nSpeak exclusively in New Zealand English with a Kiwi accent and idioms.`

  const routeHint = (() => {
    if (routeContext.kind === 'write') {
      return isEsAR
        ? `\n\nEl usuario está mirando su lista de cosas para escribir — correcciones que quiere internalizar.`
        : `\n\nThe user is currently looking at their Write list — saved corrections they want to internalise.`
    }
    if (routeContext.kind === 'session') {
      const safeTitle = routeContext.sessionTitle.replace(/'/g, '')
      return isEsAR
        ? `\n\nEl usuario está repasando la conversación titulada '${safeTitle}'.`
        : `\n\nThe user is currently reviewing the conversation titled '${safeTitle}'.`
    }
    return ''
  })()

  const pageContextBlock = (() => {
    if (!pageContext) return ''

    if (pageContext.kind === 'write') {
      const lines = pageContext.items
        .map((item, i) => {
          const corrPart = item.correction ? ` → "${item.correction}"` : ''
          const fromPart = item.sessionTitle ? ` (from "${item.sessionTitle}")` : ''
          return `${i + 1}. "${item.original}"${corrPart} — ${item.explanation}${fromPart}`
        })
        .join('\n')
      return `\n\nPending corrections the user has saved:\n${lines}`
    }

    if (pageContext.kind === 'session') {
      if (pageContext.excerpts.length === 0) {
        const safeTitle = pageContext.sessionTitle.replace(/'/g, '')
        return `\n\nThe user is reviewing the conversation titled '${safeTitle}'.`
      }
      const excerptLines = pageContext.excerpts
        .map(e => `[${e.speaker}, position ${e.position}]: ${e.text}${e.isAnnotated ? '  ← annotated' : ''}`)
        .join('\n')
      const annotationLines = pageContext.annotations
        .map((a, i) => {
          const corrPart = a.correction ? ` → "${a.correction}"` : ''
          return `${i + 1}. On the ${a.type} at position ${a.segmentPosition}: "${a.original}"${corrPart} — ${a.explanation}`
        })
        .join('\n')
      return `\n\nThe user is reviewing this conversation excerpt:\n${excerptLines}\n\nAnnotations on this excerpt:\n${annotationLines}`
    }

    return ''
  })()

  const openingGuidance = pageContext
    ? `\n\nThe user may refer to these by deixis ("this one", "the third", "the part about …"). When they do, anchor your answer to the specific item. Otherwise stay free-form. Be brief — one or two sentences, then wait for the user to respond.`
    : `\n\nThe user has not given you a specific topic. Greet them briefly and ask how you can help.`

  return `${languageBlock}${routeHint}${pageContextBlock}${openingGuidance}`
}

/**
 * Opens a real-time voice session with the Gemini Multimodal Live API.
 */
export async function connect(
  targetLanguage: TargetLanguage,
  callbacks: VoiceAgentCallbacks,
  routeContext: VoiceRouteContext = { kind: 'other' },
  pageContext?: VoicePageContext
): Promise<VoiceAgent> {
  const tokenRes = await fetch('/api/voice-token')
  if (!tokenRes.ok) throw new Error('Failed to get voice token')
  const { token } = (await tokenRes.json()) as { token: string }

  let audioCtx: AudioContext | undefined
  let stream: MediaStream | undefined

  try {
    audioCtx = new AudioContext({ sampleRate: 16000 })
    await audioCtx.audioWorklet.addModule('/pcm-processor.js')
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, sampleRate: 16000 },
    })
  } catch (err) {
    stream?.getTracks().forEach(t => t.stop())
    await audioCtx?.close()
    throw err
  }

  const safeCtx = audioCtx as AudioContext
  const safeStream = stream as MediaStream
  const [audioTrack] = safeStream.getAudioTracks()

  const source = safeCtx.createMediaStreamSource(safeStream)
  const worklet = new AudioWorkletNode(safeCtx, 'pcm-processor')
  source.connect(worklet)
  worklet.connect(safeCtx.destination)

  const wsUrl = new URL(WS_ENDPOINT)
  wsUrl.searchParams.set('key', token)
  const ws = new WebSocket(wsUrl.toString())
  ws.binaryType = 'arraybuffer'

  let ready = false
  let playbackTime = safeCtx.currentTime
  const voiceName = process.env.NEXT_PUBLIC_GOOGLE_VOICE ?? DEFAULT_VOICE
  const activeAgentSources = new Set<AudioBufferSourceNode>()

  function stopAgentPlayback() {
    activeAgentSources.forEach(src => {
      try { src.stop() } catch { /* already stopped */ }
    })
    activeAgentSources.clear()
    playbackTime = safeCtx.currentTime
    callbacks.onAgentAudio?.(0)
  }

  function scheduleAgentPcm(pcm16: Int16Array) {
    const float32 = new Float32Array(pcm16.length)
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768
    const buffer = safeCtx.createBuffer(1, float32.length, 24000)
    buffer.getChannelData(0).set(float32)
    const src = safeCtx.createBufferSource()
    src.buffer = buffer
    src.connect(safeCtx.destination)
    src.onended = () => { activeAgentSources.delete(src) }
    const now = safeCtx.currentTime
    playbackTime = Math.max(playbackTime, now)
    const startAt = playbackTime
    activeAgentSources.add(src)
    src.start(startAt)
    playbackTime += buffer.duration

    if (callbacks.onAgentAudio) {
      const rms = pcm16Rms(pcm16)
      const delayMs = Math.max(0, (startAt - now) * 1000)
      window.setTimeout(() => callbacks.onAgentAudio?.(rms), delayMs)
    }
  }

  worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (!ready || ws.readyState !== WebSocket.OPEN) return
    const bytes = new Uint8Array(e.data)
    if (callbacks.onUserAudio) {
      const samples = new Int16Array(e.data.slice(0))
      callbacks.onUserAudio(pcm16Rms(samples))
    }
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const b64 = btoa(binary)
    ws.send(
      JSON.stringify({
        realtime_input: {
          audio: { data: b64, mimeType: 'audio/pcm;rate=16000' },
        },
      })
    )
  }

  ws.addEventListener('open', () => {
    callbacks.onStateChange('connecting')
    ws.send(
      JSON.stringify({
        setup: {
          model: 'models/gemini-3.1-flash-live-preview',
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
          systemInstruction: {
            parts: [{ text: buildSystemPrompt(targetLanguage, routeContext, pageContext) }],
          },
        },
      })
    )
  })

  ws.addEventListener('message', (event: MessageEvent) => {
    let msg: Record<string, unknown> | null = null
    if (event.data instanceof ArrayBuffer) {
      try {
        msg = JSON.parse(new TextDecoder().decode(event.data)) as Record<string, unknown>
      } catch {
        const pcm16 = new Int16Array(event.data)
        scheduleAgentPcm(pcm16)
        return
      }
    } else {
      msg = JSON.parse(event.data as string) as Record<string, unknown>
    }

    if ('setupComplete' in msg) {
      ready = true
      try { playStartTone(safeCtx) } catch { /* non-fatal */ }
      callbacks.onStateChange('active')
      return
    }

    const serverContent = (msg as { serverContent?: {
      interrupted?: boolean
      modelTurn?: { parts: Array<{ inlineData?: { mimeType: string; data: string } }> }
    } }).serverContent

    if (serverContent?.interrupted) {
      stopAgentPlayback()
      return
    }

    if (serverContent?.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (!part.inlineData?.data) continue
        const raw = atob(part.inlineData.data)
        const pcm16 = new Int16Array(raw.length / 2)
        for (let i = 0; i < pcm16.length; i++) {
          pcm16[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)
        }
        scheduleAgentPcm(pcm16)
      }
    }

    const error = (msg as { error?: { message?: string } }).error
    if (error) {
      callbacks.onError(error.message ?? 'Voice session error')
    }
  })

  ws.addEventListener('close', () => {
    ready = false
    callbacks.onStateChange('ended')
    safeCtx.close()
    safeStream.getTracks().forEach(t => t.stop())
  })

  ws.addEventListener('error', () => {
    callbacks.onError('Connection error')
  })

  return {
    setMuted(muted) {
      audioTrack.enabled = !muted
    },
    disconnect() {
      if (ws.readyState !== WebSocket.CLOSED) ws.close()
    },
  }
}
```

- **Step 4: Run the voice-agent tests — expect full pass**

```bash
npm test -- __tests__/lib/voice-agent.test.ts --reporter=verbose
```

Expected: all tests pass. TypeScript compilation clean.

- **Step 5: Run the full test suite to check for breakage**

```bash
npm test
```

Expected: `VoiceController.test.tsx` and `voice-cross-route.test.tsx` will now fail because their `connect()` mock uses the old `(_l, _i, callbacks)` signature. That is expected and will be fixed in Task 5 and Task 8.

- **Step 6: Commit**

```bash
git add lib/voice-agent.ts __tests__/lib/voice-agent.test.ts
git commit -m "feat(voice): drop items param, add pageContext to buildSystemPrompt and connect"
```

---

## Task 5: Update `VoiceController.tsx` + tests

**Files:**

- Modify: `components/VoiceController.tsx`
- Modify: `__tests__/components/VoiceController.test.tsx`

`deriveRouteContext` currently reads `window.__ccSessionTitle`. It now reads from `window.__ccVoiceContext`. The session title for the route hint comes from `__ccVoiceContext.sessionTitle` when the page is a session page.

- **Step 1: Update `__tests__/components/VoiceController.test.tsx`**

Three changes:

1. `beforeEach` — clear `window.__ccVoiceContext` instead of `__ccSessionTitle`.
2. Mock call signatures — `connect` now takes `(_l, callbacks, _ctx, _pageCtx)` instead of `(_l, _i, callbacks, _ctx)`.
3. The routeContext session test — set `window.__ccVoiceContext` of kind `'session'` instead of `__ccSessionTitle`.
4. Add two new tests for page-context passing.

Replace the file:

```ts
// __tests__/components/VoiceController.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { LanguageProvider } from '@/components/LanguageProvider'
import { useVoiceController } from '@/components/VoiceController'
import type { VoicePageContext } from '@/lib/voice-context'

vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(),
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}))

const navState = vi.hoisted(() => ({ pathname: '/write' as string }))

vi.mock('next/navigation', () => ({
  usePathname: () => navState.pathname,
}))

const mockConnect = (await import('@/lib/voice-agent')).connect as ReturnType<typeof vi.fn>

;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}) as unknown as MediaQueryList

function wrapper({ children }: { children: React.ReactNode }) {
  return <LanguageProvider initialTargetLanguage="es-AR">{children}</LanguageProvider>
}

describe('useVoiceController', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useRealTimers()
    navState.pathname = '/write'
    delete (window as unknown as { __ccVoiceContext?: VoicePageContext }).__ccVoiceContext
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    expect(result.current.state).toBe('idle')
  })

  it('transitions idle → connecting → active', async () => {
    let cb: Parameters<typeof mockConnect>[1]
    mockConnect.mockImplementation((_l, callbacks) => {
      cb = callbacks
      return Promise.resolve({ setMuted: vi.fn(), disconnect: vi.fn() })
    })
    const { result } = renderHook(() => useVoiceController(), { wrapper })

    await act(async () => { result.current.start() })
    expect(result.current.state).toBe('connecting')

    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce())
    act(() => { cb!.onStateChange('active') })
    expect(result.current.state).toBe('active')
  })

  it('passes routeContext "write" when pathname starts with /write', async () => {
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    expect(mockConnect).toHaveBeenCalledWith(
      'es-AR',
      expect.any(Object),
      { kind: 'write' },
      undefined
    )
  })

  it('passes routeContext "session" and pageContext when on /sessions/[id] with __ccVoiceContext of kind session', async () => {
    navState.pathname = '/sessions/abc-123'
    const ctx: VoicePageContext = {
      kind: 'session',
      sessionTitle: 'Café con Mati',
      excerpts: [],
      annotations: [],
    }
    ;(window as unknown as { __ccVoiceContext?: VoicePageContext }).__ccVoiceContext = ctx
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })

    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    expect(mockConnect).toHaveBeenCalledWith(
      'es-AR',
      expect.any(Object),
      { kind: 'session', sessionTitle: 'Café con Mati' },
      ctx
    )
  })

  it('passes write pageContext when on /write with __ccVoiceContext of kind write', async () => {
    navState.pathname = '/write'
    const ctx: VoicePageContext = {
      kind: 'write',
      items: [{ original: 'fui', correction: 'anduve', explanation: 'reason', segmentText: null, sessionTitle: null }],
    }
    ;(window as unknown as { __ccVoiceContext?: VoicePageContext }).__ccVoiceContext = ctx
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })

    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    expect(mockConnect).toHaveBeenCalledWith(
      'es-AR',
      expect.any(Object),
      { kind: 'write' },
      ctx
    )
  })

  it('passes undefined pageContext when __ccVoiceContext is not set', async () => {
    navState.pathname = '/'
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })

    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    const call = mockConnect.mock.calls[0]
    expect(call[3]).toBeUndefined()
  })

  it('does not update the agent after connect even if __ccVoiceContext changes (pin-at-connect)', async () => {
    const ctx: VoicePageContext = { kind: 'write', items: [{ original: 'x', correction: 'y', explanation: 'z', segmentText: null, sessionTitle: null }] }
    ;(window as unknown as { __ccVoiceContext?: VoicePageContext }).__ccVoiceContext = ctx
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })

    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce())

    // Mutate the global after connect.
    delete (window as unknown as { __ccVoiceContext?: VoicePageContext }).__ccVoiceContext

    // A re-render does not trigger another connect().
    expect(mockConnect).toHaveBeenCalledOnce()
  })

  it('disconnects on unmount', async () => {
    const disconnect = vi.fn()
    let cb: Parameters<typeof mockConnect>[1]
    mockConnect.mockImplementation((_l, callbacks) => {
      cb = callbacks
      return Promise.resolve({ setMuted: vi.fn(), disconnect })
    })
    const { result, unmount } = renderHook(() => useVoiceController(), { wrapper })

    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())
    act(() => { cb!.onStateChange('active') })

    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('disconnects the agent if unmounted mid-connect', async () => {
    const disconnect = vi.fn()
    let resolveConnect: (a: unknown) => void = () => {}
    mockConnect.mockImplementation(() => new Promise((r) => { resolveConnect = r }))
    const { result, unmount } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    unmount()
    await act(async () => { resolveConnect({ setMuted: vi.fn(), disconnect }) })
    await waitFor(() => expect(disconnect).toHaveBeenCalledOnce())
  })

  it('returns to idle when permission is denied (toast NOT retryable)', async () => {
    mockConnect.mockRejectedValue(new Error('Permission denied by user'))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.toast?.message).toMatch(/microphone/i)
    expect(result.current.toast?.retryable).toBe(false)
  })

  it('marks generic transport errors as retryable', async () => {
    mockConnect.mockRejectedValue(new Error('Network failure'))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.toast?.message).toMatch(/voice session ended/i)
    expect(result.current.toast?.retryable).toBe(true)
  })

  it('start() is a no-op when already connecting', async () => {
    let resolveConnect: (a: unknown) => void = () => {}
    mockConnect.mockImplementation(() => new Promise((r) => { resolveConnect = r }))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await act(async () => { result.current.start() })
    expect(mockConnect).toHaveBeenCalledOnce()
    resolveConnect({ setMuted: vi.fn(), disconnect: vi.fn() })
  })

  it('toastKey increments when a toast is shown', async () => {
    mockConnect.mockRejectedValue(new Error('Permission denied'))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    const initialKey = result.current.toastKey
    await act(async () => { result.current.start() })
    await waitFor(() => expect(result.current.toast).toBeTruthy())
    expect(result.current.toastKey).toBeGreaterThan(initialKey)
  })

  it('survives React Strict Mode mount/unmount/remount cycle', async () => {
    const disconnect = vi.fn()
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect })

    function strictWrapper({ children }: { children: React.ReactNode }) {
      return (
        <StrictMode>
          <LanguageProvider initialTargetLanguage="es-AR">{children}</LanguageProvider>
        </StrictMode>
      )
    }

    const { result } = renderHook(() => useVoiceController(), { wrapper: strictWrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    expect(disconnect).not.toHaveBeenCalled()
  })

  it('mutes and unmutes', async () => {
    const setMuted = vi.fn()
    let cb: Parameters<typeof mockConnect>[1]
    mockConnect.mockImplementation((_l, callbacks) => {
      cb = callbacks
      return Promise.resolve({ setMuted, disconnect: vi.fn() })
    })
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())
    act(() => { cb!.onStateChange('active') })

    act(() => { result.current.toggleMute() })
    expect(result.current.state).toBe('muted')
    expect(setMuted).toHaveBeenCalledWith(true)

    act(() => { result.current.toggleMute() })
    expect(result.current.state).toBe('active')
    expect(setMuted).toHaveBeenLastCalledWith(false)
  })
})
```

- **Step 2: Run the controller tests — expect them to fail (controller still uses old signature)**

```bash
npm test -- __tests__/components/VoiceController.test.tsx
```

- **Step 3: Update `components/VoiceController.tsx`**

Two changes:

1. `deriveRouteContext` reads from `window.__ccVoiceContext` instead of `window.__ccSessionTitle`.
2. `start()` reads `window.__ccVoiceContext` once and passes it as `pageContext` to `connect()`.
3. `connect()` call drops the `[]` items arg.

Replace the entire file:

```ts
// components/VoiceController.tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { connect } from '@/lib/voice-agent'
import type { VoiceAgent, VoiceAgentState, VoiceRouteContext } from '@/lib/voice-agent'
import type { VoicePageContext } from '@/lib/voice-context'

const RMS_DECAY = 0.85
const RMS_FLOOR = 0.004
const SCALE_GAIN = 5
const SCALE_MAX = 0.45

export type VoiceControllerState = 'idle' | 'connecting' | 'active' | 'muted'

export interface VoiceToast {
  message: string
  retryable?: boolean
}

export interface VoiceController {
  state: VoiceControllerState
  toast: VoiceToast | null
  toastKey: number
  indicatorRef: React.RefObject<HTMLDivElement>
  start: () => void
  toggleMute: () => void
  end: () => void
}

function deriveRouteContext(pathname: string | null, voiceContext?: VoicePageContext): VoiceRouteContext {
  if (!pathname) return { kind: 'other' }
  if (pathname.startsWith('/write')) return { kind: 'write' }
  if (pathname.startsWith('/sessions/') && voiceContext?.kind === 'session') {
    return { kind: 'session', sessionTitle: voiceContext.sessionTitle }
  }
  return { kind: 'other' }
}

export function useVoiceController(): VoiceController {
  const { t, targetLanguage } = useTranslation()
  const pathname = usePathname()
  const [state, setState] = useState<VoiceControllerState>('idle')
  const [toast, setToast] = useState<VoiceToast | null>(null)
  const [toastKey, setToastKey] = useState(0)

  const agentRef = useRef<VoiceAgent | null>(null)
  const userRmsRef = useRef(0)
  const agentRmsRef = useRef(0)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)
  const startingRef = useRef(false)

  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  const showToast = useCallback((message: string, retryable: boolean = false) => {
    if (!isMountedRef.current) return
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ message, retryable })
    setToastKey(k => k + 1)
    toastTimerRef.current = window.setTimeout(() => {
      if (!isMountedRef.current) return
      setToast(null)
      toastTimerRef.current = null
    }, retryable ? 8000 : 4000)
  }, [])

  const start = useCallback(async () => {
    if (startingRef.current || state !== 'idle') return
    startingRef.current = true
    setState('connecting')

    // Read page context once at connect time — pinned for the session lifetime.
    const pageContext = typeof window !== 'undefined' ? window.__ccVoiceContext : undefined
    const routeContext = deriveRouteContext(pathname, pageContext)

    try {
      const agent = await connect(
        targetLanguage,
        {
          onStateChange: (s: VoiceAgentState) => {
            if (!isMountedRef.current) return
            if (s === 'active') setState('active')
            else if (s === 'ended') {
              setState('idle')
              agentRef.current = null
            }
          },
          onError: (message: string) => {
            if (!isMountedRef.current) return
            setState('idle')
            agentRef.current = null
            if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
              showToast(tRef.current('voice.micPermission'))
            } else {
              showToast(tRef.current('voice.sessionEnded'), true)
            }
          },
          onUserAudio: (rms) => { userRmsRef.current = Math.max(userRmsRef.current, rms) },
          onAgentAudio: (rms) => { agentRmsRef.current = Math.max(agentRmsRef.current, rms) },
        },
        routeContext,
        pageContext
      )
      if (!isMountedRef.current) {
        agent.disconnect()
        return
      }
      agentRef.current = agent
    } catch (err) {
      if (!isMountedRef.current) return
      setState('idle')
      const message = err instanceof Error ? err.message : ''
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
        showToast(tRef.current('voice.micPermission'))
      } else {
        showToast(tRef.current('voice.sessionEnded'), true)
      }
    } finally {
      startingRef.current = false
    }
  }, [state, targetLanguage, pathname, showToast])

  const end = useCallback(() => {
    agentRef.current?.disconnect()
  }, [])

  const toggleMute = useCallback(() => {
    if (!agentRef.current) return
    if (state === 'muted') {
      agentRef.current.setMuted(false)
      setState('active')
    } else if (state === 'active') {
      agentRef.current.setMuted(true)
      setState('muted')
    }
  }, [state])

  const endRef = useRef(end)
  const toggleMuteRef = useRef(toggleMute)
  useEffect(() => { endRef.current = end }, [end])
  useEffect(() => { toggleMuteRef.current = toggleMute }, [toggleMute])

  useEffect(() => {
    if (state !== 'active' && state !== 'muted') return
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        endRef.current()
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        toggleMuteRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  useEffect(() => {
    if (state !== 'active' && state !== 'muted') {
      userRmsRef.current = 0
      agentRmsRef.current = 0
      return
    }
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function tick() {
      const u = userRmsRef.current
      const a = agentRmsRef.current
      userRmsRef.current = u * RMS_DECAY
      agentRmsRef.current = a * RMS_DECAY

      const el = indicatorRef.current
      if (el) {
        let speaker: 'idle' | 'user' | 'agent' = 'idle'
        if (state !== 'muted') {
          if (a > u && a > RMS_FLOOR) speaker = 'agent'
          else if (u > RMS_FLOOR) speaker = 'user'
        }
        el.dataset.speaker = speaker
        el.dataset.muted = state === 'muted' ? 'true' : 'false'

        if (!reducedMotion) {
          const peak = Math.max(u, a)
          const scale = 1 + Math.min(SCALE_MAX, peak * SCALE_GAIN)
          el.style.transform = `scale(${scale.toFixed(3)})`
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [state])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      agentRef.current?.disconnect()
      agentRef.current = null
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    }
  }, [])

  return { state, toast, toastKey, indicatorRef, start, toggleMute, end }
}
```

- **Step 4: Run the controller tests — expect full pass**

```bash
npm test -- __tests__/components/VoiceController.test.tsx --reporter=verbose
```

Expected: all tests pass.

- **Step 5: Commit**

```bash
git add components/VoiceController.tsx __tests__/components/VoiceController.test.tsx
git commit -m "feat(voice): read __ccVoiceContext in start(), pass pageContext to connect"
```

---

## Task 6: Update `TranscriptClient.tsx` — publish voice context

**Files:**

- Modify: `components/TranscriptClient.tsx`

Replace the existing `__ccSessionTitle` effect with one that publishes the full `__ccVoiceContext` payload. The effect depends on `title` (local rename state), `detail.session.user_speaker_labels`, `detail.segments`, and `detail.annotations`.

- **Step 1: Add the import and replace the title-bridge effect in `components/TranscriptClient.tsx`**

At the top of the file, add the import:

```ts
import { buildSessionContext } from '@/lib/voice-context'
```

Replace the existing effect block (find it by the `__ccSessionTitle` reference, currently around line 55–60):

```ts
// Before:
useEffect(() => {
  window.__ccSessionTitle = title
  return () => {
    delete window.__ccSessionTitle
  }
}, [title])
```

```ts
// After:
useEffect(() => {
  const ctx = buildSessionContext(
    { title, user_speaker_labels: detail.session.user_speaker_labels },
    detail.segments,
    detail.annotations
  )
  window.__ccVoiceContext = ctx ?? undefined
  return () => { delete window.__ccVoiceContext }
}, [title, detail.session.user_speaker_labels, detail.segments, detail.annotations])
```

- **Step 2: Run lint**

```bash
npm run lint
```

Fix any errors (unused imports, etc). The `__ccSessionTitle` reference in the old code is gone; TypeScript will surface any missed references.

- **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all previously passing tests still pass. No regressions in `TranscriptView.test.tsx`.

- **Step 4: Commit**

```bash
git add components/TranscriptClient.tsx
git commit -m "feat(voice): TranscriptClient publishes full session context to __ccVoiceContext"
```

---

## Task 7: Update `WriteClient.tsx` — publish voice context

**Files:**

- Modify: `components/WriteClient.tsx`
- **Step 1: Add the import and publish effect to `components/WriteClient.tsx`**

Add the import after the existing imports:

```ts
import { buildWriteContext } from '@/lib/voice-context'
```

Add the effect inside `WriteClient`, after the `useState` calls:

```ts
// Publish pending corrections to the global voice context so the coach
// knows what the user is looking at when they start a session here.
// Cleared on unmount so navigating away doesn't leave stale data.
useEffect(() => {
  window.__ccVoiceContext = buildWriteContext(items) ?? undefined
  return () => { delete window.__ccVoiceContext }
}, [items])
```

The full updated `WriteClient.tsx` should look like this:

```ts
'use client'
import { useState, useEffect } from 'react'
import { WriteList } from '@/components/WriteList'
import { useTranslation } from '@/components/LanguageProvider'
import { buildWriteContext } from '@/lib/voice-context'
import type { PracticeItem } from '@/lib/types'

interface Props {
  initialItems: PracticeItem[]
}

export function WriteClient({ initialItems }: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>(initialItems)

  useEffect(() => {
    window.__ccVoiceContext = buildWriteContext(items) ?? undefined
    return () => { delete window.__ccVoiceContext }
  }, [items])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl md:text-4xl font-medium text-text-primary">
          {t('write.title')}
        </h1>
        {items.length === 0 && (
          <p className="text-sm text-text-secondary mt-1">{t('write.subtitle')}</p>
        )}
      </div>
      <WriteList
        items={items}
        onDeleted={ids => setItems(prev => prev.filter(i => !ids.includes(i.id)))}
      />
    </div>
  )
}
```

- **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass except the integration test (which still has the old mock signature — fixed in Task 8).

- **Step 3: Commit**

```bash
git add components/WriteClient.tsx
git commit -m "feat(voice): WriteClient publishes pending corrections to __ccVoiceContext"
```

---

## Task 8: Update integration test for new `connect()` signature

**Files:**

- Modify: `__tests__/integration/voice-cross-route.test.tsx`

The mock uses `(_l, _i, callbacks)` — the `_i` (items) arg is gone. The new signature is `(targetLanguage, callbacks, routeContext?, pageContext?)`.

- **Step 1: Update the `connect` mock in `__tests__/integration/voice-cross-route.test.tsx`**

Find this block (around line 32):

```ts
vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(async (_l, _i, callbacks) => {
    agentSpies.ref.stateChange = callbacks.onStateChange
    return { setMuted: agentSpies.setMuted, disconnect: agentSpies.disconnect }
  }),
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}))
```

Replace with:

```ts
vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(async (_l, callbacks) => {
    agentSpies.ref.stateChange = callbacks.onStateChange
    return { setMuted: agentSpies.setMuted, disconnect: agentSpies.disconnect }
  }),
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}))
```

- **Step 2: Run the integration test — expect it to pass**

```bash
npm test -- __tests__/integration/voice-cross-route.test.tsx --reporter=verbose
```

Expected: both persistence and sign-out tests pass.

- **Step 3: Run the full test suite — expect a clean pass**

```bash
npm test
```

Expected: all tests pass, no TypeScript errors.

- **Step 4: Run the linter**

```bash
npm run lint
```

Expected: zero errors. Fix any unused-import warnings if present.

- **Step 5: Final commit**

```bash
git add __tests__/integration/voice-cross-route.test.tsx
git commit -m "test(voice): update cross-route integration mock for new connect() signature"
```

---

## Spec Coverage Checklist


| Spec requirement                                                              | Covered by  |
| ----------------------------------------------------------------------------- | ----------- |
| `buildSessionContext` — ±1 neighbour expansion                                | Task 2      |
| `buildSessionContext` — dedupe                                                | Task 2      |
| `buildSessionContext` — speaker resolution (`user_speaker_labels`)            | Task 2      |
| `buildSessionContext` — returns null when segments empty                      | Task 2      |
| `buildSessionContext` — returns payload with empty arrays when no annotations | Task 2      |
| `buildSessionContext` — 8000-char cap, drops from end, logs warn              | Task 2      |
| `buildWriteContext` — filters `!written_down`                                 | Task 3      |
| `buildWriteContext` — returns null for empty                                  | Task 3      |
| `buildWriteContext` — 8000-char cap, drops from end                           | Task 3      |
| `buildSystemPrompt` — write context block rendered                            | Task 4      |
| `buildSystemPrompt` — session context block with annotated markers            | Task 4      |
| `buildSystemPrompt` — session context collapses to title when empty           | Task 4      |
| `buildSystemPrompt` — deixis opening guidance when pageContext present        | Task 4      |
| `buildSystemPrompt` — generic greeting when pageContext absent                | Task 4      |
| `buildSystemPrompt` — page-context block is language-independent              | Task 4      |
| `buildSystemPrompt` — `FocusedCorrection` / `items` removed                   | Task 4      |
| `connect()` — new signature (no `items`)                                      | Task 4      |
| `VoiceController` — reads `__ccVoiceContext` at `start()`                     | Task 5      |
| `VoiceController` — pin-at-connect (mutation after connect not observed)      | Task 5      |
| `VoiceController` — `deriveRouteContext` uses `voiceContext.sessionTitle`     | Task 5      |
| `TranscriptClient` — publishes `kind: 'session'` payload on mount             | Task 6      |
| `TranscriptClient` — clears global on unmount                                 | Task 6      |
| `WriteClient` — publishes `kind: 'write'` payload on mount                    | Task 7      |
| `WriteClient` — clears global on unmount                                      | Task 7      |
| `window.__ccSessionTitle` removed                                             | Tasks 5 + 6 |
| `types/window.d.ts` updated                                                   | Task 1      |


