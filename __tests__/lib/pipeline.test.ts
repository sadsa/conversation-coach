// __tests__/lib/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/claude', () => ({ analyseUserTurns: vi.fn() }))
vi.mock('@/lib/r2', () => ({ deleteObject: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import { runClaudeAnalysis } from '@/lib/pipeline'

describe('runClaudeAnalysis', () => {
  it('filters segments by user_speaker_labels ["B"] only', async () => {
    const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { user_speaker_labels: ['B'], audio_r2_key: 'audio/test.mp3' },
                  error: null,
                }),
              }),
            }),
            update: updateMock,
          }
        }
        if (table === 'transcript_segments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'seg-a', speaker: 'A', text: 'Not me.' },
                    { id: 'seg-b', speaker: 'B', text: 'Soy yo.' },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'annotations') return { insert: insertAnnotationsMock }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue([])
    vi.mocked(deleteObject).mockResolvedValue(undefined)

    await runClaudeAnalysis('session-b')

    const [segments] = vi.mocked(analyseUserTurns).mock.calls.at(-1)!
    // Only the 'B' segment ('seg-b') should be passed; 'seg-a' (speaker A) must be excluded
    expect(segments).toHaveLength(1)
    expect(segments[0].id).toBe('seg-b')
  })

  it('includes all segments when user_speaker_labels is ["A", "B"]', async () => {
    const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { user_speaker_labels: ['A', 'B'], audio_r2_key: 'audio/test.mp3' },
                  error: null,
                }),
              }),
            }),
            update: updateMock,
          }
        }
        if (table === 'transcript_segments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'seg-a', speaker: 'A', text: 'Primera voz.' },
                    { id: 'seg-b', speaker: 'B', text: 'Segunda voz.' },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'annotations') return { insert: insertAnnotationsMock }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue([])
    vi.mocked(deleteObject).mockResolvedValue(undefined)

    await runClaudeAnalysis('session-ab')

    const [segments] = vi.mocked(analyseUserTurns).mock.calls.at(-1)!
    expect(segments).toHaveLength(2)
  })

  it('inserts annotations then sets status ready', async () => {
    const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { user_speaker_labels: ['A'], audio_r2_key: 'audio/test.mp3' },
                  error: null,
                }),
              }),
            }),
            update: updateMock,
          }
        }
        if (table === 'transcript_segments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [{ id: 'seg-1', speaker: 'A', text: 'Yo fui al mercado.' }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'annotations') return { insert: insertAnnotationsMock }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue([
      { segment_id: 'seg-1', type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.' },
    ])
    vi.mocked(deleteObject).mockResolvedValue(undefined)

    await runClaudeAnalysis('session-1')

    expect(insertAnnotationsMock).toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith({ status: 'ready' })
  })
})
