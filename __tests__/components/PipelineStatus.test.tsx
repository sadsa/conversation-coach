// __tests__/components/PipelineStatus.test.tsx
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { PipelineStatus } from '@/components/PipelineStatus'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/usePushNotifications', () => ({ usePushNotifications: vi.fn() }))

// Prevent useEffect fetch calls from throwing unhandled rejections in jsdom,
// which lacks a base URL and causes "Failed to parse URL" errors.
beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'transcribing' }) })))
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('PipelineStatus', () => {
  it('shows the current stage label', () => {
    render(
      <PipelineStatus
        sessionId="s1"
        initialStatus="transcribing"
        initialErrorStage={null}
        durationSeconds={3600}
      />
    )
    expect(screen.getByText(/Transcribing/i)).toBeInTheDocument()
  })

  it('shows estimated time when duration is available', () => {
    render(
      <PipelineStatus
        sessionId="s1"
        initialStatus="transcribing"
        initialErrorStage={null}
        durationSeconds={3600}
      />
    )
    // 3600s / 60 * 1.5 = 90 minutes
    expect(screen.getByText(/90 min/i)).toBeInTheDocument()
  })

  it('shows error message when status is error', () => {
    render(
      <PipelineStatus
        sessionId="s1"
        initialStatus="error"
        initialErrorStage="transcribing"
        durationSeconds={null}
      />
    )
    expect(screen.getByText(/transcription failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})

describe('PipelineStatus - analysis retry button', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: 'analysing', error_stage: null }),
    })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not show retry button immediately in analysing state', () => {
    render(
      <PipelineStatus sessionId="s1" initialStatus="analysing" initialErrorStage={null} durationSeconds={null} />
    )
    expect(screen.queryByRole('button', { name: /retry analysis/i })).not.toBeInTheDocument()
  })

  it('shows retry button and message after 60 seconds', async () => {
    render(
      <PipelineStatus sessionId="s1" initialStatus="analysing" initialErrorStage={null} durationSeconds={null} />
    )
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry analysis/i })).toBeInTheDocument()
  })

  it('calls POST /analyse endpoint when retry button is clicked', async () => {
    const fetchMock = vi.mocked(fetch)
    render(
      <PipelineStatus sessionId="s1" initialStatus="analysing" initialErrorStage={null} durationSeconds={null} />
    )
    await act(async () => { vi.advanceTimersByTime(60_000) })
    fetchMock.mockClear()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry analysis/i }))
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions/s1/analyse', { method: 'POST' })
  })
})
