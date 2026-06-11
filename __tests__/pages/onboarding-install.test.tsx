// __tests__/pages/onboarding-install.test.tsx
//
// Tests the onboarding page routing additions for the install nudge:
//   - step=3 renders InstallNudgeStep
//   - handleLanguageConfirm navigates to ?step=3 on mobile + not installed
//   - handleLanguageConfirm navigates to /?welcome=true when installed
//   - handleLanguageConfirm navigates to /?welcome=true on desktop

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OnboardingPage from '@/app/onboarding/page'

const mockPush = vi.fn()
const searchParamsStore = new Map<string, string>()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: (k: string) => searchParamsStore.get(k) ?? null }),
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({ t: (k: string) => k, setTargetLanguage: vi.fn() }),
}))
vi.mock('@/components/Icon', () => ({ Icon: () => null }))
vi.mock('@/hooks/useIsInstalled', () => ({
  useIsInstalled: vi.fn(() => false),
}))
vi.mock('@/hooks/useInstallPrompt', () => ({
  useInstallPrompt: vi.fn(() => ({ isSupported: false, prompt: vi.fn() })),
}))
vi.mock('@/components/IosInstallIllustration', () => ({
  IosInstallIllustration: () => <div data-testid="ios-illus" />,
}))
vi.mock('@/components/AndroidInstallIllustration', () => ({
  AndroidInstallIllustration: () => <div data-testid="android-illus" />,
}))

import { useIsInstalled } from '@/hooks/useIsInstalled'
const mockUseIsInstalled = vi.mocked(useIsInstalled)

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
  mockPush.mockClear()
  searchParamsStore.clear()
  mockUseIsInstalled.mockReturnValue(false)
  setMobile()
})

describe('Onboarding — step=3 renders install nudge', () => {
  it('renders the install nudge step when step=3', () => {
    searchParamsStore.set('step', '3')
    render(<OnboardingPage />)
    // InstallNudgeStep renders a skip button with our i18n key
    expect(screen.getByRole('button', { name: 'onboarding.install.skip' })).toBeInTheDocument()
  })
})

describe('Onboarding — language confirm routing', () => {
  beforeEach(() => {
    searchParamsStore.clear() // step=0 (language picker)
  })

  it('pushes to ?step=3 on mobile + not installed after language confirm', async () => {
    render(<OnboardingPage />)
    // Select a language first
    await userEvent.click(screen.getAllByRole('radio')[0])
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.languageSelect.cta' }))
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=3')
  })

  it('pushes to /?welcome=true on desktop (skip install nudge)', async () => {
    setDesktop()
    render(<OnboardingPage />)
    await userEvent.click(screen.getAllByRole('radio')[0])
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.languageSelect.cta' }))
    expect(mockPush).toHaveBeenCalledWith('/?welcome=true')
  })

  it('pushes to /?welcome=true when already installed', async () => {
    mockUseIsInstalled.mockReturnValue(true)
    render(<OnboardingPage />)
    await userEvent.click(screen.getAllByRole('radio')[0])
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.languageSelect.cta' }))
    expect(mockPush).toHaveBeenCalledWith('/?welcome=true')
  })
})
