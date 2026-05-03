import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/components/LanguageProvider'
import { useVoiceController } from '@/components/VoiceController'

vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(),
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}))

// Hoisted mutable nav state — `vi.mock` is lifted to the top of the module,
// so we can't close over a regular `let` here. `vi.hoisted` gives us a
// shared object that's safe to read from inside the factory and mutate
// from inside individual tests.
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
    navState.pathname = '/write'
    delete (window as unknown as { __ccSessionTitle?: string }).__ccSessionTitle
  })

  it('starts in idle state', () => {
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    expect(result.current.state).toBe('idle')
  })

  it('transitions idle → connecting → active', async () => {
    let cb: Parameters<typeof mockConnect>[2]
    mockConnect.mockImplementation((_l, _i, callbacks) => {
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
      [],
      expect.any(Object),
      { kind: 'write' }
    )
  })

  it('passes routeContext "session" with sessionTitle when on /sessions/[id] with window.__ccSessionTitle', async () => {
    navState.pathname = '/sessions/abc-123'
    ;(window as unknown as { __ccSessionTitle?: string }).__ccSessionTitle = 'Café con Mati'
    mockConnect.mockResolvedValue({ setMuted: vi.fn(), disconnect: vi.fn() })

    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })
    await waitFor(() => expect(mockConnect).toHaveBeenCalled())

    expect(mockConnect).toHaveBeenCalledWith(
      'es-AR',
      [],
      expect.any(Object),
      { kind: 'session', sessionTitle: 'Café con Mati' }
    )
  })

  it('disconnects on unmount', async () => {
    const disconnect = vi.fn()
    let cb: Parameters<typeof mockConnect>[2]
    mockConnect.mockImplementation((_l, _i, callbacks) => {
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
    // Resolve the promise after unmount — the in-flight start() should
    // notice `isMountedRef` is false and disconnect the freshly-arrived
    // agent itself rather than letting it leak.
    await act(async () => { resolveConnect({ setMuted: vi.fn(), disconnect }) })
    await waitFor(() => expect(disconnect).toHaveBeenCalledOnce())
  })

  it('returns to idle when permission is denied', async () => {
    mockConnect.mockRejectedValue(new Error('Permission denied by user'))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.toast).toMatch(/microphone/i)
  })

  it('shows generic toast for non-permission errors', async () => {
    mockConnect.mockRejectedValue(new Error('Network failure'))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.toast).toMatch(/voice session ended/i)
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

  it('mutes and unmutes', async () => {
    const setMuted = vi.fn()
    let cb: Parameters<typeof mockConnect>[2]
    mockConnect.mockImplementation((_l, _i, callbacks) => {
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
