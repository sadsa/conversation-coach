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
  // Wait for card hero to appear (button text, not aria-label)
  await waitFor(() => screen.getByText(/Got it/))
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

  it('shows card eyebrow with position when active', async () => {
    wrap()
    await activateLesson()
    expect(screen.getByText('Card 1 of 2')).toBeInTheDocument()
  })

  it('renders first correction in the card hero', async () => {
    wrap()
    await activateLesson()
    expect(screen.getByText('me resulta difícil')).toBeInTheDocument()
  })

  it('renders first explanation in the card hero', async () => {
    wrap()
    await activateLesson()
    expect(screen.getByText('Use instead of "es difícil para mí"')).toBeInTheDocument()
  })

  it('"Got it" button is present and enabled when active', async () => {
    wrap()
    await activateLesson()
    const btn = screen.getByText(/Got it/)
    expect(btn.closest('button')).not.toBeDisabled()
  })

  it('clicking "Got it" on card 1 sends advancement text to the agent', async () => {
    const user = userEvent.setup()
    wrap()
    await activateLesson()
    await user.click(screen.getByText(/Got it/))
    // es-AR target → Spanish advancement message
    expect(mockSendText).toHaveBeenCalledWith(
      expect.stringContaining('Carta 2')
    )
  })

  it('clicking "Got it" on last card calls onExit', async () => {
    const user = userEvent.setup()
    const onExit = vi.fn()
    wrap(onExit)
    await activateLesson()
    // Advance past card 1 → card 2
    await user.click(screen.getByText(/Got it/))
    // Now on last card — click again to exit
    await user.click(screen.getByText(/Got it/))
    expect(onExit).toHaveBeenCalled()
  })
})
