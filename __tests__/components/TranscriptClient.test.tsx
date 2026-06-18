// __tests__/components/TranscriptClient.test.tsx
//
// Guards the auto-mark-read pulse on the session detail page. Opening a
// session from /review must POST /api/sessions/:id/view on first mount so the
// inbox row flips from unread → read. This regressed once when the effect was
// dropped alongside an unrelated title-editing removal — keep it covered.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/components/LanguageProvider'

const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: refreshMock }),
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

describe('TranscriptClient — auto-mark-read', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, alreadyViewed: false }),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('POSTs to /view on first mount so the inbox row marks as read', async () => {
    wrap(makeDetail({ session: { ...makeDetail().session, last_viewed_at: null } }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sessions/sess-1/view',
        { method: 'POST' },
      )
    })
  })

  it('refreshes the router after a fresh read so /review is not stale on back-nav', async () => {
    wrap(makeDetail({ session: { ...makeDetail().session, last_viewed_at: null } }))
    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
  })

  it('does not refresh when the session was already viewed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, alreadyViewed: true }),
    })
    wrap(makeDetail({ session: { ...makeDetail().session, last_viewed_at: '2026-01-01T00:00:00Z' } }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
