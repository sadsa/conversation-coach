// __tests__/components/InstallBanner.test.tsx
//
// Tests the dismissible home-page install nudge chip.
// Key rules from the ADR:
//   - Desktop (matchMedia min-width hits): never shown
//   - Already installed (useIsInstalled = true): never shown
//   - cc:install-dismissed in localStorage: never shown
//   - Mobile + not installed + not dismissed: shown with dismiss button
//   - Clicking dismiss hides the banner and writes cc:install-dismissed

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallBanner } from '@/components/InstallBanner'

// ── Dependency mocks ──────────────────────────────────────────────────────
vi.mock('@/hooks/useIsInstalled', () => ({
  useIsInstalled: vi.fn(() => false),
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
vi.mock('@/components/Icon', () => ({ Icon: () => null }))

import { useIsInstalled } from '@/hooks/useIsInstalled'
const mockUseIsInstalled = vi.mocked(useIsInstalled)

// ── matchMedia helpers ─────────────────────────────────────────────────────
function setMobile() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function setDesktop() {
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
}

beforeEach(() => {
  localStorage.clear()
  mockUseIsInstalled.mockReturnValue(false)
  setMobile()
})

describe('InstallBanner', () => {
  it('renders on mobile when not installed and not dismissed', () => {
    render(<InstallBanner />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('renders nothing on desktop', () => {
    setDesktop()
    const { container } = render(<InstallBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the app is already installed', () => {
    mockUseIsInstalled.mockReturnValue(true)
    const { container } = render(<InstallBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when cc:install-dismissed is set in localStorage', () => {
    localStorage.setItem('cc:install-dismissed', '1')
    const { container } = render(<InstallBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('hides the banner and writes cc:install-dismissed when dismissed', async () => {
    render(<InstallBanner />)
    const dismissBtn = screen.getByRole('button', { name: /install.bannerDismiss/i })
    await userEvent.click(dismissBtn)
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(localStorage.getItem('cc:install-dismissed')).toBe('1')
  })
})
