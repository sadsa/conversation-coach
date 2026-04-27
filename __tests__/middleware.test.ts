// __tests__/middleware.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

import { createServerClient } from '@supabase/ssr'
import { middleware } from '@/middleware'

const mockGetUser = vi.fn()

function makeSupabaseClient() {
  return { auth: { getUser: mockGetUser } } as unknown as ReturnType<typeof createServerClient>
}

function makeRequest(path: string) {
  return new NextRequest(new URL(`http://localhost${path}`))
}

beforeEach(() => {
  vi.mocked(createServerClient).mockReturnValue(makeSupabaseClient())
  process.env.ALLOWED_EMAILS = 'allowed@example.com'
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

  it('redirects authenticated users with unlisted email to /access-denied', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'other@example.com' } } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/access-denied')
  })

  it('allows through authenticated users with a listed email', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'allowed@example.com' } } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(200)
  })

  it('forwards the verified user identity to downstream handlers via request headers', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-abc',
          email: 'allowed@example.com',
          user_metadata: { target_language: 'es-AR' },
        },
      },
    })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-request-x-cc-user-id')).toBe('user-abc')
    expect(res.headers.get('x-middleware-request-x-cc-user-email')).toBe('allowed@example.com')
    expect(res.headers.get('x-middleware-request-x-cc-user-target-language')).toBe('es-AR')
  })

  it('strips any client-supplied auth headers so they cannot be spoofed', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'real-user', email: 'allowed@example.com' } } })
    const req = new NextRequest(new URL('http://localhost/'), {
      headers: { 'x-cc-user-id': 'attacker' },
    })
    const res = await middleware(req)
    expect(res.headers.get('x-middleware-request-x-cc-user-id')).toBe('real-user')
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

  it('passes /api/webhooks/assemblyai through without calling getUser', async () => {
    const res = await middleware(makeRequest('/api/webhooks/assemblyai'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('passes /api/maintenance/audio-retention through without calling getUser', async () => {
    const res = await middleware(makeRequest('/api/maintenance/audio-retention'))
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('blocks all users when ALLOWED_EMAILS is empty', async () => {
    process.env.ALLOWED_EMAILS = ''
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'allowed@example.com' } } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/access-denied')
  })

  it('trims whitespace from ALLOWED_EMAILS entries', async () => {
    process.env.ALLOWED_EMAILS = '  allowed@example.com , other@example.com  '
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'allowed@example.com' } } })
    const res = await middleware(makeRequest('/'))
    expect(res.status).toBe(200)
  })
})
