// __tests__/components/VoiceWidget.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VoiceWidget } from '@/components/VoiceWidget'
import { LanguageProvider } from '@/components/LanguageProvider'
import { ThemeProvider } from '@/components/ThemeProvider'
import type { PracticeItem } from '@/lib/types'

vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(),
  buildSystemPrompt: vi.fn(() => 'mocked prompt'),
}))

// jsdom doesn't implement localStorage by default — provide a minimal mock.
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

vi.mock('@/components/Toast', () => ({
  Toast: ({ message }: { message: string }) => <div role="alert">{message}</div>,
}))

const mockConnect = (await import('@/lib/voice-agent')).connect as ReturnType<typeof vi.fn>

function makeItem(overrides: Partial<PracticeItem> = {}): PracticeItem {
  return {
    id: 'item-1',
    session_id: 'sess-1',
    annotation_id: 'ann-1',
    type: 'grammar',
    original: 'fui',
    correction: 'anduve',
    explanation: '"Andar" for movement through a space.',
    sub_category: 'verb-conjugation',
    reviewed: false,
    written_down: false,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    flashcard_front: null,
    flashcard_back: null,
    flashcard_note: null,
    importance_score: 3,
    importance_note: null,
    segment_text: null,
    start_char: null,
    end_char: null,
    session_title: 'Test session',
    ...overrides,
  }
}

function wrap(items: PracticeItem[] = [makeItem()]) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <ThemeProvider>
        <VoiceWidget initialItems={items} />
      </ThemeProvider>
    </LanguageProvider>
  )
}

describe('VoiceWidget', () => {
  beforeEach(() => vi.resetAllMocks())

  it('renders nothing when there are no unwritten items', () => {
    const { container } = wrap([])
    expect(container.firstChild).toBeNull()
  })

  it('renders the idle mic bubble when items exist', () => {
    wrap()
    expect(screen.getByRole('button', { name: /start voice conversation/i })).toBeInTheDocument()
  })

  it('calls connect when the mic button is tapped', async () => {
    mockConnect.mockResolvedValue({
      updateFocus: vi.fn(),
      setMuted: vi.fn(),
      disconnect: vi.fn(),
    })
    wrap()
    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce())
  })

  it('shows expanded controls when session is active', async () => {
    let capturedCallbacks: Parameters<typeof mockConnect>[3]
    mockConnect.mockImplementation((_lang, _items, _focused, callbacks) => {
      capturedCallbacks = callbacks
      return Promise.resolve({
        updateFocus: vi.fn(),
        setMuted: vi.fn(),
        disconnect: vi.fn(),
      })
    })

    wrap()
    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))

    await waitFor(() => {
      capturedCallbacks!.onStateChange('active')
    })

    expect(screen.getByRole('button', { name: /end voice conversation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument()
  })

  it('calls updateFocus when next is tapped with two items', async () => {
    const updateFocus = vi.fn()
    let capturedCallbacks: Parameters<typeof mockConnect>[3]
    mockConnect.mockImplementation((_lang, _items, _focused, callbacks) => {
      capturedCallbacks = callbacks
      return Promise.resolve({ updateFocus, setMuted: vi.fn(), disconnect: vi.fn() })
    })

    const items = [makeItem({ id: 'item-1' }), makeItem({ id: 'item-2', original: 'tengo calor', correction: 'hace calor' })]
    wrap(items)
    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))
    await waitFor(() => { capturedCallbacks!.onStateChange('active') })

    fireEvent.click(screen.getByRole('button', { name: /next correction/i }))
    expect(updateFocus).toHaveBeenCalledWith(
      expect.objectContaining({ original: 'tengo calor' }),
      expect.any(Array),
      'es-AR'
    )
  })

  it('calls setMuted when mute button is tapped', async () => {
    const setMuted = vi.fn()
    let capturedCallbacks: Parameters<typeof mockConnect>[3]
    mockConnect.mockImplementation((_lang, _items, _focused, callbacks) => {
      capturedCallbacks = callbacks
      return Promise.resolve({ updateFocus: vi.fn(), setMuted, disconnect: vi.fn() })
    })

    wrap()
    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))
    await waitFor(() => { capturedCallbacks!.onStateChange('active') })

    fireEvent.click(screen.getByRole('button', { name: /mute microphone/i }))
    expect(setMuted).toHaveBeenCalledWith(true)
  })

  it('calls disconnect and collapses when end is tapped', async () => {
    const disconnect = vi.fn()
    let capturedCallbacks: Parameters<typeof mockConnect>[3]
    mockConnect.mockImplementation((_lang, _items, _focused, callbacks) => {
      capturedCallbacks = callbacks
      return Promise.resolve({ updateFocus: vi.fn(), setMuted: vi.fn(), disconnect })
    })

    wrap()
    fireEvent.click(screen.getByRole('button', { name: /start voice conversation/i }))
    await waitFor(() => { capturedCallbacks!.onStateChange('active') })

    fireEvent.click(screen.getByRole('button', { name: /end voice conversation/i }))
    expect(disconnect).toHaveBeenCalled()
  })
})
