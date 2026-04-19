// __tests__/api/upload-pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/assemblyai', () => ({ createJob: vi.fn(), cancelJob: vi.fn() }))
vi.mock('@/lib/r2', () => ({ publicUrl: vi.fn(), presignedUploadUrl: vi.fn(), deleteObject: vi.fn() }))
vi.mock('@/lib/pipeline', () => ({ runClaudeAnalysis: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { createJob } from '@/lib/assemblyai'
import { publicUrl, presignedUploadUrl, deleteObject } from '@/lib/r2'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { getAuthenticatedUser } from '@/lib/auth'

beforeEach(() => {
  vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123', email: 'test@example.com' } as any)
})

// Chainable select chain: .select().eq().eq().single()
function makeSelectChain(data: Record<string, unknown> | null) {
  const chain: Record<string, unknown> = {
    single: vi.fn().mockResolvedValue({ data, error: null }),
  }
  chain.eq = vi.fn().mockReturnValue(chain)
  return chain
}

// Chainable update/delete chain: .update({}).eq().eq() — thenable so `await` resolves it
function makeUpdateChain() {
  const resolved = { error: null }
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    catch: (reject: (e: unknown) => unknown) => Promise.resolve(resolved).catch(reject),
    finally: (cb: () => void) => Promise.resolve(resolved).finally(cb),
  }
  chain.eq = vi.fn().mockReturnValue(chain)
  return chain
}

function makeMockDb(sessionData: Record<string, unknown>) {
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue(makeUpdateChain()),
      select: vi.fn().mockReturnValue(makeSelectChain(sessionData)),
      delete: vi.fn().mockReturnValue(makeUpdateChain()),
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

  it('ignores legacy speakers_expected in the body (AssemblyAI infers count)', async () => {
    vi.mocked(createServerClient).mockReturnValue(
      makeMockDb({ audio_r2_key: 'audio/uuid.mp3' }) as unknown as ReturnType<typeof createServerClient>
    )

    const { POST } = await import('@/app/api/sessions/[id]/upload-complete/route')
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ duration_seconds: 120, speakers_expected: 3 }),
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/sessions/[id]/upload-failed/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/sessions/:id/speaker', () => {
  it('returns 409 when session is not identifying', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(makeSelectChain({ status: 'ready' })),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(runClaudeAnalysis).mockResolvedValue(undefined)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ speaker_labels: ['A'] }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(409)
  })

  it('saves speaker label and returns analysing when status is identifying', async () => {
    const mockDb = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue(makeSelectChain({ status: 'identifying' })),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
      })),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(runClaudeAnalysis).mockResolvedValue(undefined)
    const { POST } = await import('@/app/api/sessions/[id]/speaker/route')
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ speaker_labels: ['A'] }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('analysing')
  })
})

describe('POST /api/sessions/:id/analyse', () => {
  it('returns 409 when analysis is already in progress', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(makeSelectChain({ status: 'analysing', error_stage: null })),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/analyse/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(409)
  })

  it('returns 400 when no transcript is available', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(makeSelectChain({ status: 'error', error_stage: 'uploading' })),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/analyse/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/sessions/:id/retry', () => {
  it('generates new upload URL for uploading stage', async () => {
    vi.mocked(presignedUploadUrl).mockResolvedValue({ key: 'audio/new.mp3', url: 'https://r2.example/new' })
    vi.mocked(deleteObject).mockResolvedValue(undefined)
    const mockDb = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue(makeSelectChain({
          error_stage: 'uploading', audio_r2_key: 'audio/old.mp3', assemblyai_job_id: null,
        })),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
      })),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/retry/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.upload_url).toBe('https://r2.example/new')
  })

  it('creates new AssemblyAI job for transcribing stage', async () => {
    vi.mocked(createJob).mockResolvedValue('new-job-id')
    vi.mocked(publicUrl).mockReturnValue('https://r2.example/audio.mp3')
    const mockDb = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue(makeSelectChain({
          error_stage: 'transcribing', audio_r2_key: 'audio/test.mp3', assemblyai_job_id: null,
        })),
        update: vi.fn().mockReturnValue(makeUpdateChain()),
      })),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    const { POST } = await import('@/app/api/sessions/[id]/retry/route')
    const req = new NextRequest('http://localhost', { method: 'POST' })
    const res = await POST(req, { params: { id: 'session-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('transcribing')
    expect(vi.mocked(createJob)).toHaveBeenCalledWith('https://r2.example/audio.mp3')
  })
})
