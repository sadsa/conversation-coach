// __tests__/api/dashboard-summary.test.ts
import { describe, it, expect, vi } from 'vitest'

// We test the query logic in isolation via a helper extracted from the route.
// The route itself is thin wiring; the helper is where the logic lives.
import { computeDashboardSummary } from '@/lib/dashboard-summary'

const makeDb = (overrides: Partial<{
  dueCount: number
  writeDownCount: number
  nextReviewAt: string | null
}> = {}) => {
  const { dueCount = 2, writeDownCount = 1, nextReviewAt = '2026-04-12T15:00:00Z' } = overrides
  const selectMock = vi.fn().mockReturnThis()
  const inMock = vi.fn().mockReturnThis()
  const notMock = vi.fn().mockReturnThis()
  const isMock = vi.fn().mockReturnThis()
  const lteMock = vi.fn().mockReturnThis()
  const gtMock = vi.fn().mockReturnThis()
  const orderMock = vi.fn().mockReturnThis()
  const limitMock = vi.fn()

  let callIndex = 0
  const responses = [
    // newCards query (dueCount split: new cards)
    { data: Array.from({ length: Math.ceil(dueCount / 2) }, (_, i) => ({ id: `new-${i}` })), error: null },
    // dueCards query (dueCount split: due reviews)
    { data: Array.from({ length: Math.floor(dueCount / 2) }, (_, i) => ({ id: `due-${i}` })), error: null },
    // writeDownCount query
    { data: Array.from({ length: writeDownCount }, (_, i) => ({ id: `wd-${i}` })), error: null },
    // nextReviewAt query
    { data: nextReviewAt ? [{ due: nextReviewAt }] : [], error: null },
  ]

  limitMock.mockImplementation(() => responses[callIndex++])

  return {
    from: vi.fn().mockReturnValue({
      select: selectMock, in: inMock, not: notMock, is: isMock,
      lte: lteMock, gt: gtMock, order: orderMock, limit: limitMock,
      eq: vi.fn().mockReturnThis(),
    }),
  }
}

describe('computeDashboardSummary', () => {
  it('returns correct combined dueCount and nextReviewAt', async () => {
    const db = makeDb({ dueCount: 4, writeDownCount: 2, nextReviewAt: '2026-04-12T18:00:00Z' })
    const result = await computeDashboardSummary(db as never, ['session-1'])
    expect(result.dueCount).toBe(4)
    expect(result.writeDownCount).toBe(2)
    expect(result.nextReviewAt).toBe('2026-04-12T18:00:00Z')
  })

  it('returns zero counts when no items', async () => {
    const db = makeDb({ dueCount: 0, writeDownCount: 0, nextReviewAt: null })
    const result = await computeDashboardSummary(db as never, ['session-1'])
    expect(result).toEqual({ dueCount: 0, writeDownCount: 0, nextReviewAt: null })
  })

  it('returns nextReviewAt null when no future cards', async () => {
    const db = makeDb({ dueCount: 2, writeDownCount: 0, nextReviewAt: null })
    const result = await computeDashboardSummary(db as never, ['session-1'])
    expect(result.nextReviewAt).toBeNull()
  })
})
