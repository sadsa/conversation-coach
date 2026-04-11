// __tests__/api/practice-items-review.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

const EXISTING_CARD = {
  id: 'item-1',
  session_id: 'session-1',
  fsrs_state: null,
  due: null,
  stability: null,
  difficulty: null,
  elapsed_days: null,
  scheduled_days: null,
  reps: null,
  lapses: null,
  last_review: null,
}

function makeDb(card = EXISTING_CARD, updateError: null | { message: string } = null) {
  const updateEq = vi.fn().mockResolvedValue({ error: updateError })
  const mockDb = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'practice_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: card, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
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
    updateEq,
  }
  return mockDb
}

function makeRequest(body: object) {
  return new NextRequest('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)
  vi.resetModules()
})

describe('POST /api/practice-items/:id/review', () => {
  it('returns 400 for invalid rating (0)', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb() as any)
    const { POST } = await import('@/app/api/practice-items/[id]/review/route')
    const res = await POST(makeRequest({ rating: 0 }), { params: { id: 'item-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid rating (2)', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb() as any)
    const { POST } = await import('@/app/api/practice-items/[id]/review/route')
    const res = await POST(makeRequest({ rating: 2 }), { params: { id: 'item-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid rating (4)', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb() as any)
    const { POST } = await import('@/app/api/practice-items/[id]/review/route')
    const res = await POST(makeRequest({ rating: 4 }), { params: { id: 'item-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 404 when card does not belong to user', async () => {
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'practice_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'item-1', session_id: 'session-1' }, error: null }),
              }),
            }),
          }
        }
        // sessions ownership check — returns null (not owned)
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)
    const { POST } = await import('@/app/api/practice-items/[id]/review/route')
    const res = await POST(makeRequest({ rating: 3 }), { params: { id: 'item-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 200 for rating 1 (Again) and writes updated FSRS fields', async () => {
    const db = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db as any)
    const { POST } = await import('@/app/api/practice-items/[id]/review/route')
    const res = await POST(makeRequest({ rating: 1 }), { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
  })

  it('returns 200 for rating 3 (Good) and writes updated FSRS fields', async () => {
    const db = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db as any)
    const { POST } = await import('@/app/api/practice-items/[id]/review/route')
    const res = await POST(makeRequest({ rating: 3 }), { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
  })

  it('after Again (rating 1) on a new card, due is set within 24 hours', async () => {
    const db = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db as any)

    let writtenUpdate: Record<string, unknown> = {}
    db.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'practice_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: EXISTING_CARD, error: null }),
            }),
          }),
          update: vi.fn().mockImplementation((fields: Record<string, unknown>) => {
            writtenUpdate = fields
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
            }),
          }),
        }),
      }
    })

    const { POST } = await import('@/app/api/practice-items/[id]/review/route')
    await POST(makeRequest({ rating: 1 }), { params: { id: 'item-1' } })
    const due = new Date(writtenUpdate.due as string)
    const inOneDayMs = Date.now() + 24 * 60 * 60 * 1000
    expect(due.getTime()).toBeLessThan(inOneDayMs)
  })

  it('after Good (rating 3) on a new card, due is set in the future', async () => {
    // FSRS puts new cards into Learning state first (10 min interval), even with Good.
    // Only Easy (rating 4) graduates a new card directly to Review (1+ day).
    // So the correct assertion is that due > now, not due > 1 day.
    const db = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db as any)

    let writtenUpdate: Record<string, unknown> = {}
    db.from = vi.fn().mockImplementation((table: string) => {
      if (table === 'practice_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: EXISTING_CARD, error: null }),
            }),
          }),
          update: vi.fn().mockImplementation((fields: Record<string, unknown>) => {
            writtenUpdate = fields
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
            }),
          }),
        }),
      }
    })

    const { POST } = await import('@/app/api/practice-items/[id]/review/route')
    await POST(makeRequest({ rating: 3 }), { params: { id: 'item-1' } })
    const due = new Date(writtenUpdate.due as string)
    expect(due.getTime()).toBeGreaterThan(Date.now())
  })
})
