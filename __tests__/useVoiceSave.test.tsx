import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock useVoiceController so we can control its state in tests
const mockStart = vi.fn()
const mockEnd = vi.fn()
const mockToggleMute = vi.fn()
let mockControllerState = 'idle'
let capturedTranscriptConfig: { onTurn: (role: 'user' | 'model', text: string) => void } | undefined

vi.mock('@/components/VoiceController', () => ({
  useVoiceController: (transcriptConfig?: { onTurn: (role: 'user' | 'model', text: string) => void }) => {
    capturedTranscriptConfig = transcriptConfig
    return {
      state: mockControllerState as 'idle' | 'connecting' | 'active' | 'muted',
      toast: null,
      toastKey: 0,
      indicatorRef: { current: null },
      mobileIndicatorRef: { current: null },
      audioTickCallbacksRef: { current: new Set() },
      start: mockStart,
      toggleMute: mockToggleMute,
      end: mockEnd,
    }
  },
}))

// Mock router
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

// Mock fetch for /api/practice-sessions
global.fetch = vi.fn()

import { useVoiceSave } from '@/components/VoiceSave'

describe('useVoiceSave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockControllerState = 'idle'
  })

  it('passes transcriptConfig to useVoiceController', () => {
    renderHook(() => useVoiceSave())
    expect(capturedTranscriptConfig).toBeDefined()
    expect(typeof capturedTranscriptConfig?.onTurn).toBe('function')
  })

  it('reviewState is idle on mount', () => {
    const { result } = renderHook(() => useVoiceSave())
    expect(result.current.reviewState).toBe('idle')
  })

  it('opens review when session ends with user turns', () => {
    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())

    // Simulate a user turn arriving
    act(() => {
      capturedTranscriptConfig?.onTurn('user', 'Hola')
    })

    // Session ends — controller state goes idle
    mockControllerState = 'idle'
    rerender()

    expect(result.current.reviewState).toBe('review')
  })

  it('does NOT open review when session ends with no user turns', () => {
    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())

    // Only a model turn — no user speech
    act(() => {
      capturedTranscriptConfig?.onTurn('model', 'Hola, ¿cómo estás?')
    })

    mockControllerState = 'idle'
    rerender()

    expect(result.current.reviewState).toBe('idle')
  })

  it('discard() sets reviewState to idle and shows discardToast', () => {
    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())
    act(() => { capturedTranscriptConfig?.onTurn('user', 'Hola') })
    mockControllerState = 'idle'
    rerender()
    expect(result.current.reviewState).toBe('review')

    act(() => { result.current.discard() })
    expect(result.current.reviewState).toBe('idle')
    expect(result.current.discardToast).not.toBeNull()
  })

  it('undoDiscard() restores reviewState to review', () => {
    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())
    act(() => { capturedTranscriptConfig?.onTurn('user', 'Hola') })
    mockControllerState = 'idle'
    rerender()
    act(() => { result.current.discard() })
    act(() => { result.current.undoDiscard() })

    expect(result.current.reviewState).toBe('review')
    expect(result.current.discardToast).toBeNull()
  })

  it('resume() calls controller.start() and sets reviewState to idle', () => {
    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())
    act(() => { capturedTranscriptConfig?.onTurn('user', 'Hola') })
    mockControllerState = 'idle'
    rerender()

    act(() => { result.current.resume() })

    expect(mockStart).toHaveBeenCalledTimes(1)
    expect(result.current.reviewState).toBe('idle')
  })

  it('save() POSTs to /api/practice-sessions and navigates', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ session_id: 'abc-123' }),
    })

    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())
    act(() => { capturedTranscriptConfig?.onTurn('user', 'Hola') })
    mockControllerState = 'idle'
    rerender()

    await act(async () => { await result.current.save() })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/practice-sessions',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(mockPush).toHaveBeenCalledWith('/sessions/abc-123')
  })

  it('save() sets reviewState to error on fetch failure', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false })

    mockControllerState = 'active'
    const { result, rerender } = renderHook(() => useVoiceSave())
    act(() => { capturedTranscriptConfig?.onTurn('user', 'Hola') })
    mockControllerState = 'idle'
    rerender()

    await act(async () => { await result.current.save() })

    expect(result.current.reviewState).toBe('error')
  })
})
