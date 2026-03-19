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
