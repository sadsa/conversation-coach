// __tests__/api/sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}))
vi.mock('@/lib/r2', () => ({
  presignedUploadUrl: vi.fn(),
  deleteObject: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'
import { presignedUploadUrl, deleteObject } from '@/lib/r2'
import { getAuthenticatedUser } from '@/lib/auth'
import { GET, POST } from '@/app/api/sessions/route'
import { GET as getDetail, PATCH, DELETE } from '@/app/api/sessions/[id]/route'
import { GET as getStatus } from '@/app/api/sessions/[id]/status/route'
import { POST as postView } from '@/app/api/sessions/[id]/view/route'

const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockSingle = vi.fn()

beforeEach(() => {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)
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
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: 'abc', title: 'Test', status: 'ready', duration_seconds: 3600, created_at: '2026-03-15' },
          ],
          error: null,
        }),
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

  it('defaults to "Untitled" when title is missing', async () => {
    vi.mocked(presignedUploadUrl).mockResolvedValue({ key: 'audio/uuid.mp3', url: 'https://r2.example/presigned' })
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'new-id' },
          error: null,
        }),
      }),
    })
    const mockDb = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)

    // Verify the inserted row has title 'Untitled'
    const insertedRow = insertMock.mock.calls[0][0]
    expect(insertedRow.title).toBe('Untitled')
  })

  it('stores original_filename when provided', async () => {
    // Arrange: mock DB insert to capture the inserted row
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sess-1', audio_r2_key: 'audio/sess-1.mp3' },
          error: null,
        }),
      }),
    })
    const mockDb = {
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(presignedUploadUrl).mockResolvedValue({ key: 'audio/sess-1.mp3', url: 'https://r2.example.com/upload' })

    const req = new NextRequest('http://localhost/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', extension: 'ogg', original_filename: 'PTT-20260315-001.ogg' }),
    })
    await POST(req)

    const insertedRow = insertMock.mock.calls[0][0]
    expect(insertedRow).toMatchObject({ original_filename: 'PTT-20260315-001.ogg' })
  })
})

describe('GET /api/sessions/:id', () => {
  it('returns session detail with segments, annotations, and addedAnnotations map', async () => {
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 's1', title: 'Test', status: 'ready', error_stage: null,
                      duration_seconds: 60, detected_speaker_count: 2, user_speaker_labels: ['A'],
                      created_at: '2026-03-15' },
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'practice_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'pi-1', annotation_id: 'ann-1' }],
                error: null,
              }),
            }),
          }
        }
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
    expect(body.addedAnnotations).toEqual({ 'ann-1': 'pi-1' })
  })

  it('returns 404 for unknown session', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
            }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost')
    const res = await getDetail(req, { params: { id: 'unknown' } })
    expect(res.status).toBe(404)
  })

  it('returns writtenAnnotations array with IDs of written practice items', async () => {
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 's1', title: 'Test', status: 'ready', error_stage: null, duration_seconds: 60, detected_speaker_count: 2, user_speaker_labels: ['A'], created_at: '2026-03-15' },
                  error: null,
                }),
              }),
            }),
          }),
        }
        if (table === 'transcript_segments') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
        if (table === 'annotations') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
        // practice_items — one written, one not
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'pi-1', annotation_id: 'ann-1', written_down: true },
                { id: 'pi-2', annotation_id: 'ann-2', written_down: false },
              ],
              error: null,
            }),
          }),
        }
      }),
    } as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost/api/sessions/s1')
    const res = await getDetail(req, { params: { id: 's1' } })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.writtenAnnotations).toEqual(['ann-1'])
  })
})

describe('PATCH /api/sessions/:id', () => {
  it('updates title and returns ok', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
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

  it('clears last_viewed_at when read=false (mark as unread)', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ read: false }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 's1' } })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ last_viewed_at: null })
  })

  it('sets last_viewed_at to a timestamp when read=true', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ update: updateMock }),
    } as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ read: true }),
      headers: { 'content-type': 'application/json' },
    })
    await PATCH(req, { params: { id: 's1' } })
    const arg = updateMock.mock.calls[0][0]
    expect(typeof arg.last_viewed_at).toBe('string')
    // Sanity: the value parses as a date.
    expect(Number.isNaN(Date.parse(arg.last_viewed_at))).toBe(false)
  })

  it('returns 400 when no recognised field is supplied', async () => {
    vi.mocked(createServerClient).mockReturnValue({} as unknown as ReturnType<typeof createServerClient>)
    const req = new NextRequest('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ unrelated: 'value' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { id: 's1' } })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/sessions/:id/view', () => {
  it('stamps last_viewed_at when the session was unread', async () => {
    const updateEqInner = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: updateEqInner }),
    })
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 's1', last_viewed_at: null },
                error: null,
              }),
            }),
          }),
        }),
        update: updateMock,
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await postView(req, { params: { id: 's1' } })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.alreadyViewed).toBe(false)
    expect(updateMock).toHaveBeenCalled()
  })

  it('is a no-op when the session was already read', async () => {
    const updateMock = vi.fn()
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 's1', last_viewed_at: '2026-04-18T10:00:00Z' },
                error: null,
              }),
            }),
          }),
        }),
        update: updateMock,
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await postView(req, { params: { id: 's1' } })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.alreadyViewed).toBe(true)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns 404 for unknown session', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'no rows' } }),
            }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await postView(req, { params: { id: 'unknown' } })
    expect(res.status).toBe(404)
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null)
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await postView(req, { params: { id: 's1' } })
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/sessions/:id', () => {
  it('deletes the session and returns ok', async () => {
    const selectSingle = vi.fn().mockResolvedValue({ data: { audio_r2_key: null }, error: null })
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: selectSingle,
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: eqMock,
              }),
            }),
          }
        }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: 'sess-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-123')
  })

  it('returns 500 when the database delete fails', async () => {
    const selectSingle = vi.fn().mockResolvedValue({ data: { audio_r2_key: null }, error: null })
    const eqMock = vi.fn().mockResolvedValue({ error: { message: 'DB error' } })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: selectSingle,
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: eqMock,
              }),
            }),
          }
        }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: 'sess-1' } })
    expect(res.status).toBe(500)
  })

  it('deletes retained session audio before deleting the session row', async () => {
    const selectSingle = vi.fn().mockResolvedValue({ data: { audio_r2_key: 'audio/clip-1.ogg' }, error: null })
    const eqMock = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: selectSingle,
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: eqMock,
              }),
            }),
          }
        }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(deleteObject).mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: 'sess-1' } })

    expect(res.status).toBe(200)
    expect(deleteObject).toHaveBeenCalledWith('audio/clip-1.ogg')
  })

  it('returns 401 for unauthenticated delete requests', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(null)
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, { params: { id: 'sess-1' } })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/sessions/:id/status', () => {
  it('returns status and error_stage', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { status: 'ready', error_stage: null },
                error: null,
              }),
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
