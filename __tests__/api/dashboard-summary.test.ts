// __tests__/api/dashboard-summary.test.ts
import { describe, it, expect, vi } from 'vitest'
import { computeDashboardSummary } from '@/lib/dashboard-summary'

function makeDb(writeDownCount = 0) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: Array.from({ length: writeDownCount }, (_, i) => ({ id: `wd-${i}` })),
      error: null,
    }),
  }
  return { from: vi.fn().mockReturnValue(mockChain) }
}

describe('computeDashboardSummary', () => {
  it('returns writeDownCount from not-written items', async () => {
    const db = makeDb(3)
    const result = await computeDashboardSummary(db as never, ['session-1'])
    expect(result.writeDownCount).toBe(3)
  })

  it('returns 0 when all items written down', async () => {
    const db = makeDb(0)
    const result = await computeDashboardSummary(db as never, ['session-1'])
    expect(result.writeDownCount).toBe(0)
  })
})
