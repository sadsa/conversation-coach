// __tests__/lib/leitner.test.ts
import { describe, it, expect } from 'vitest'
import { leitnerPass, leitnerFail, formatDateISO, LEITNER_INTERVALS } from '@/lib/leitner'

const TODAY = new Date('2026-04-14T12:00:00')

describe('LEITNER_INTERVALS', () => {
  it('has 5 boxes', () => {
    expect(Object.keys(LEITNER_INTERVALS)).toHaveLength(5)
  })
  it('box 1 = 1 day, box 5 = 28 days', () => {
    expect(LEITNER_INTERVALS[1]).toBe(1)
    expect(LEITNER_INTERVALS[5]).toBe(28)
  })
})

describe('leitnerPass', () => {
  it('advances box from 1 to 2, due in 3 days', () => {
    const { box, dueDate } = leitnerPass(1, TODAY)
    expect(box).toBe(2)
    expect(formatDateISO(dueDate)).toBe('2026-04-17')
  })

  it('advances box from 2 to 3, due in 7 days', () => {
    const { box, dueDate } = leitnerPass(2, TODAY)
    expect(box).toBe(3)
    expect(formatDateISO(dueDate)).toBe('2026-04-21')
  })

  it('caps at box 5, due in 28 days', () => {
    const { box, dueDate } = leitnerPass(5, TODAY)
    expect(box).toBe(5)
    expect(formatDateISO(dueDate)).toBe('2026-05-12')
  })
})

describe('leitnerFail', () => {
  it('resets to box 1, due tomorrow', () => {
    const { box, dueDate } = leitnerFail(TODAY)
    expect(box).toBe(1)
    expect(formatDateISO(dueDate)).toBe('2026-04-15')
  })
})

describe('formatDateISO', () => {
  it('returns YYYY-MM-DD', () => {
    expect(formatDateISO(new Date('2026-04-14T12:00:00'))).toBe('2026-04-14')
  })
})
