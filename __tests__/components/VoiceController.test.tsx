// __tests__/components/VoiceController.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { LanguageProvider } from '@/components/LanguageProvider'
import { useVoiceController } from '@/components/VoiceController'
import type { VoicePageContext } from '@/lib/voice-context'

vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(),
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}))

const navState = vi.hoisted(() => ({ pathname: '/write' as string }))

vi.mock('next/navigation', () => ({
  usePathname: () => navState.pathname,
}))

const mockConnect = (await import('@/lib/voice-agent')).connect as ReturnType<typeof vi.fn>

;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}) as unknown as MediaQueryList

function wrapper({ children }: { children: React.ReactNode }) {
  return <LanguageProvider initialTargetLanguage="es-AR">{children}</LanguageProvider>
}

describe('useVoiceController', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useRealTimers()
    navState.pathname = '/write'
    delete (window as unknown as { __ccVoiceContext?: VoicePageContext }).__ccVoiceContext
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    expect(result.current.state).toBe('idle')
  })

  it('transitions idle → connecting → active', async () => {
    let cb: Parameters<typeof mockConnect>[1]
    mockConnect.mockImplementation((_l, callbacks) => {
      cb = callbacks
      return Promise.resolve({ setMuted: vi.fn(), disconnect: vi.fn() })
    })
    const { result } = renderHook(() => useVoiceController(), { wrapper })

    await act(async () => { result.current.start() })
    expect(result.current.state).toBe('connecting')

    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce())
    act(() => { cb!.onStateChange('active') })
    expect(result.current.state).toBe('active')
  })

  it('passes routeContext "write" when pathname starts with /write', async () => {
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    expect(mockConnect).toHaveBeenCalledWith(
      'es-AR',
      expect.any(Object),
      { kind: 'write' },
      undefined,
      expect.any(Object)
    )
  })

  it('passes routeContext "session" and pageContext when on /sessions/[id] with __ccVoiceContext of kind session', async () => {
    navState.pathname = '/sessions/abc-123'
    const ctx: VoicePageContext = {
      kind: 'session',
      sessionTitle: 'Café con Mati',
      excerpts: [],
      annotations: [],
    }
    ;(window as unknown as { __ccVoiceContext?: VoicePageContext }).__ccVoiceContext = ctx
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })

    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    expect(mockConnect).toHaveBeenCalledWith(
      'es-AR',
      expect.any(Object),
      { kind: 'session', sessionTitle: 'Café con Mati' },
      ctx,
      expect.any(Object)
    )
  })

  it('passes write pageContext when on /write with __ccVoiceContext of kind write', async () => {
    navState.pathname = '/write'
    const ctx: VoicePageContext = {
      kind: 'write',
      items: [{ original: 'fui', correction: 'anduve', explanation: 'reason', segmentText: null, sessionTitle: null }],
    }
    ;(window as unknown as { __ccVoiceContext?: VoicePageContext }).__ccVoiceContext = ctx
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })

    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    expect(mockConnect).toHaveBeenCalledWith(
      'es-AR',
      expect.any(Object),
      { kind: 'write' },
      ctx,
      expect.any(Object)
    )
  })

  it('passes undefined pageContext when __ccVoiceContext is not set', async () => {
    navState.pathname = '/'
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })

    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    const call = mockConnect.mock.calls[0]
    expect(call[3]).toBeUndefined()
  })

  it('does not update the agent after connect even if __ccVoiceContext changes (pin-at-connect)', async () => {
    const ctx: VoicePageContext = { kind: 'write', items: [{ original: 'x', correction: 'y', explanation: 'z', segmentText: null, sessionTitle: null }] }
    ;(window as unknown as { __ccVoiceContext?: VoicePageContext }).__ccVoiceContext = ctx
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })

    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalledOnce())

    // Mutate the global after connect.
    delete (window as unknown as { __ccVoiceContext?: VoicePageContext }).__ccVoiceContext

    // A re-render does not trigger another connect().
    expect(mockConnect).toHaveBeenCalledOnce()
  })

  it('disconnects on unmount', async () => {
    const disconnect = vi.fn()
    let cb: Parameters<typeof mockConnect>[1]
    mockConnect.mockImplementation((_l, callbacks) => {
      cb = callbacks
      return Promise.resolve({ setMuted: vi.fn(), disconnect })
    })
    const { result, unmount } = renderHook(() => useVoiceController(), { wrapper })

    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())
    act(() => { cb!.onStateChange('active') })

    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('disconnects the agent if unmounted mid-connect', async () => {
    const disconnect = vi.fn()
    let resolveConnect: (a: unknown) => void = () => {}
    mockConnect.mockImplementation(() => new Promise((r) => { resolveConnect = r }))
    const { result, unmount } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    unmount()
    await act(async () => { resolveConnect({ setMuted: vi.fn(), disconnect }) })
    await waitFor(() => expect(disconnect).toHaveBeenCalledOnce())
  })

  it('returns to idle when permission is denied (toast NOT retryable)', async () => {
    mockConnect.mockRejectedValue(new Error('Permission denied by user'))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.toast?.message).toMatch(/microphone/i)
    expect(result.current.toast?.retryable).toBe(false)
  })

  it('marks generic transport errors as retryable', async () => {
    mockConnect.mockRejectedValue(new Error('Network failure'))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.toast?.message).toMatch(/voice session ended/i)
    expect(result.current.toast?.retryable).toBe(true)
  })

  it('start() is a no-op when already connecting', async () => {
    let resolveConnect: (a: unknown) => void = () => {}
    mockConnect.mockImplementation(() => new Promise((r) => { resolveConnect = r }))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await act(async () => { result.current.start() })
    expect(mockConnect).toHaveBeenCalledOnce()
    resolveConnect({ setMuted: vi.fn(), disconnect: vi.fn() })
  })

  it('toastKey increments when a toast is shown', async () => {
    mockConnect.mockRejectedValue(new Error('Permission denied'))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    const initialKey = result.current.toastKey
    await act(async () => { result.current.start() })
    await waitFor(() => expect(result.current.toast).toBeTruthy())
    expect(result.current.toastKey).toBeGreaterThan(initialKey)
  })

  it('survives React Strict Mode mount/unmount/remount cycle', async () => {
    const disconnect = vi.fn()
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect })

    function strictWrapper({ children }: { children: React.ReactNode }) {
      return (
        <StrictMode>
          <LanguageProvider initialTargetLanguage="es-AR">{children}</LanguageProvider>
        </StrictMode>
      )
    }

    const { result } = renderHook(() => useVoiceController(), { wrapper: strictWrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    expect(disconnect).not.toHaveBeenCalled()
  })

  it('mutes and unmutes', async () => {
    const setMuted = vi.fn()
    let cb: Parameters<typeof mockConnect>[1]
    mockConnect.mockImplementation((_l, callbacks) => {
      cb = callbacks
      return Promise.resolve({ setMuted, disconnect: vi.fn() })
    })
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())
    act(() => { cb!.onStateChange('active') })

    act(() => { result.current.toggleMute() })
    expect(result.current.state).toBe('muted')
    expect(setMuted).toHaveBeenCalledWith(true)

    act(() => { result.current.toggleMute() })
    expect(result.current.state).toBe('active')
    expect(setMuted).toHaveBeenLastCalledWith(false)
  })
})
