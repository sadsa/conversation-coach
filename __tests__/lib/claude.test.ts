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
    vi.mocked(Anthropic).mockImplementation(function () {
      return { messages: { create: mockCreate } } as unknown as Anthropic
    })
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
