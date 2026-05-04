// __tests__/lib/voice-context.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSessionContext, buildWriteContext, CAP_CHARS } from '@/lib/voice-context'
import type { TranscriptSegment, Annotation, PracticeItem } from '@/lib/types'

vi.mock('@/lib/logger', () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { log } = await import('@/lib/logger')

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

beforeEach(() => {
  vi.clearAllMocks()
})

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
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      'voice-context cap hit',
      expect.objectContaining({ kind: 'session' })
    )
  })
})

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
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      'voice-context cap hit',
      expect.objectContaining({ kind: 'write' })
    )
  })
})
