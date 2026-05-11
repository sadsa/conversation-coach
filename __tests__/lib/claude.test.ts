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
    mockCreate.mockClear()
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

  it('returns a fallback when Claude response is not valid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Sorry, I cannot help with that.' }],
    })
    const result = await analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], null)
    expect(result.title).toBe('Practice session')
    expect(result.annotations).toEqual([])
  })

  it('returns sub_category field on each annotation', async () => {
    const mockResponse = {
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: 'Test',
          annotations: [{
            segment_id: 'seg-1',
            type: 'grammar',
            sub_category: 'subjunctive',
            original: 'vengas',
            start_char: 0,
            end_char: 6,
            correction: 'venís',
            explanation: 'Voseo subjunctive form.',
          }],
        }),
      }],
    }
    mockCreate.mockResolvedValueOnce(mockResponse)
    const result = await analyseUserTurns([{ id: 'seg-1', text: 'vengas' }], null)
    expect(result.annotations[0].sub_category).toBe('subjunctive')
  })

  it('includes original_filename in the user message when provided', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ title: 'WhatsApp: Algo', annotations: [] }) }],
    })
    await analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], 'PTT-20260315-001.ogg')
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('PTT-20260315-001.ogg')
  })

  it('returns flashcard fields when Claude includes them in response', async () => {
    const turns: UserTurn[] = [{ id: 'seg-1', text: 'Yo fui al mercado.' }]
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: 'Test',
          annotations: [{
            segment_id: 'seg-1',
            type: 'grammar',
            original: 'Yo fui',
            start_char: 0,
            end_char: 6,
            correction: 'Fui',
            explanation: 'Drop the subject pronoun.',
            sub_category: 'verb-conjugation',
            flashcard_front: 'I [[went]] to the market yesterday.',
            flashcard_back: '[[Fui]] al mercado ayer.',
            flashcard_note: 'Subject pronouns are typically omitted in Rioplatense speech.',
          }],
        }),
      }],
    })
    const result = await analyseUserTurns(turns, null)
    expect(result.annotations[0].flashcard_front).toBe('I [[went]] to the market yesterday.')
    expect(result.annotations[0].flashcard_back).toBe('[[Fui]] al mercado ayer.')
    expect(result.annotations[0].flashcard_note).toBe('Subject pronouns are typically omitted in Rioplatense speech.')
  })

  it('returns null flashcard fields when Claude omits them', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: 'Test',
          annotations: [{
            segment_id: 'seg-1', type: 'grammar', original: 'x',
            start_char: 0, end_char: 1, correction: 'y',
            explanation: 'z.', sub_category: 'other',
            // flashcard fields intentionally absent
          }],
        }),
      }],
    })
    const result = await analyseUserTurns([{ id: 'seg-1', text: 'x' }], null)
    expect(result.annotations[0].flashcard_front).toBeNull()
    expect(result.annotations[0].flashcard_back).toBeNull()
    expect(result.annotations[0].flashcard_note).toBeNull()
  })

  it('returns importance_score and importance_note when Claude includes them', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: 'Test',
          annotations: [{
            segment_id: 'seg-1',
            type: 'grammar',
            original: 'Yo fui',
            start_char: 0,
            end_char: 6,
            correction: 'Fui',
            explanation: 'Drop the subject pronoun.',
            sub_category: 'verb-conjugation',
            flashcard_front: null,
            flashcard_back: null,
            flashcard_note: null,
            importance_score: 3,
            importance_note: 'Very common — your original would sound immediately wrong to a native.',
          }],
        }),
      }],
    })
    const result = await analyseUserTurns([{ id: 'seg-1', text: 'Yo fui' }], null)
    expect(result.annotations[0].importance_score).toBe(3)
    expect(result.annotations[0].importance_note).toBe('Very common — your original would sound immediately wrong to a native.')
  })

  it('returns null importance fields when Claude omits them', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          title: 'Test',
          annotations: [{
            segment_id: 'seg-1', type: 'grammar', original: 'x',
            start_char: 0, end_char: 1, correction: 'y',
            explanation: 'z.', sub_category: 'other',
            // importance fields intentionally absent
          }],
        }),
      }],
    })
    const result = await analyseUserTurns([{ id: 'seg-1', text: 'x' }], null)
    expect(result.annotations[0].importance_score).toBeNull()
    expect(result.annotations[0].importance_note).toBeNull()
  })

  it('uses the ES-AR system prompt when targetLanguage is es-AR', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ title: 'Test', annotations: [] }) }],
      stop_reason: 'end_turn',
    })
    await analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], null, 'session-1', 'es-AR')
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).toContain('Rioplatense')
    expect(callArgs.system).not.toContain('New Zealand English')
    // New guardrails (shared across both languages):
    expect(callArgs.system).toContain('Skip self-corrections')
    expect(callArgs.system).toContain('Do not upsell regional flair')
    expect(callArgs.system).toContain('De-duplicate recurring patterns')
    expect(callArgs.system).toContain('Favour quality over quantity')
    // ES-AR-specific negative example:
    expect(callArgs.system).toContain('pego un mordisco')
    // Recalibrated importance bands (no score=1):
    expect(callArgs.system).toContain('do not assign 1')
  })

  it('uses the EN-NZ system prompt when targetLanguage is en-NZ', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ title: 'Test', annotations: [] }) }],
      stop_reason: 'end_turn',
    })
    await analyseUserTurns([{ id: 'seg-1', text: 'Test.' }], null, 'session-1', 'en-NZ')
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.system).toContain('New Zealand English')
    expect(callArgs.system).toContain(
      'An invented Spanish sentence (in everyday Rioplatense register)',
    )
    expect(callArgs.system).toContain('The equivalent NZ English sentence')
    // Parity with ES-AR — EN-NZ now has the same quality guardrails:
    expect(callArgs.system).toContain('Skip self-corrections')
    expect(callArgs.system).toContain('Do not upsell regional flair')
    expect(callArgs.system).toContain('De-duplicate recurring patterns')
    expect(callArgs.system).toContain('Favour quality over quantity')
    // EN-NZ-specific negative example (the user's original complaint):
    expect(callArgs.system).toContain('have a yarn')
    // Recalibrated importance bands (no score=1):
    expect(callArgs.system).toContain('do not assign 1')
  })
})
