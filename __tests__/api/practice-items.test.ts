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

// Single-query practice-items loader: one PostgREST request joins the
// parent session (for ownership scoping + title) and the parent annotation
// (for char offsets + segment text). The mock shape mirrors that — chain
// is `.from('practice_items').select(...).eq('sessions.user_id', ...).order(...)`
// and the returned rows carry nested `sessions` and `annotations` objects.
function makePracticeItemsDb(orderResult: { data: unknown; error: unknown }) {
  const orderMock = vi.fn().mockResolvedValue(orderResult)
  const eqMock = vi.fn().mockReturnValue({ order: orderMock })
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
  const fromMock = vi.fn().mockReturnValue({ select: selectMock })
  return {
    db: { from: fromMock } as unknown as ReturnType<typeof createServerClient>,
    orderMock,
    eqMock,
    fromMock,
  }
}

describe('GET /api/practice-items', () => {
  it('returns enriched items with session_title, segment_text, start_char, end_char from a single nested query', async () => {
    const { db, fromMock, eqMock } = makePracticeItemsDb({
      data: [
        {
          id: 'item-1',
          session_id: 'session-1',
          annotation_id: 'ann-1',
          type: 'grammar',
          original: 'Yo fui',
          written_down: false,
          sessions: { user_id: 'user-123', title: 'Cafe with María' },
          annotations: {
            start_char: 5,
            end_char: 11,
            transcript_segments: { text: 'Hola mundo amigo mío.' },
          },
        },
      ],
      error: null,
    })
    vi.mocked(createServerClient).mockReturnValue(db)

    const { GET } = await import('@/app/api/practice-items/route')
    const req = new NextRequest('http://localhost/api/practice-items')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()

    // The query is scoped to the user via the joined parent table —
    // attempts to leak another user's items would fail this assertion.
    expect(fromMock).toHaveBeenCalledWith('practice_items')
    expect(eqMock).toHaveBeenCalledWith('sessions.user_id', 'user-123')

    expect(body).toHaveLength(1)
    expect(body[0].session_title).toBe('Cafe with María')
    expect(body[0].segment_text).toBe('Hola mundo amigo mío.')
    expect(body[0].start_char).toBe(5)
    expect(body[0].end_char).toBe(11)
    // Internal join shape isn't part of the public response contract.
    expect(body[0].sessions).toBeUndefined()
    expect(body[0].annotations).toBeUndefined()
  })

  it('returns items with null enrichment fields when the annotation row is missing', async () => {
    const { db } = makePracticeItemsDb({
      data: [
        {
          id: 'item-legacy',
          session_id: 'session-1',
          annotation_id: null,
          sessions: { user_id: 'user-123', title: 'Older session' },
          annotations: null,
        },
      ],
      error: null,
    })
    vi.mocked(createServerClient).mockReturnValue(db)

    const { GET } = await import('@/app/api/practice-items/route')
    const req = new NextRequest('http://localhost/api/practice-items')
    const res = await GET(req)
    const body = await res.json()
    expect(body[0].session_title).toBe('Older session')
    expect(body[0].segment_text).toBeNull()
    expect(body[0].start_char).toBeNull()
    expect(body[0].end_char).toBeNull()
  })

  it('sorts by importance_score descending when ?sort=importance', async () => {
    const { db, orderMock } = makePracticeItemsDb({ data: [], error: null })
    vi.mocked(createServerClient).mockReturnValue(db)

    const { GET } = await import('@/app/api/practice-items/route')
    const req = new NextRequest('http://localhost/api/practice-items?sort=importance')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(orderMock).toHaveBeenCalledWith('importance_score', { ascending: false, nullsFirst: false })
  })

  it('sorts by created_at descending by default', async () => {
    const { db, orderMock } = makePracticeItemsDb({ data: [], error: null })
    vi.mocked(createServerClient).mockReturnValue(db)

    const { GET } = await import('@/app/api/practice-items/route')
    const req = new NextRequest('http://localhost/api/practice-items')
    await GET(req)
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false })
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
