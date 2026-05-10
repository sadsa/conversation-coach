// __tests__/api/practice-sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/claude', () => ({ analyseUserTurns: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyseUserTurns } from '@/lib/claude'

const mockUser = { id: 'user-123', email: 'test@example.com', targetLanguage: 'es-AR' }

const sampleTurns = [
  { role: 'model', text: '¿De qué querés hablar hoy?', wallMs: 1000 },
  { role: 'user', text: 'Quiero hablar de mi trabajo.', wallMs: 3000 },
  { role: 'model', text: 'Bueno, contame.', wallMs: 4500 },
  { role: 'user', text: 'Soy programador.', wallMs: 6000 },
]

function makeDb() {
  const singleSessionMock = vi.fn().mockResolvedValue({ data: { id: 'session-abc' }, error: null })
  const selectSessionMock = vi.fn().mockReturnValue({ single: singleSessionMock })
  const insertSessionMock = vi.fn().mockReturnValue({ select: selectSessionMock })

  const insertSegmentsWithSelectMock = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({
      data: [
        { id: 'seg-0', speaker: 'B', position: 0 },
        { id: 'seg-1', speaker: 'A', position: 1 },
        { id: 'seg-2', speaker: 'B', position: 2 },
        { id: 'seg-3', speaker: 'A', position: 3 },
      ],
      error: null,
    }),
  })

  const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
  const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'sessions') return { insert: insertSessionMock, update: updateMock }
    if (table === 'transcript_segments') return { insert: insertSegmentsWithSelectMock }
    if (table === 'annotations') return { insert: insertAnnotationsMock }
    return {}
  })

  return {
    db: { from: fromMock } as unknown as ReturnType<typeof createServerClient>,
    insertSessionMock,
    insertSegmentsWithSelectMock,
    insertAnnotationsMock,
    updateMock,
    eqUpdateMock,
  }
}

describe('POST /api/practice-sessions', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(getAuthenticatedUser).mockResolvedValue(mockUser as any)
    vi.mocked(analyseUserTurns).mockResolvedValue({
      title: 'Trabajo de programador',
      annotations: [],
    })
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
    const { db } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: sampleTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when no user turns present', async () => {
    const { db } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const modelOnlyTurns = [{ role: 'model', text: 'Hola', wallMs: 1000 }]
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: modelOnlyTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates session with session_type voice_practice and status analysing', async () => {
    const { db, insertSessionMock } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: sampleTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(insertSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session_type: 'voice_practice',
        status: 'analysing',
        user_id: 'user-123',
        user_speaker_labels: ['A'],
      })
    )
  })

  it('inserts segments with correct speaker mapping', async () => {
    const { db, insertSegmentsWithSelectMock } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: sampleTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    const insertedSegments = vi.mocked(insertSegmentsWithSelectMock).mock.calls[0][0] as Array<{ speaker: string; text: string }>
    expect(insertedSegments[0]).toMatchObject({ speaker: 'B', text: '¿De qué querés hablar hoy?' })
    expect(insertedSegments[1]).toMatchObject({ speaker: 'A', text: 'Quiero hablar de mi trabajo.' })
  })

  it('calls analyseUserTurns with only user-speaker turns', async () => {
    const { db } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: sampleTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    const [userTurnsArg] = vi.mocked(analyseUserTurns).mock.calls[0]
    expect(userTurnsArg).toHaveLength(2)
    expect(userTurnsArg.map((t: { text: string }) => t.text)).toEqual([
      'Quiero hablar de mi trabajo.',
      'Soy programador.',
    ])
  })

  it('returns 201 with session_id on success', async () => {
    const { db } = makeDb()
    vi.mocked(createServerClient).mockReturnValue(db)
    const { POST } = await import('@/app/api/practice-sessions/route')
    const req = new NextRequest('http://localhost/api/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ turns: sampleTurns, targetLanguage: 'es-AR' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('session_id', 'session-abc')
  })
})
