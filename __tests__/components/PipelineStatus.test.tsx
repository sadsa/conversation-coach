// __tests__/components/PipelineStatus.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineStatus } from '@/components/PipelineStatus'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

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
