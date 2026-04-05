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
