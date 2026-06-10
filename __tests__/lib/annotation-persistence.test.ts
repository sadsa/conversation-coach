// __tests__/lib/annotation-persistence.test.ts
//
// Covers the deep module both analysis paths (upload/webhook via pipeline.ts,
// voice-practice via practice-sessions/route.ts) cross. pipeline.test.ts
// already exercises the upload path end-to-end; here we hit the seam directly
// so the previously-untested voice path is covered by the same interface.
import { describe, it, expect, vi } from 'vitest'
import { persistAnnotations } from '@/lib/annotation-persistence'
import type { ClaudeAnnotation } from '@/lib/claude'
import type { createServerClient } from '@/lib/supabase-server'

function makeDb(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult)
  const db = {
    from: vi.fn().mockReturnValue({ insert }),
  } as unknown as ReturnType<typeof createServerClient>
  return { db, insert }
}

const baseAnnotation: ClaudeAnnotation = {
  segment_id: 'seg-1',
  type: 'grammar',
  sub_category: 'verb-conjugation',
  original: 'Yo fui',
  start_char: 0,
  end_char: 6,
  correction: 'Fui',
  explanation: 'Drop pronoun.',
  flashcard_front: 'I [[went]] to the market.',
  flashcard_back: '[[Fui]] al mercado.',
  flashcard_note: 'Subject pronouns are dropped in Rioplatense.',
  importance_score: 3,
  importance_note: null,
}

const segments = [{ id: 'seg-1', text: 'Yo fui al mercado.' }]

describe('persistAnnotations', () => {
  it('maps all 14 columns and inserts under the given session id', async () => {
    const { db, insert } = makeDb()

    const kept = await persistAnnotations(db, 'sess-1', [baseAnnotation], segments)

    expect(kept).toBe(1)
    const rows = insert.mock.calls[0][0]
    expect(rows[0]).toEqual({
      session_id: 'sess-1',
      segment_id: 'seg-1',
      type: 'grammar',
      original: 'Yo fui',
      start_char: 0,
      end_char: 6,
      correction: 'Fui',
      explanation: 'Drop pronoun.',
      sub_category: 'verb-conjugation',
      flashcard_front: 'I [[went]] to the market.',
      flashcard_back: '[[Fui]] al mercado.',
      flashcard_note: 'Subject pronouns are dropped in Rioplatense.',
      importance_score: 3,
      importance_note: null,
    })
  })

  it('coerces null-able flashcard/importance fields when absent', async () => {
    const { db, insert } = makeDb()
    // Strip optional fields to undefined to prove the ?? null coercion.
    const sparse = {
      ...baseAnnotation,
      flashcard_front: undefined,
      flashcard_back: undefined,
      flashcard_note: undefined,
      importance_score: undefined,
      importance_note: undefined,
    } as unknown as ClaudeAnnotation

    await persistAnnotations(db, 'sess-1', [sparse], segments)

    expect(insert.mock.calls[0][0][0]).toMatchObject({
      flashcard_front: null,
      flashcard_back: null,
      flashcard_note: null,
      importance_score: null,
      importance_note: null,
    })
  })

  it('drops importance_score === 1 annotations before insert', async () => {
    const { db, insert } = makeDb()
    const annotations: ClaudeAnnotation[] = [
      { ...baseAnnotation, importance_score: 3 },
      { ...baseAnnotation, original: 'tuvo una charla', start_char: 0, end_char: 15, importance_score: 1 },
    ]

    const kept = await persistAnnotations(db, 'sess-1', annotations, segments)

    expect(kept).toBe(1)
    expect(insert.mock.calls[0][0]).toHaveLength(1)
    expect(insert.mock.calls[0][0][0].importance_score).toBe(3)
  })

  it('skips the insert entirely when nothing survives filtering', async () => {
    const { db, insert } = makeDb()
    const kept = await persistAnnotations(
      db,
      'sess-1',
      [{ ...baseAnnotation, importance_score: 1 }],
      segments,
    )
    expect(kept).toBe(0)
    expect(insert).not.toHaveBeenCalled()
  })

  it('corrects character offsets against the segment text', async () => {
    const { db, insert } = makeDb()
    // start/end_char point at the wrong slice; original is found at index 7.
    const annotation: ClaudeAnnotation = {
      ...baseAnnotation,
      original: 'mercado',
      start_char: 0,
      end_char: 7,
    }

    await persistAnnotations(db, 'sess-1', [annotation], segments)

    const row = insert.mock.calls[0][0][0]
    expect(segments[0].text.slice(row.start_char, row.end_char)).toBe('mercado')
  })

  it('throws with a unified message when the insert fails', async () => {
    const { db } = makeDb({ error: { message: 'unique violation' } })
    await expect(
      persistAnnotations(db, 'sess-1', [baseAnnotation], segments),
    ).rejects.toThrow('Failed to insert annotations: unique violation')
  })
})
