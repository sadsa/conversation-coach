// __tests__/middleware.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

import { createServerClient } from '@supabase/ssr'
import { middleware } from '@/middleware'

const mockGetUser = vi.fn()
const mockRpc = vi.fn()

function makeSupabaseClient() {
  return {
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  } as unknown as ReturnType<typeof createServerClient>
}

function makeRequest(path: string) {
  return new NextRequest(new URL(`http://localhost${path}`))
}

function rpcApproved() {
  mockRpc.mockResolvedValueOnce({ data: [{ status: 'approved' }] })
}
function rpcPending() {
  mockRpc.mockResolvedValueOnce({ data: [{ status: 'pending' }] })
}
function rpcDenied() {
  mockRpc.mockResolvedValueOnce({ data: [{ status: 'denied' }] })
}
function rpcNoRow() {
  mockRpc.mockResolvedValueOnce({ data: [] })
}

beforeEach(() => {
  vi.mocked(createServerClient).mockReturnValue(makeSupabaseClient())
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('middleware', () => {
  it('redirects unauthenticated users to /login', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('redirects approved user through (200)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1', email: 'approved@example.com' } } })
    rpcApproved()
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(200)
  })

  it('redirects pending user to /pending-approval', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'pending@example.com' } } })
    rpcPending()
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/pending-approval')
  })

  it('redirects denied user to /access-denied', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'denied@example.com' } } })
    rpcDenied()
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/access-denied')
  })

  it('redirects to /pending-approval when no row found (defensive)', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'norow@example.com' } } })
    rpcNoRow()
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/pending-approval')
  })

  it('forwards the verified user identity to downstream handlers via request headers', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-abc',
          email: 'approved@example.com',
          user_metadata: { target_language: 'es-AR' },
        },
      },
    })
    rpcApproved()
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-request-x-cc-user-id')).toBe('user-abc')
    expect(res.headers.get('x-middleware-request-x-cc-user-email')).toBe('approved@example.com')
    expect(res.headers.get('x-middleware-request-x-cc-user-target-language')).toBe('es-AR')
  })

  it('strips any client-supplied auth headers so they cannot be spoofed', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'real-user', email: 'approved@example.com' } } })
    rpcApproved()
    const req = new NextRequest(new URL('http://localhost/'), {
      headers: { 'x-cc-user-id': 'attacker' },
    })
    const res = await middleware(req)
    expect(res.headers.get('x-middleware-request-x-cc-user-id')).toBe('real-user')
  })

  it('redirects user with no email to /access-denied', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u1', email: undefined } } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/access-denied')
  })

  it('passes /login through without calling getUser', async () => {
    const res = await middleware(makeRequest('/login'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('passes /auth/callback through without calling getUser', async () => {
    const res = await middleware(makeRequest('/auth/callback'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('passes /access-denied through without calling getUser', async () => {
    const res = await middleware(makeRequest('/access-denied'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('passes /pending-approval through without calling getUser', async () => {
    const res = await middleware(makeRequest('/pending-approval'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('passes /api/webhooks/assemblyai through without calling getUser', async () => {
    const res = await middleware(makeRequest('/api/webhooks/assemblyai'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('calls rpc with lowercased email', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'UPPER@EXAMPLE.COM' } } })
    rpcApproved()
    await middleware(makeRequest('/'))
    expect(mockRpc).toHaveBeenCalledWith('get_access_status', { email_in: 'upper@example.com' })
  })
})
