import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

import { GET } from '@/app/api/voice-token/route'
import { getAuthenticatedUser } from '@/lib/auth'

const mockGetUser = getAuthenticatedUser as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  process.env.ASSEMBLYAI_API_KEY = 'test-api-key'
})

describe('GET /api/voice-token', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns a token when authenticated', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'temp-token-abc' }),
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBe('temp-token-abc')
  })

  it('returns 500 when AssemblyAI token fetch fails', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service unavailable'),
    })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
