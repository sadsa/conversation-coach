// __tests__/lib/session-pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import {
  transitionToReady,
  transitionToAnalysisError,
  transitionToTranscribing,
  transitionToTranscribingError,
  transitionToIdentifying,
  transitionToAnalysing,
  transitionFromIdentifyingToAnalysing,
  transitionToReanalysing,
  transitionRetryToUploading,
  transitionRetryToTranscribing,
} from '@/lib/session-pipeline'

function makeDb(sessionExists: boolean, overrides: Record<string, unknown> = {}) {
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: updateEq })
  return {
    db: {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: sessionExists ? { id: 'sess-1', ...overrides } : null,
                  error: sessionExists ? null : { message: 'Not found' },
                }),
              }),
            }),
            update: updateMock,
          }
        }
        return {}
      }),
    } as unknown as ReturnType<typeof createServerClient>,
    updateMock,
    updateEq,
  }
}

describe('transitionToReady', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes status:ready, title, and processing_completed_at', async () => {
    const { db, updateMock } = makeDb(true)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToReady('sess-1', { title: 'Charla con Ana' })

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ready',
      title: 'Charla con Ana',
      processing_completed_at: expect.any(String),
    }))
  })

  it('returns not_found when session does not exist', async () => {
    const { db } = makeDb(false)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToReady('missing', { title: 'Whatever' })

    expect(result).toEqual({ ok: false, reason: 'not_found', detail: expect.any(String) })
  })
})

describe('transitionToTranscribing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes status:transcribing and assemblyai_job_id', async () => {
    const { db, updateMock } = makeDb(true)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToTranscribing('sess-1', { jobId: 'aai-job-123' })

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'transcribing',
      assemblyai_job_id: 'aai-job-123',
    }))
  })

  it('includes duration_seconds when provided', async () => {
    const { db, updateMock } = makeDb(true)
    vi.mocked(createServerClient).mockReturnValue(db)

    await transitionToTranscribing('sess-1', { jobId: 'aai-job-123', durationSeconds: 42 })

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ duration_seconds: 42 }))
  })

  it('omits duration_seconds when not provided', async () => {
    const { db, updateMock } = makeDb(true)
    vi.mocked(createServerClient).mockReturnValue(db)

    await transitionToTranscribing('sess-1', { jobId: 'aai-job-123' })

    const payload = updateMock.mock.calls[0][0] as Record<string, unknown>
    expect('duration_seconds' in payload).toBe(false)
  })
})

describe('transitionRetryToUploading', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes status:uploading, error_stage:null, audio_r2_key', async () => {
    const { db, updateMock } = makeDb(true)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionRetryToUploading('sess-1', { audioR2Key: 'audio/new-key.mp3' })

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({
      status: 'uploading',
      error_stage: null,
      audio_r2_key: 'audio/new-key.mp3',
    })
  })
})

describe('transitionRetryToTranscribing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes status:transcribing, error_stage:null, assemblyai_job_id', async () => {
    const { db, updateMock } = makeDb(true)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionRetryToTranscribing('sess-1', { jobId: 'aai-retry-456' })

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({
      status: 'transcribing',
      error_stage: null,
      assemblyai_job_id: 'aai-retry-456',
    })
  })
})

describe('transitionToReanalysing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes status:analysing, error_stage:null when session is ready', async () => {
    const { db, updateMock } = makeDb(true, { status: 'ready', error_stage: null })
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToReanalysing('sess-1')

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({ status: 'analysing', error_stage: null })
  })

  it('allows reanalysis when error_stage is analysing', async () => {
    const { db, updateMock } = makeDb(true, { status: 'error', error_stage: 'analysing' })
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToReanalysing('sess-1')

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({ status: 'analysing', error_stage: null })
  })

  it('returns invalid_transition when already analysing', async () => {
    const { db, updateMock } = makeDb(true, { status: 'analysing', error_stage: null })
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToReanalysing('sess-1')

    expect(result).toEqual({ ok: false, reason: 'invalid_transition', detail: expect.any(String) })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns no_transcript when error_stage is uploading', async () => {
    const { db, updateMock } = makeDb(true, { status: 'error', error_stage: 'uploading' })
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToReanalysing('sess-1')

    expect(result).toEqual({ ok: false, reason: 'no_transcript', detail: expect.any(String) })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns no_transcript when error_stage is transcribing', async () => {
    const { db, updateMock } = makeDb(true, { status: 'error', error_stage: 'transcribing' })
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToReanalysing('sess-1')

    expect(result).toEqual({ ok: false, reason: 'no_transcript', detail: expect.any(String) })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns invalid_transition when status is not ready and no error_stage', async () => {
    const { db, updateMock } = makeDb(true, { status: 'transcribing', error_stage: null })
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToReanalysing('sess-1')

    expect(result).toEqual({ ok: false, reason: 'invalid_transition', detail: expect.any(String) })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns not_found when session does not exist', async () => {
    const { db } = makeDb(false)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToReanalysing('missing')

    expect(result).toEqual({ ok: false, reason: 'not_found', detail: expect.any(String) })
  })
})

describe('transitionFromIdentifyingToAnalysing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes status:analysing and user_speaker_labels when session is identifying', async () => {
    const { db, updateMock } = makeDb(true, { status: 'identifying' })
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionFromIdentifyingToAnalysing('sess-1', { userSpeakerLabels: ['A'] })

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({
      status: 'analysing',
      user_speaker_labels: ['A'],
    })
  })

  it('returns invalid_transition when session is not identifying', async () => {
    const { db, updateMock } = makeDb(true, { status: 'transcribing' })
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionFromIdentifyingToAnalysing('sess-1', { userSpeakerLabels: ['B'] })

    expect(result).toEqual({ ok: false, reason: 'invalid_transition', detail: expect.any(String) })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('returns not_found when session does not exist', async () => {
    const { db } = makeDb(false)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionFromIdentifyingToAnalysing('missing', { userSpeakerLabels: ['A'] })

    expect(result).toEqual({ ok: false, reason: 'not_found', detail: expect.any(String) })
  })
})

describe('transitionToAnalysing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes status:analysing, detected_speaker_count:1, user_speaker_labels:[A]', async () => {
    const { db, updateMock } = makeDb(true)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToAnalysing('sess-1')

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({
      status: 'analysing',
      detected_speaker_count: 1,
      user_speaker_labels: ['A'],
    })
  })
})

describe('transitionToIdentifying', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes status:identifying and detected_speaker_count', async () => {
    const { db, updateMock } = makeDb(true)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToIdentifying('sess-1', { speakerCount: 3 })

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({
      status: 'identifying',
      detected_speaker_count: 3,
    })
  })
})

describe('transitionToTranscribingError', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes status:error, error_stage:transcribing', async () => {
    const { db, updateMock } = makeDb(true)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToTranscribingError('sess-1')

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({ status: 'error', error_stage: 'transcribing' })
  })
})

describe('transitionToAnalysisError', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes status:error, error_stage:analysing', async () => {
    const { db, updateMock } = makeDb(true)
    vi.mocked(createServerClient).mockReturnValue(db)

    const result = await transitionToAnalysisError('sess-1')

    expect(result).toEqual({ ok: true })
    expect(updateMock).toHaveBeenCalledWith({ status: 'error', error_stage: 'analysing' })
  })
})
