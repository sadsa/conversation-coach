import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

import { GET } from '@/app/api/voice-token/route'
import { getAuthenticatedUser } from '@/lib/auth'

const mockGetUser = getAuthenticatedUser as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  process.env.GOOGLE_API_KEY = 'test-google-key'
})

describe('GET /api/voice-token', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns the Google API key as token when authenticated', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBe('test-google-key')
  })

  it('returns 500 when GOOGLE_API_KEY is not set', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    delete process.env.GOOGLE_API_KEY
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
