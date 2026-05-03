import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { LanguageProvider } from '@/components/LanguageProvider'
import { useVoiceController } from '@/components/VoiceController'

vi.mock('@/lib/voice-agent', () => ({
  connect: vi.fn(),
  buildSystemPrompt: vi.fn(() => 'mock prompt'),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/write',
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

  it('returns to idle when permission is denied', async () => {
    mockConnect.mockRejectedValue(new Error('Permission denied by user'))
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    await act(async () => { result.current.start() })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.toast).toMatch(/microphone/i)
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
