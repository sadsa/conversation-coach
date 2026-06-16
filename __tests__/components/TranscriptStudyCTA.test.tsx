// __tests__/components/TranscriptStudyCTA.test.tsx
//
// Tests the Study CTA integration on the transcript (session detail) page.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LanguageProvider } from '@/components/LanguageProvider'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/lib/voice-agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/voice-agent')>()
  return {
    ...actual,
    connect: vi.fn().mockResolvedValue({ disconnect: vi.fn(), setMuted: vi.fn(), flush: vi.fn() }),
  }
})
vi.mock('@/lib/assemblyai-stream', () => ({
  connectAssemblyAIStream: vi.fn().mockResolvedValue({ disconnect: vi.fn(), pushPcm: vi.fn() }),
}))

import { TranscriptClient } from '@/components/TranscriptClient'
import type { SessionDetail } from '@/lib/types'

function makeDetail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    session: {
      id: 'sess-1',
      title: 'Test session',
      status: 'ready',
      duration_seconds: 120,
      created_at: '2026-01-01T00:00:00Z',
      processing_completed_at: '2026-01-01T00:01:00Z',
      reviewed_at: null,
      last_viewed_at: null,
      user_speaker_labels: ['A'],
      session_type: 'upload',
    },
    segments: [],
    annotations: [],
    addedAnnotations: {},
    ...overrides,
  }
}

function wrap(detail: SessionDetail) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <TranscriptClient sessionId="sess-1" initialDetail={detail} />
    </LanguageProvider>
  )
}

describe('TranscriptClient — Study CTA', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('does not show Study CTA when no vocabulary items are saved', () => {
    wrap(makeDetail({ addedAnnotations: {} }))
    // The Study CTA button has aria-label containing "Study"
    expect(screen.queryByRole('button', { name: /study/i })).toBeNull()
  })

  it('shows Study CTA when at least one vocabulary item is saved', () => {
    wrap(makeDetail({
      addedAnnotations: { 'ann-1': 'pi-1' },
      annotations: [{
        id: 'ann-1',
        segment_id: 'seg-1',
        type: 'grammar',
        sub_category: 'verb_tense',
        original: 'fui',
        correction: 'había ido',
        explanation: 'Use pluperfect here',
        start_char: 0,
        end_char: 3,
        flashcard_front: null,
        flashcard_back: null,
        flashcard_note: null,
        importance_score: 2,
        is_unhelpful: false,
        unhelpful_at: null,
      }],
    }))
    expect(screen.getByRole('button', { name: /study/i })).toBeDefined()
  })
})
