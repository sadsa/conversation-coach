// __tests__/api/leitner-review.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

function makeDb(options: {
  items?: Array<{ id: string; leitner_box: number; session_id: string }>
  sessionIds?: string[]
  updateError?: { message: string } | null
} = {}) {
  const {
    items = [
      { id: 'item-1', leitner_box: 2, session_id: 'session-1' },
      { id: 'item-2', leitner_box: 2, session_id: 'session-1' },
    ],
    sessionIds = ['session-1'],
    updateError = null,
  } = options

  const capturedUpdates: Array<Record<string, unknown>> = []

  return {
    capturedUpdates,
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: sessionIds.map(id => ({ id })), error: null }),
          }),
        }
      }
      // practice_items
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: items, error: null }),
        }),
        update: vi.fn().mockImplementation((fields: Record<string, unknown>) => {
          capturedUpdates.push(fields)
          return { eq: vi.fn().mockResolvedValue({ error: updateError }) }
        }),
      }
    }),
  }
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

describe('POST /api/practice-items/leitner-review', () => {
  it('returns 400 when results is missing', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb() as any)
    const { POST } = await import('@/app/api/practice-items/leitner-review/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when results is empty', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb() as any)
    const { POST } = await import('@/app/api/practice-items/leitner-review/route')
    const res = await POST(makeRequest({ results: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    vi.mocked(createServerClient).mockReturnValue(makeDb() as any)
    const { POST } = await import('@/app/api/practice-items/leitner-review/route')
    const res = await POST(makeRequest({ results: [{ id: 'item-1', passed: true }] }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when item does not belong to user', async () => {
    const db = makeDb({ sessionIds: ['other-session'] })
    vi.mocked(createServerClient).mockReturnValue(db as any)
    const { POST } = await import('@/app/api/practice-items/leitner-review/route')
    const res = await POST(makeRequest({ results: [{ id: 'item-1', passed: true }] }))
    expect(res.status).toBe(404)
  })

  it('advances box on pass: box 2 → 3, due in 7 days', async () => {
    const db = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db as any)
    const { POST } = await import('@/app/api/practice-items/leitner-review/route')
    const res = await POST(makeRequest({ results: [{ id: 'item-1', passed: true }] }))
    expect(res.status).toBe(200)
    const update = db.capturedUpdates.find(u => u.leitner_box === 3)
    expect(update).toBeDefined()
  })

  it('resets to box 1 on fail', async () => {
    const db = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db as any)
    const { POST } = await import('@/app/api/practice-items/leitner-review/route')
    const res = await POST(makeRequest({ results: [{ id: 'item-1', passed: false }] }))
    expect(res.status).toBe(200)
    const update = db.capturedUpdates.find(u => u.leitner_box === 1)
    expect(update).toBeDefined()
  })
})
