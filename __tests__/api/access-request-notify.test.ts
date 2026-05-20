import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendAdminNotification: vi.fn() }))
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), info: vi.fn() } }))

import { createServerClient } from '@/lib/supabase-server'
import { sendAdminNotification } from '@/lib/email'
import { POST } from '@/app/api/access-request/notify/route'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/access-request/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDb(row: { status: string; requested_at: string; source: string; name?: string } | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: row }),
        }),
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/access-request/notify', () => {
  it('sends admin notification for a fresh pending row', async () => {
    const recentTime = new Date(Date.now() - 5000).toISOString()
    vi.mocked(createServerClient).mockReturnValue(makeDb({
      status: 'pending',
      requested_at: recentTime,
      source: 'google',
    }) as any)

    const res = await POST(makeRequest({ email: 'test@example.com' }))
    expect(res.status).toBe(204)
    expect(sendAdminNotification).toHaveBeenCalledOnce()
  })

  it('does not send notification for approved user', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb({
      status: 'approved',
      requested_at: new Date(Date.now() - 5000).toISOString(),
      source: 'google',
    }) as any)

    const res = await POST(makeRequest({ email: 'approved@example.com' }))
    expect(res.status).toBe(204)
    expect(sendAdminNotification).not.toHaveBeenCalled()
  })

  it('does not send notification when row is older than 5 minutes (debounce)', async () => {
    const oldTime = new Date(Date.now() - 6 * 60_000).toISOString() // 6 minutes old
    vi.mocked(createServerClient).mockReturnValue(makeDb({
      status: 'pending',
      requested_at: oldTime,
      source: 'magic_link',
    }) as any)

    await POST(makeRequest({ email: 'old@example.com' }))
    expect(sendAdminNotification).not.toHaveBeenCalled()
  })

  it('does not send notification when no row found', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb(null) as any)
    await POST(makeRequest({ email: 'nobody@example.com' }))
    expect(sendAdminNotification).not.toHaveBeenCalled()
  })

  it('returns 204 when no email in body', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(204)
  })

  it('sends notification with correct args', async () => {
    const recentTime = new Date(Date.now() - 5000).toISOString()
    vi.mocked(createServerClient).mockReturnValue(makeDb({
      status: 'pending',
      requested_at: recentTime,
      source: 'magic_link',
      name: 'Test User',
    }) as any)

    await POST(makeRequest({ email: 'magic@example.com' }))
    expect(sendAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'magic@example.com',
        name: 'Test User',
      })
    )
  })
})
