import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn() } }))

import { GET } from '@/app/api/debug/elevenlabs-token/route'
import { getAuthenticatedUser } from '@/lib/auth'

const mockGetUser = getAuthenticatedUser as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  process.env.ELEVENLABS_API_KEY = 'test-el-key'
  process.env.ELEVENLABS_AGENT_ID = 'test-agent-id'
  vi.stubGlobal('fetch', vi.fn())
})

describe('GET /api/debug/elevenlabs-token', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 500 when env vars missing', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    delete process.env.ELEVENLABS_API_KEY
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('returns signedUrl on success', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ signed_url: 'wss://api.elevenlabs.io/test' }),
    } as Response)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.signedUrl).toBe('wss://api.elevenlabs.io/test')
  })

  it('calls ElevenLabs with correct agent_id and api key header', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ signed_url: 'wss://api.elevenlabs.io/test' }),
    } as Response)

    await GET()

    expect(fetch).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=test-agent-id',
      { headers: { 'xi-api-key': 'test-el-key' } },
    )
  })

  it('returns 502 when ElevenLabs API fails', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 429,
    } as Response)

    const res = await GET()
    expect(res.status).toBe(502)
  })

  it('returns 502 when fetch throws (network error)', async () => {
    mockGetUser.mockResolvedValue({ id: 'user-1', email: 'test@example.com' })
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'))
    const res = await GET()
    expect(res.status).toBe(502)
  })
})
