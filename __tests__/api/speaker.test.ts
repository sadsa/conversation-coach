// __tests__/api/speaker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/pipeline', () => ({ runClaudeAnalysis: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { getAuthenticatedUser } from '@/lib/auth'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

function makeChainableEq(resolvedValue: unknown) {
  // A thenable object that also supports further .eq() chaining
  const chain = {
    eq: vi.fn(),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolvedValue).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(resolvedValue).catch(fn),
  }
  chain.eq.mockReturnValue(chain)
  return chain
}

function makeDb(status: string) {
  const selectEqChain = {
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: { status }, error: null }),
  }
  selectEqChain.eq.mockReturnValue(selectEqChain)

  const db = {
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue(selectEqChain),
      update: vi.fn().mockReturnValue(makeChainableEq({ error: null })),
    })),
  }
  return db
}

beforeEach(() => {
  vi.mocked(runClaudeAnalysis).mockResolvedValue(undefined)
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: { target_language: 'es-AR' },
  } as any)
})

describe('POST /api/sessions/:id/speaker', () => {
  it('returns 400 when speaker_labels field is missing', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb('identifying') as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({}), { params: { id: 'session-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 when speaker_labels is an empty array', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb('identifying') as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: [] }), { params: { id: 'session-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 when speaker_labels contains invalid values', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb('identifying') as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: ['C'] }), { params: { id: 'session-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 409 when session is not in identifying status', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb('ready') as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: ['A'] }), { params: { id: 'session-1' } })
    expect(res.status).toBe(409)
  })

  it('accepts ["A"] and returns analysing', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb('identifying') as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: ['A'] }), { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('analysing')
  })

  it('accepts ["B"] and returns analysing', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb('identifying') as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: ['B'] }), { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('analysing')
  })

  it('accepts ["A", "B"] and returns analysing', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb('identifying') as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const res = await POST(makeRequest({ speaker_labels: ['A', 'B'] }), { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('analysing')
  })
})
