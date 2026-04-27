// __tests__/lib/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/claude', () => ({ analyseUserTurns: vi.fn() }))
vi.mock('@/lib/r2', () => ({ deleteObject: vi.fn() }))
vi.mock('@/lib/push', () => ({ sendPushNotification: vi.fn() }))

import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import { sendPushNotification } from '@/lib/push'
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
                  data: { user_speaker_labels: ['B'], audio_r2_key: 'audio/test.mp3', original_filename: 'PTT-20260315.ogg' },
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
    vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test Session', annotations: [] })

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
                  data: { user_speaker_labels: ['A', 'B'], audio_r2_key: 'audio/test.mp3', original_filename: 'PTT-20260315.ogg' },
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
    vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test Session', annotations: [] })

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
                  data: { user_speaker_labels: ['A'], audio_r2_key: 'audio/test.mp3', original_filename: 'PTT-20260315.ogg' },
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
    vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test Session', annotations: [
      { segment_id: 'seg-1', type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.' },
    ] })

    await runClaudeAnalysis('session-1')

    expect(insertAnnotationsMock).toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready', title: 'Test Session', processing_completed_at: expect.any(String) }))
  })

  it('saves the generated title to the session on success', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { user_speaker_labels: ['A'], audio_r2_key: null, original_filename: null },
                error: null,
              }),
            }),
          }),
          update: updateMock,
        }
        if (table === 'transcript_segments') return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [{ id: 'seg-a', speaker: 'A', text: 'Hola.' }], error: null }),
            }),
          }),
        }
        if (table === 'annotations') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Charla con Ana', annotations: [] })

    await runClaudeAnalysis('session-title-test')

    // The final status update should include the generated title
    const updateCalls = updateMock.mock.calls
    const readyUpdate = updateCalls.find(([payload]: [Record<string, unknown>]) => payload.status === 'ready')
    expect(readyUpdate[0]).toMatchObject({ status: 'ready', title: 'Charla con Ana' })
  })

  it('inserts sub_category from Claude annotation', async () => {
    const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({
            data: { user_speaker_labels: ['A'], audio_r2_key: null, original_filename: null },
            error: null,
          }) }) }),
          update: updateMock,
        }
        if (table === 'transcript_segments') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({
            data: [{ id: 'seg-1', speaker: 'A', text: 'cuando vengas' }], error: null,
          }) }) }),
        }
        if (table === 'annotations') return { insert: insertAnnotationsMock }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test', annotations: [
      { segment_id: 'seg-1', type: 'grammar', sub_category: 'subjunctive', original: 'vengas', start_char: 8, end_char: 14, correction: 'venís', explanation: 'Voseo form.' },
    ] })

    await runClaudeAnalysis('sess-1')

    const insertedRows = insertAnnotationsMock.mock.calls[0][0]
    expect(insertedRows[0].sub_category).toBe('subjunctive')
  })

  it('resets sub_category to "other" when value is not in the taxonomy', async () => {
    const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({
            data: { user_speaker_labels: ['A'], audio_r2_key: null, original_filename: null },
            error: null,
          }) }) }),
          update: updateMock,
        }
        if (table === 'transcript_segments') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({
            data: [{ id: 'seg-1', speaker: 'A', text: 'Yo fui.' }], error: null,
          }) }) }),
        }
        if (table === 'annotations') return { insert: insertAnnotationsMock }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test', annotations: [
      { segment_id: 'seg-1', type: 'grammar', sub_category: 'made-up-category', original: 'Yo fui', start_char: 0, end_char: 6, correction: 'Fui', explanation: 'Drop pronoun.' },
    ] })

    await runClaudeAnalysis('sess-2')

    const insertedRows = insertAnnotationsMock.mock.calls[0][0]
    expect(insertedRows[0].sub_category).toBe('other')
  })

  it('resets sub_category to "other" when type mismatches the taxonomy', async () => {
    const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({
            data: { user_speaker_labels: ['A'], audio_r2_key: null, original_filename: null },
            error: null,
          }) }) }),
          update: updateMock,
        }
        if (table === 'transcript_segments') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({
            data: [{ id: 'seg-1', speaker: 'A', text: 'voseo example' }], error: null,
          }) }) }),
        }
        if (table === 'annotations') return { insert: insertAnnotationsMock }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    // 'voseo' is not in the taxonomy — should be reset to 'other'
    vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test', annotations: [
      { segment_id: 'seg-1', type: 'grammar', sub_category: 'voseo', original: 'voseo', start_char: 0, end_char: 5, correction: null, explanation: 'Good voseo.' },
    ] })

    await runClaudeAnalysis('sess-3')

    const insertedRows = insertAnnotationsMock.mock.calls[0][0]
    expect(insertedRows[0].sub_category).toBe('other')
  })

  it('passes through sub_category "other" regardless of annotation type', async () => {
    const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({
            data: { user_speaker_labels: ['A'], audio_r2_key: null, original_filename: null },
            error: null,
          }) }) }),
          update: updateMock,
        }
        if (table === 'transcript_segments') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({
            data: [{ id: 'seg-1', speaker: 'A', text: 'test sentence' }], error: null,
          }) }) }),
        }
        if (table === 'annotations') return { insert: insertAnnotationsMock }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue({ title: 'Test', annotations: [
      { segment_id: 'seg-1', type: 'grammar', sub_category: 'other', original: 'test', start_char: 0, end_char: 4, correction: 'test fix', explanation: 'Misc grammar issue.' },
    ] })

    await runClaudeAnalysis('sess-4')

    const insertedRows = insertAnnotationsMock.mock.calls[0][0]
    expect(insertedRows[0].sub_category).toBe('other')
  })

  it('writes flashcard fields from ClaudeAnnotation to annotations insert', async () => {
    const insertAnnotationsMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({
            data: { user_speaker_labels: ['A'], audio_r2_key: null, original_filename: null },
            error: null,
          }) }) }),
          update: updateMock,
        }
        if (table === 'transcript_segments') return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({
            data: [{ id: 'seg-1', speaker: 'A', text: 'Yo fui.' }], error: null,
          }) }) }),
        }
        if (table === 'annotations') return { insert: insertAnnotationsMock }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue({
      title: 'Test',
      annotations: [{
        segment_id: 'seg-1', type: 'grammar', original: 'Yo fui',
        start_char: 0, end_char: 6, correction: 'Fui',
        explanation: 'Drop pronoun.', sub_category: 'verb-conjugation',
        flashcard_front: 'I [[went]] to the market.',
        flashcard_back: '[[Fui]] al mercado.',
        flashcard_note: 'Subject pronouns are dropped in Rioplatense.',
      }],
    })

    await runClaudeAnalysis('sess-1')

    const insertedRows = insertAnnotationsMock.mock.calls[0][0]
    expect(insertedRows[0].flashcard_front).toBe('I [[went]] to the market.')
    expect(insertedRows[0].flashcard_back).toBe('[[Fui]] al mercado.')
    expect(insertedRows[0].flashcard_note).toBe('Subject pronouns are dropped in Rioplatense.')
  })

  it('calls sendPushNotification with sessionId and title on success', async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { user_speaker_labels: ['A'], audio_r2_key: null, original_filename: 'talk.ogg' },
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
                  data: [{ id: 'seg-a', speaker: 'A', text: 'Hola.' }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'annotations') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue({ annotations: [], title: 'Session Title' })

    await runClaudeAnalysis('session-1')

    expect(sendPushNotification).toHaveBeenCalledWith('session-1', 'Session Title')
  })

  it('keeps session audio in R2 after analysis', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const mockDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    user_speaker_labels: ['A'],
                    audio_r2_key: 'audio/keep-me.ogg',
                    original_filename: 'clip.ogg',
                  },
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
                  data: [{ id: 'seg-a', speaker: 'A', text: 'Hola.' }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'annotations') return { insert: vi.fn().mockResolvedValue({ error: null }) }
        return {}
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as unknown as ReturnType<typeof createServerClient>)
    vi.mocked(analyseUserTurns).mockResolvedValue({ annotations: [], title: 'Audio test' })

    await runClaudeAnalysis('session-audio')

    expect(deleteObject).not.toHaveBeenCalled()
    const updatePayloads = updateMock.mock.calls.map(([payload]) => payload as Record<string, unknown>)
    expect(updatePayloads.some(payload => Object.prototype.hasOwnProperty.call(payload, 'audio_r2_key'))).toBe(false)
  })
})
