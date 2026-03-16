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
import { GET as getDetail, PATCH } from '@/app/api/sessions/[id]/route'
import { GET as getStatus } from '@/app/api/sessions/[id]/status/route'

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

describe('GET /api/sessions/:id', () => {
  it('returns session detail with segments, annotations, and addedAnnotationIds', async () => {
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 's1', title: 'Test', status: 'ready', error_stage: null,
                    duration_seconds: 60, detected_speaker_count: 2, user_speaker_labels: ['A'],
                    created_at: '2026-03-15' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'practice_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [{ annotation_id: 'ann-1' }], error: null }),
            }),
          }
        }
        // transcript_segments and annotations
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost')
    const res = await getDetail(req, { params: { id: 's1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.session.id).toBe('s1')
    expect(body.segments).toEqual([])
    expect(body.annotations).toEqual([])
    expect(body.addedAnnotationIds).toEqual(['ann-1'])
  })

  it('returns 404 for unknown session', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost')
    const res = await getDetail(req, { params: { id: 'unknown' } })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/sessions/:id', () => {
  it('updates title and returns ok', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New Title' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 's1' } })
    expect(res.status).toBe(200)
  })

  it('returns 400 for empty title', async () => {
    vi.mocked(createServerClient).mockReturnValue({} as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ title: '' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 's1' } })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/sessions/:id/status', () => {
  it('returns status and error_stage', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { status: 'ready', error_stage: null },
              error: null,
            }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost')
    const res = await getStatus(req, { params: { id: 's1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ready')
    expect(body.error_stage).toBeNull()
  })
})
