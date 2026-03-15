// __tests__/api/upload-pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/assemblyai', () => ({ createJob: vi.fn(), cancelJob: vi.fn() }))
vi.mock('@/lib/r2', () => ({ publicUrl: vi.fn(), presignedUploadUrl: vi.fn(), deleteObject: vi.fn() }))
vi.mock('@/lib/pipeline', () => ({ runClaudeAnalysis: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { createJob } from '@/lib/assemblyai'
import { publicUrl, presignedUploadUrl, deleteObject } from '@/lib/r2'
import { runClaudeAnalysis } from '@/lib/pipeline'

function makeMockDb(sessionData: Record<string, unknown>) {
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: sessionData, error: null }),
        }),
      }),
    }),
  }
}

describe('POST /api/sessions/:id/upload-complete', () => {
  beforeEach(() => {
    vi.mocked(publicUrl).mockReturnValue('https://r2.example/audio/uuid.mp3')
    vi.mocked(createJob).mockResolvedValue('assemblyai-job-123')
  })

  it('triggers AssemblyAI and sets status to transcribing', async () => {
    vi.mocked(createServerClient).mockReturnValue(
      makeMockDb({ audio_r2_key: 'audio/uuid.mp3' }) as unknown as ReturnType<typeof createServerClient>
    )

    const { POST } = await import('@/app/api/sessions/[id]/upload-complete/route')
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ duration_seconds: 3600 }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    expect(vi.mocked(createJob)).toHaveBeenCalledWith('https://r2.example/audio/uuid.mp3')
  })
})

describe('POST /api/sessions/:id/upload-failed', () => {
  it('sets status to error with error_stage uploading', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/sessions/[id]/upload-failed/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
  })
})
