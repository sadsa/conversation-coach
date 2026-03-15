// __tests__/api/sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}))
vi.mock('@/lib/r2', () => ({
  presignedUploadUrl: vi.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'
import { presignedUploadUrl } from '@/lib/r2'
import { GET, POST } from '@/app/api/sessions/route'

const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockSingle = vi.fn()

beforeEach(() => {
  vi.mocked(createServerClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
    }),
  } as unknown as ReturnType<typeof createServerClient>)
})

describe('GET /api/sessions', () => {
  it('returns session list ordered by created_at desc', async () => {
    mockSelect.mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [
          { id: 'abc', title: 'Test', status: 'ready', duration_seconds: 3600, created_at: '2026-03-15' },
        ],
        error: null,
      }),
    })
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toHaveLength(1)
    expect(body[0].title).toBe('Test')
  })
})

describe('POST /api/sessions', () => {
  it('creates a session and returns session_id + upload_url', async () => {
    vi.mocked(presignedUploadUrl).mockResolvedValue({ key: 'audio/uuid.mp3', url: 'https://r2.example/presigned' })
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'new-id' },
          error: null,
        }),
      }),
    })

    const req = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'Mi conversación', extension: 'mp3' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.session_id).toBe('new-id')
    expect(body.upload_url).toBe('https://r2.example/presigned')
  })

  it('returns 400 when title is missing', async () => {
    const req = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
