// __tests__/api/dashboard-summary.test.ts
import { describe, it, expect, vi } from 'vitest'
import { computeDashboardSummary } from '@/lib/dashboard-summary'

function makeDb(options: {
  boxRows?: Array<{ leitner_box: number; leitner_due_date: string }>
  writeDownCount?: number
} = {}) {
  const today = '2026-04-14'
  const { boxRows = [], writeDownCount = 0 } = options

  let callCount = 0
  const responses = [
    // First query: leitner box overview
    { data: boxRows, error: null },
    // Second query: not-written-down count
    { data: Array.from({ length: writeDownCount }, (_, i) => ({ id: `wd-${i}` })), error: null },
  ]

  const mockChain = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => responses[callCount++]),
  }

  return { from: vi.fn().mockReturnValue(mockChain), _today: today }
}

describe('computeDashboardSummary', () => {
  it('returns leitnerDue true when a box is due today', async () => {
    const db = makeDb({
      boxRows: [
        { leitner_box: 1, leitner_due_date: '2026-04-14' },
        { leitner_box: 2, leitner_due_date: '2026-04-16' },
      ],
      writeDownCount: 1,
    })
    const result = await computeDashboardSummary(db as never, ['session-1'], '2026-04-14')
    expect(result.leitnerDue).toBe(true)
    expect(result.dueBoxes).toEqual([1])
    expect(result.writeDownCount).toBe(1)
  })

  it('returns leitnerDue false and nextDueDate when nothing is due', async () => {
    const db = makeDb({
      boxRows: [
        { leitner_box: 2, leitner_due_date: '2026-04-17' },
        { leitner_box: 3, leitner_due_date: '2026-04-21' },
      ],
      writeDownCount: 0,
    })
    const result = await computeDashboardSummary(db as never, ['session-1'], '2026-04-14')
    expect(result.leitnerDue).toBe(false)
    expect(result.dueBoxes).toEqual([])
    expect(result.nextDueDate).toBe('2026-04-17')
    expect(result.writeDownCount).toBe(0)
  })

  it('returns leitnerDue false and nextDueDate null when no eligible cards', async () => {
    const db = makeDb({ boxRows: [], writeDownCount: 0 })
    const result = await computeDashboardSummary(db as never, ['session-1'], '2026-04-14')
    expect(result.leitnerDue).toBe(false)
    expect(result.nextDueDate).toBeNull()
  })
})
