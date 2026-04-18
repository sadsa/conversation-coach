// __tests__/api/dashboard-summary.test.ts
import { describe, it, expect, vi } from 'vitest'
import { computeDashboardSummary } from '@/lib/dashboard-summary'

// computeDashboardSummary now runs a single count-only query against
// `practice_items`. The mock just needs to terminate that one chain.
function makeDb(writeDownCount: number) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: writeDownCount, error: null }),
        }),
      }),
    }),
  }
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

  it('returns 0 when count is null (no rows match)', async () => {
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: null, error: null }),
          }),
        }),
      }),
    }
    const result = await computeDashboardSummary(db as never, ['session-1'])
    expect(result.writeDownCount).toBe(0)
  })
})
