// __tests__/components/LessonClient.test.tsx
//
// Tests the Study session component's public interface.
// The heavy WebSocket/audio machinery is mocked at module level.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { LanguageProvider } from '@/components/LanguageProvider'

// Capture the onStateChange callback so tests can drive lesson state transitions.
let capturedOnStateChange: ((s: string) => void) | null = null
const mockSendText = vi.fn()

vi.mock('@/lib/voice-agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/voice-agent')>()
  return {
    ...actual,
    connect: vi.fn().mockImplementation(async (_lang: string, callbacks: { onStateChange?: (s: string) => void }) => {
      capturedOnStateChange = callbacks.onStateChange ?? null
      return { disconnect: vi.fn(), setMuted: vi.fn(), flush: vi.fn(), sendText: mockSendText }
    }),
  }
})

vi.mock('@/lib/assemblyai-stream', () => ({
  connectAssemblyAIStream: vi.fn().mockResolvedValue({ disconnect: vi.fn(), pushPcm: vi.fn() }),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { LessonClient } from '@/components/LessonClient'
import type { LessonPhrase } from '@/lib/voice-agent'

const phrases: LessonPhrase[] = [
  { correction: 'me resulta difícil', explanation: 'Use instead of "es difícil para mí"', flashcard_front: null, flashcard_back: null },
  { correction: 'dale, vamos', explanation: 'Casual agreement', flashcard_front: null, flashcard_back: null },
]

function wrap(onExit = vi.fn()) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <LessonClient phrases={phrases} onExit={onExit} />
    </LanguageProvider>
  )
}

/** Trigger active state after the connect mock resolves. */
async function activateLesson() {
  await waitFor(() => expect(capturedOnStateChange).not.toBeNull())
  act(() => { capturedOnStateChange?.('active') })
  // Wait for card correction to appear
  await waitFor(() => screen.getByText('me resulta difícil'))
}

describe('LessonClient (Study mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnStateChange = null
    mockSendText.mockClear()
  })

  it('accepts a phrases array prop without error', () => {
    expect(() => wrap()).not.toThrow()
  })

  it('does not show the comfort-check review prompt', async () => {
    wrap()
    expect(screen.queryByText(/comfortable/i)).toBeNull()
    expect(screen.queryByText(/Feeling/i)).toBeNull()
  })

  it('does not render a transcript / chat log', async () => {
    wrap()
    await activateLesson()
    expect(document.querySelector('[role="log"]')).toBeNull()
  })

  it('renders first correction in the card', async () => {
    wrap()
    await activateLesson()
    expect(screen.getByText('me resulta difícil')).toBeInTheDocument()
  })

  it('renders first explanation in the card', async () => {
    wrap()
    await activateLesson()
    expect(screen.getByText('Use instead of "es difícil para mí"')).toBeInTheDocument()
  })

  it('shows pip progress row for ≤10 cards', async () => {
    wrap()
    await activateLesson()
    const pipRow = screen.getByTestId('pip-progress')
    expect(pipRow).toBeInTheDocument()
    // One pip per phrase
    expect(pipRow.querySelectorAll('[data-pip]').length).toBe(phrases.length)
  })

  it('advancing to next card sends formatStudyCardAdvance with card 2 content', async () => {
    const user = userEvent.setup()
    wrap()
    await activateLesson()
    await user.click(screen.getByTestId('advance-card'))
    expect(mockSendText).toHaveBeenCalledWith(expect.stringContaining('dale, vamos'))
    expect(mockSendText).toHaveBeenCalledWith(expect.stringContaining('2/2'))
  })

  it('advancing shows card 2 correction and explanation', async () => {
    const user = userEvent.setup()
    wrap()
    await activateLesson()
    await user.click(screen.getByTestId('advance-card'))
    await waitFor(() => screen.getByText('dale, vamos'))
    expect(screen.getByText('dale, vamos')).toBeInTheDocument()
    expect(screen.getByText('Casual agreement')).toBeInTheDocument()
  })

  it('going back from card 2 returns to card 1', async () => {
    const user = userEvent.setup()
    wrap()
    await activateLesson()
    await user.click(screen.getByTestId('advance-card'))
    await waitFor(() => screen.getByText('dale, vamos'))
    await user.click(screen.getByTestId('go-back-card'))
    await waitFor(() => screen.getByText('me resulta difícil'))
    expect(screen.getByText('me resulta difícil')).toBeInTheDocument()
  })

  it('going back sends formatStudyCardAdvance with the previous card index', async () => {
    const user = userEvent.setup()
    wrap()
    await activateLesson()
    await user.click(screen.getByTestId('advance-card'))
    await waitFor(() => screen.getByText('dale, vamos'))
    mockSendText.mockClear()
    await user.click(screen.getByTestId('go-back-card'))
    expect(mockSendText).toHaveBeenCalledWith(expect.stringContaining('me resulta difícil'))
    expect(mockSendText).toHaveBeenCalledWith(expect.stringContaining('1/2'))
  })

  it('going back on card 0 is a no-op (no sendText)', async () => {
    const user = userEvent.setup()
    wrap()
    await activateLesson()
    await user.click(screen.getByTestId('go-back-card'))
    expect(mockSendText).not.toHaveBeenCalled()
  })

  it('controls layer is hidden by default', async () => {
    wrap()
    await activateLesson()
    const layer = screen.getByTestId('controls-layer')
    expect(layer).toHaveAttribute('aria-hidden', 'true')
  })

  it('tapping outside the card reveals controls', async () => {
    const user = userEvent.setup()
    wrap()
    await activateLesson()
    const wrapper = screen.getByTestId('lesson-wrapper')
    await user.click(wrapper)
    const layer = screen.getByTestId('controls-layer')
    expect(layer).toHaveAttribute('aria-hidden', 'false')
  })

  it('advancing past last card enters complete state', async () => {
    const user = userEvent.setup()
    const onExit = vi.fn()
    wrap(onExit)
    await activateLesson()
    await user.click(screen.getByTestId('advance-card'))
    await waitFor(() => screen.getByText('dale, vamos'))
    await user.click(screen.getByTestId('advance-card'))
    await waitFor(() => screen.getByText(/studied all/i))
    expect(screen.getByText(/studied all/i)).toBeInTheDocument()
  })
})
