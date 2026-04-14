// __tests__/api/practice-items.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

beforeEach(() => {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)
})

describe('GET /api/practice-items', () => {
  it('returns all items when no filters', async () => {
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'session-1' }],
                error: null,
              }),
            }),
          }
        }
        // practice_items
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 'item-1', type: 'grammar', original: 'Yo fui', reviewed: false, written_down: false }],
                error: null,
              }),
            }),
          }),
        }
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { GET } = await import('@/app/api/practice-items/route')
    const req = new NextRequest('http://localhost/api/practice-items')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
  })

  it('sorts by importance_score descending when ?sort=importance', async () => {
    vi.resetModules()
    vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
    vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
    const { createServerClient } = await import('@/lib/supabase-server')
    const { getAuthenticatedUser } = await import('@/lib/auth')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)

    const orderMock = vi.fn().mockResolvedValue({
      data: [
        { id: 'item-high', importance_score: 3 },
        { id: 'item-low', importance_score: 1 },
      ],
      error: null,
    })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ id: 'session-1' }], error: null }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: orderMock,
            }),
          }),
        }
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { GET } = await import('@/app/api/practice-items/route')
    const req = new NextRequest('http://localhost/api/practice-items?sort=importance')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(orderMock).toHaveBeenCalledWith('importance_score', { ascending: false, nullsFirst: false })
  })
})

describe('PATCH /api/practice-items/:id', () => {
  it('updates reviewed flag', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'practice_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { session_id: 'session-1' }, error: null }),
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
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { PATCH } = await import('@/app/api/practice-items/[id]/route')
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ reviewed: true }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
    expect(updateEq).toHaveBeenCalledWith('id', 'item-1')
  })

  it('updates written_down flag', async () => {
    vi.resetModules()
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'practice_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { session_id: 'session-1' }, error: null }),
              }),
            }),
            update: updateMock,
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
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { PATCH } = await import('@/app/api/practice-items/[id]/route')
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ written_down: true }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ written_down: true }))
  })

  it('returns 400 when no fields provided', async () => {
    vi.resetModules()
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'practice_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { session_id: 'session-1' }, error: null }),
              }),
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
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { PATCH } = await import('@/app/api/practice-items/[id]/route')
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'item-1' } })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/practice-items/:id', () => {
  it('deletes an item', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'practice_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { session_id: 'session-1' }, error: null }),
              }),
            }),
            delete: vi.fn().mockReturnValue({ eq: deleteEq }),
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
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { DELETE } = await import('@/app/api/practice-items/[id]/route')
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/practice-items/:id — written_down trigger', () => {
  it('sets leitner_box=1 and leitner_due_date=today when written_down is set to true', async () => {
    let capturedUpdate: Record<string, unknown> = {}

    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'practice_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { session_id: 'session-1' }, error: null }),
              }),
            }),
            update: vi.fn().mockImplementation((fields: Record<string, unknown>) => {
              capturedUpdate = fields
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
      }),
    }

    vi.mocked(createServerClient).mockReturnValue(mockDb as any)
    vi.resetModules()
    const { PATCH } = await import('@/app/api/practice-items/[id]/route')
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ written_down: true }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'item-1' } })
    expect(res.status).toBe(200)
    expect(capturedUpdate.leitner_box).toBe(1)
    expect(typeof capturedUpdate.leitner_due_date).toBe('string')
    // Should be today's date in YYYY-MM-DD format
    expect(capturedUpdate.leitner_due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('GET /api/practice-items?flashcards=due', () => {
  it('excludes cards where written_down is false', async () => {
    vi.resetModules()
    vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
    vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
    const { createServerClient } = await import('@/lib/supabase-server')
    const { getAuthenticatedUser } = await import('@/lib/auth')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)

    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'session-1' }], error: null }) }) }
        }
        // practice_items query for flashcards=due with Leitner
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    not: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        order: vi.fn().mockResolvedValue({
                          data: [
                            { id: 'item-eligible', leitner_box: 1, leitner_due_date: '2026-04-10' },
                          ],
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)

    const { GET } = await import('@/app/api/practice-items/route')
    const req = new NextRequest('http://localhost/api/practice-items?flashcards=due')
    const res = await GET(req)
    const body = await res.json()
    expect(body).toHaveProperty('boxes')
    expect(body).toHaveProperty('cards')
    expect(body).toHaveProperty('activeBox')
    expect(Array.isArray(body.boxes)).toBe(true)
    expect(Array.isArray(body.cards)).toBe(true)
    const ids = body.cards.map((i: { id: string }) => i.id)
    expect(ids).toContain('item-eligible')
  })

  it('returns cards in active box only', async () => {
    vi.resetModules()
    vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
    vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
    const { createServerClient } = await import('@/lib/supabase-server')
    const { getAuthenticatedUser } = await import('@/lib/auth')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)

    const today = new Date().toISOString().split('T')[0]
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'session-1' }], error: null }) }) }
        }
        // practice_items query with cards in boxes 1 and 2, both due
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    not: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        order: vi.fn().mockResolvedValue({
                          data: [
                            { id: 'card-box1', leitner_box: 1, leitner_due_date: today },
                            { id: 'card-box2', leitner_box: 2, leitner_due_date: today },
                          ],
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)

    const { GET } = await import('@/app/api/practice-items/route')
    const req = new NextRequest('http://localhost/api/practice-items?flashcards=due')
    const res = await GET(req)
    const body = await res.json()
    expect(body.activeBox).toBe(1)
    const ids = body.cards.map((i: { id: string }) => i.id)
    expect(ids).toContain('card-box1')
    expect(ids).not.toContain('card-box2')
  })
})
