import { describe, it, expect } from 'vitest'
import { computeTrend } from '@/lib/insights'

describe('computeTrend (errors — lower is better)', () => {
  it('returns keep-practicing when both rates are 0', () => {
    expect(computeTrend(0, 0, 0, 0)).toBe('keep-practicing')
  })

  it('returns needs-attention when older_rate is 0 and recent_rate > 0 (new mistake)', () => {
    expect(computeTrend(3, 10, 0, 5)).toBe('needs-attention')
  })

  it('returns making-progress when recent_rate < older_rate * 0.8', () => {
    // older: 5/10 = 0.5, recent: 1/10 = 0.1 → well below 80% threshold
    expect(computeTrend(1, 10, 5, 10)).toBe('making-progress')
  })

  it('returns needs-attention when recent_rate > older_rate * 1.2', () => {
    // older: 1/10 = 0.1, recent: 5/10 = 0.5 → well above 120% threshold
    expect(computeTrend(5, 10, 1, 10)).toBe('needs-attention')
  })

  it('returns keep-practicing for rates within 80–120% band', () => {
    // older: 3/10 = 0.3, recent: 3/10 = 0.3 → exactly equal
    expect(computeTrend(3, 10, 3, 10)).toBe('keep-practicing')
  })

  it('treats rate as 0 when user_turns is 0', () => {
    // recent_user_turns = 0 → recent_rate = 0; older_rate = 3/10 → making-progress
    expect(computeTrend(0, 0, 3, 10)).toBe('making-progress')
  })
})
