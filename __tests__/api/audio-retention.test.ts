import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}))
vi.mock('@/lib/r2', () => ({
  deleteObject: vi.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'
import { deleteObject } from '@/lib/r2'
import { POST } from '@/app/api/maintenance/audio-retention/route'

describe('POST /api/maintenance/audio-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MAINTENANCE_TOKEN = 'secret-token'
    process.env.AUDIO_RETENTION_DAYS = '14'
  })

  it('returns 401 when authorization token is missing', async () => {
    const req = new NextRequest('http://localhost/api/maintenance/audio-retention', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('deletes old retained audio and clears audio_r2_key', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                lte: vi.fn().mockResolvedValue({
                  data: [{ id: 'sess-1', audio_r2_key: 'audio/sess-1.ogg' }],
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: updateEq,
            }),
          }
        }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(deleteObject).mockResolvedValue(undefined)

    const req = new NextRequest('http://localhost/api/maintenance/audio-retention', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-token' },
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(deleteObject).toHaveBeenCalledWith('audio/sess-1.ogg')
    expect(updateEq).toHaveBeenCalledWith('id', 'sess-1')
    expect(body).toMatchObject({ ok: true, scanned: 1, deleted: 1, retentionDays: 14 })
  })
})
