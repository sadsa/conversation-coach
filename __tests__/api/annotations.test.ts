// __tests__/api/annotations.test.ts
//
// Covers the per-annotation feedback endpoint (PATCH /api/annotations/:id).
// The route's two non-trivial responsibilities are:
//   1. Verifying the caller owns the parent session (via two chained selects).
//   2. Persisting the unhelpful flag together with a paired timestamp so we
//      can mine the toggle history later when tuning the analysis prompt.
// Both branches are exercised here so a regression in either flips the test.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { PATCH } from '@/app/api/annotations/[id]/route'

beforeEach(() => {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: 'user-123',
    email: 'test@example.com',
    targetLanguage: null,
  })
})

function ownedDb(updateMock: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'annotations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { session_id: 's1' },
                error: null,
              }),
            }),
          }),
          update: updateMock,
        }
      }
      // sessions ownership check
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 's1' },
                error: null,
              }),
            }),
          }),
        }),
      }
    }),
  }
}

describe('PATCH /api/annotations/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null)
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: true }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'ann-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the annotation does not belong to the user', async () => {
    // Annotation row exists but the session ownership check returns null →
    // verifyOwnership() resolves false.
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'annotations') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { session_id: 's1' }, error: null }),
            }),
          }),
        }
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
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: true }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'ann-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when is_unhelpful is missing or non-boolean', async () => {
    const updateMock = vi.fn()
    vi.mocked(createServerClient).mockReturnValue(
      ownedDb(updateMock) as unknown as ReturnType<typeof createServerClient>,
    )

    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: 'yes' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'ann-1' } })
    expect(res.status).toBe(400)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('writes is_unhelpful=true with a paired timestamp', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    vi.mocked(createServerClient).mockReturnValue(
      ownedDb(updateMock) as unknown as ReturnType<typeof createServerClient>,
    )

    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: true }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 'ann-1' } })
    expect(res.status).toBe(200)
    const arg = updateMock.mock.calls[0][0]
    expect(arg.is_unhelpful).toBe(true)
    expect(typeof arg.unhelpful_at).toBe('string')
  })

  it('clears unhelpful_at when is_unhelpful=false (undo)', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    vi.mocked(createServerClient).mockReturnValue(
      ownedDb(updateMock) as unknown as ReturnType<typeof createServerClient>,
    )

    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ is_unhelpful: false }),
      headers: { 'content-type': 'application/json' },
    })
    await PATCH(req, { params: { id: 'ann-1' } })
    expect(updateMock).toHaveBeenCalledWith({ is_unhelpful: false, unhelpful_at: null })
  })
})
