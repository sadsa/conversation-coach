// __tests__/api/webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/assemblyai', () => ({ parseWebhookBody: vi.fn(), getTranscript: vi.fn(), WEBHOOK_AUTH_HEADER_NAME: 'X-Webhook-Secret' }))
vi.mock('@/lib/pipeline', () => ({ runClaudeAnalysis: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { parseWebhookBody, getTranscript } from '@/lib/assemblyai'
import { runClaudeAnalysis } from '@/lib/pipeline'

const WEBHOOK_SECRET = 'test-secret'

function requestWithSecret(body: object, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify(body)
  return new NextRequest('http://localhost/api/webhooks/assemblyai', {
    method: 'POST',
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': secret,
    },
  })
}

beforeEach(() => {
  process.env.ASSEMBLYAI_WEBHOOK_SECRET = WEBHOOK_SECRET
  vi.mocked(getTranscript).mockResolvedValue({} as Record<string, unknown>)
})

describe('POST /api/webhooks/assemblyai', () => {
  it('returns 401 for invalid webhook secret', async () => {
    const { POST } = await import('@/app/api/webhooks/assemblyai/route')
    const req = requestWithSecret({ transcript_id: 'job1' }, 'wrong-secret')
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 and discards unknown job IDs', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)

    const { POST } = await import('@/app/api/webhooks/assemblyai/route')
    const req = requestWithSecret({ transcript_id: 'unknown-job' })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it('sets status to identifying for 2-speaker transcription', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null }),
          }),
        }),
        update: updateMock,
        insert: insertMock,
      })),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(parseWebhookBody).mockReturnValue({
      speakerCount: 2,
      segments: [
        { speaker: 'A', text: 'Hola', start_ms: 0, end_ms: 500, position: 0 },
        { speaker: 'B', text: 'Buenos días', start_ms: 600, end_ms: 1200, position: 1 },
      ],
    })

    const { POST } = await import('@/app/api/webhooks/assemblyai/route')
    const req = requestWithSecret({ transcript_id: 'known-job', status: 'completed', utterances: [] })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'identifying' }))
  })

  it('triggers Claude analysis immediately for single-speaker', async () => {
    vi.mocked(runClaudeAnalysis).mockResolvedValue(undefined)
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'session-1', user_id: 'user-123' }, error: null }),
          }),
        }),
        update: updateMock,
        insert: insertMock,
      })),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { user_metadata: { target_language: 'es-AR' } } },
            error: null,
          }),
        },
      },
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(parseWebhookBody).mockReturnValue({
      speakerCount: 1,
      segments: [{ speaker: 'A', text: 'Solo yo.', start_ms: 0, end_ms: 1000, position: 0 }],
    })

    const { POST } = await import('@/app/api/webhooks/assemblyai/route')
    const req = requestWithSecret({ transcript_id: 'known-job', status: 'completed', utterances: [] })
    await POST(req)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ user_speaker_labels: ['A'] }))
    expect(vi.mocked(runClaudeAnalysis)).toHaveBeenCalledWith('session-1', 'es-AR')
  })
})
