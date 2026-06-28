// __tests__/api/practice-items-srs.test.ts
// Tests for FSRS scheduling (PATCH) and dueCount (loadPracticeItems).
// Kept in a separate file to avoid module-cache interactions with the
// vi.resetModules() calls in practice-items.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

beforeEach(() => {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)
})

function makePatchDb(currentItemData: Record<string, unknown>) {
  let capturedUpdate: Record<string, unknown> = {}
  const db = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'practice_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: currentItemData, error: null }),
            }),
          }),
          update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            capturedUpdate = data
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      // sessions ownership check
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
            }),
          }),
        }),
      }
    }),
  }
  return { db, getUpdate: () => capturedUpdate }
}

function makeLoaderDb(rows: unknown[]) {
  const orderMock = vi.fn().mockResolvedValue({ data: rows, error: null })
  const eqMock = vi.fn().mockReturnValue({ order: orderMock })
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
  return { from: vi.fn().mockReturnValue({ select: selectMock }) }
}

describe('PATCH /api/practice-items/:id — FSRS scheduling', () => {
  it('initialises FSRS on first study (reviewed false → true)', async () => {
    const { db, getUpdate } = makePatchDb({
      session_id: 'session-1', reviewed: false,
      stability: null, due: null, fsrs_state: null, difficulty: null,
      elapsed_days: null, scheduled_days: null, reps: null, lapses: null, last_review: null,
    })
    vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>)
    const { PATCH } = await import('@/app/api/practice-items/[id]/route')
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ reviewed: true }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
    const u = getUpdate()
    expect(u.reps).toBe(1)
    expect(new Date(u.due as string) > new Date()).toBe(true)
  })

  it('advances FSRS state on re-study (reviewed true → true)', async () => {
    vi.resetModules()
    const pastDue = new Date(Date.now() - 5 * 864e5).toISOString()
    const { db, getUpdate } = makePatchDb({
      session_id: 'session-1', reviewed: true,
      fsrs_state: 2, due: pastDue, stability: 5, difficulty: 5,
      elapsed_days: 5, scheduled_days: 5, reps: 1, lapses: 0, last_review: pastDue,
    })
    vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>)
    const { PATCH } = await import('@/app/api/practice-items/[id]/route')
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ reviewed: true }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
    const u = getUpdate()
    expect((u.reps as number) > 1).toBe(true)
    expect(new Date(u.due as string) > new Date(pastDue)).toBe(true)
  })

  it('does not write FSRS fields when setting reviewed: false', async () => {
    vi.resetModules()
    const { db, getUpdate } = makePatchDb({
      session_id: 'session-1', reviewed: true,
      fsrs_state: 2, stability: 5, difficulty: 5,
      elapsed_days: 5, scheduled_days: 5, reps: 1, lapses: 0,
      due: new Date().toISOString(), last_review: new Date().toISOString(),
    })
    vi.mocked(createServerClient).mockReturnValue(db as unknown as ReturnType<typeof createServerClient>)
    const { PATCH } = await import('@/app/api/practice-items/[id]/route')
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ reviewed: false }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
    const u = getUpdate()
    expect(u.reviewed).toBe(false)
    expect(u.due).toBeUndefined()
  })
})

describe('loadPracticeItems — dueCount', () => {
  it('counts items with due <= now and reviewed=true', async () => {
    vi.resetModules()
    const past = new Date(Date.now() - 864e5).toISOString()
    const future = new Date(Date.now() + 864e5).toISOString()
    const rows = [
      { id: 'a', session_id: 's1', annotation_id: null, reviewed: true, due: past, created_at: '2026-01-01T00:00:00Z', sessions: { user_id: 'user-123', title: 'S1' }, annotations: null },
      { id: 'b', session_id: 's1', annotation_id: null, reviewed: true, due: future, created_at: '2026-01-01T00:00:00Z', sessions: { user_id: 'user-123', title: 'S1' }, annotations: null },
      { id: 'c', session_id: 's1', annotation_id: null, reviewed: false, due: past, created_at: '2026-01-01T00:00:00Z', sessions: { user_id: 'user-123', title: 'S1' }, annotations: null },
    ]
    vi.mocked(createServerClient).mockReturnValue(makeLoaderDb(rows) as any)
    const { loadPracticeItems } = await import('@/lib/loaders')
    const { items, dueCount } = await loadPracticeItems('user-123')
    expect(items).toHaveLength(3)
    expect(dueCount).toBe(1)
  })

  it('returns dueCount 0 when nothing is overdue', async () => {
    vi.resetModules()
    const future = new Date(Date.now() + 864e5).toISOString()
    const rows = [
      { id: 'a', session_id: 's1', annotation_id: null, reviewed: true, due: future, created_at: '2026-01-01T00:00:00Z', sessions: { user_id: 'user-123', title: 'S1' }, annotations: null },
    ]
    vi.mocked(createServerClient).mockReturnValue(makeLoaderDb(rows) as any)
    const { loadPracticeItems } = await import('@/lib/loaders')
    const { dueCount } = await loadPracticeItems('user-123')
    expect(dueCount).toBe(0)
  })
})
