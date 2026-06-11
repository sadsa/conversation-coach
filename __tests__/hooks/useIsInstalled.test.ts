import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useIsInstalled } from '@/hooks/useIsInstalled'

describe('useIsInstalled', () => {
  afterEach(() => {
    // restore navigator.standalone to undefined after each test
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: undefined })
    // restore matchMedia to the jsdom default (non-standalone)
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes('min-width'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  })

  it('returns false in a normal browser (no standalone signal)', () => {
    const { result } = renderHook(() => useIsInstalled())
    expect(result.current).toBe(false)
  })

  it('returns true when navigator.standalone is true (iOS PWA)', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    const { result } = renderHook(() => useIsInstalled())
    expect(result.current).toBe(true)
  })

  it('returns true when display-mode: standalone media query matches (Android / Chrome PWA)', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
    const { result } = renderHook(() => useIsInstalled())
    expect(result.current).toBe(true)
  })
})
