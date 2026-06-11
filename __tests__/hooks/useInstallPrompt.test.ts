import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'

type InstallEvent = Event & { prompt: () => Promise<{ outcome: string }> }

function fireInstallPromptEvent(withPrompt = vi.fn().mockResolvedValue({ outcome: 'accepted' })) {
  const evt = new Event('beforeinstallprompt') as InstallEvent
  evt.prompt = withPrompt
  act(() => { window.dispatchEvent(evt) })
  return { evt, withPrompt }
}

describe('useInstallPrompt', () => {
  it('returns isSupported: false before the beforeinstallprompt event fires', () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.isSupported).toBe(false)
  })

  it('returns isSupported: true after the beforeinstallprompt event fires', () => {
    const { result } = renderHook(() => useInstallPrompt())
    fireInstallPromptEvent()
    expect(result.current.isSupported).toBe(true)
  })

  it('calling prompt() delegates to the captured event', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    const { withPrompt } = fireInstallPromptEvent()

    await act(async () => { await result.current.prompt() })

    expect(withPrompt).toHaveBeenCalledOnce()
  })

  it('isSupported resets to false after prompt() is called', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    fireInstallPromptEvent()
    expect(result.current.isSupported).toBe(true)

    await act(async () => { await result.current.prompt() })

    expect(result.current.isSupported).toBe(false)
  })
})
