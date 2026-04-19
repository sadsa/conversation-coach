// __tests__/lib/auto-read-toast.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { stashAutoRead, consumePendingAutoReadToast } from '@/lib/auto-read-toast'

const sessionStorageStub = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
    key: () => null,
    length: 0,
  }
})()

beforeEach(() => {
  sessionStorageStub.clear()
  vi.stubGlobal('sessionStorage', sessionStorageStub)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('auto-read toast stash', () => {
  it('round-trips a fresh stash through sessionStorage', () => {
    stashAutoRead('sess-1', 'Chat with María')
    const stash = consumePendingAutoReadToast()
    expect(stash).toMatchObject({ id: 'sess-1', title: 'Chat with María' })
    expect(typeof stash?.at).toBe('number')
  })

  it('clears the stash after consumption (single-shot)', () => {
    stashAutoRead('sess-1', 'Anything')
    expect(consumePendingAutoReadToast()).not.toBeNull()
    // Second consumption finds nothing — toast should fire exactly once.
    expect(consumePendingAutoReadToast()).toBeNull()
  })

  it('discards stale stashes older than the TTL', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 19, 10, 0, 0))
    stashAutoRead('sess-1', 'Old')
    // Jump 2 minutes forward — well past the 60s TTL.
    vi.setSystemTime(new Date(2026, 3, 19, 10, 2, 0))
    expect(consumePendingAutoReadToast()).toBeNull()
  })

  it('returns null when no stash has been written', () => {
    expect(consumePendingAutoReadToast()).toBeNull()
  })

  it('returns null and recovers gracefully on malformed JSON', () => {
    sessionStorageStub.setItem('autoReadToast', '{not json')
    expect(consumePendingAutoReadToast()).toBeNull()
  })

  it('overwrites earlier stashes — most recent auto-read wins', () => {
    stashAutoRead('sess-1', 'First')
    stashAutoRead('sess-2', 'Second')
    const stash = consumePendingAutoReadToast()
    expect(stash?.id).toBe('sess-2')
    expect(stash?.title).toBe('Second')
  })
})
