import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn() } }))

import { createServerClient } from '@/lib/supabase-server'
import { POST } from '@/app/api/push-subscription/route'
import { NextRequest } from 'next/server'

describe('POST /api/push-subscription', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts subscription and returns 200', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert: upsertMock }),
    } as any)

    const req = new NextRequest('http://localhost/api/push-subscription', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: 'https://fcm.example',
        keys: { p256dh: 'abc', auth: 'def' },
      }),
    })

    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledWith({
      id: 1,
      endpoint: 'https://fcm.example',
      p256dh: 'abc',
      auth: 'def',
      updated_at: expect.any(String),
    })
  })

  it('returns 400 when body is missing required fields', async () => {
    const req = new NextRequest('http://localhost/api/push-subscription', {
      method: 'POST',
      body: JSON.stringify({ endpoint: 'https://fcm.example' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when upsert fails', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { message: 'db error' } }),
      }),
    } as any)

    const req = new NextRequest('http://localhost/api/push-subscription', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: 'https://fcm.example',
        keys: { p256dh: 'abc', auth: 'def' },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
