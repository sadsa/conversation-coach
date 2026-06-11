// __tests__/components/InstallNudgeStep.test.tsx
//
// Covers the onboarding step 3 shell:
//  - iOS branch: IosInstallIllustration + "Got it" primary CTA
//  - Android branch: AndroidInstallIllustration + "Install" primary CTA
//  - Both primary CTAs push to /?welcome=true
//  - "Maybe Later" secondary CTA also pushes to /?welcome=true

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallNudgeStep } from '@/components/InstallNudgeStep'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
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

import { useInstallPrompt } from '@/hooks/useInstallPrompt'
const mockUseInstallPrompt = vi.mocked(useInstallPrompt)

function setIosUA() {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  })
}

function setAndroidUA() {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  })
}

beforeEach(() => {
  mockPush.mockClear()
  localStorage.clear()
  setAndroidUA()
})

describe('InstallNudgeStep — Android branch', () => {
  beforeEach(() => {
    mockUseInstallPrompt.mockReturnValue({ isSupported: true, prompt: vi.fn() })
  })

  it('shows the Android illustration', () => {
    render(<InstallNudgeStep />)
    expect(screen.getByTestId('android-illus')).toBeInTheDocument()
  })

  it('shows "Install" as the primary CTA', () => {
    render(<InstallNudgeStep />)
    expect(screen.getByRole('button', { name: 'onboarding.install.ctaInstall' })).toBeInTheDocument()
  })

  it('Install CTA calls prompt() then navigates to /?welcome=true', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    mockUseInstallPrompt.mockReturnValue({ isSupported: true, prompt })
    render(<InstallNudgeStep />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.install.ctaInstall' }))
    expect(prompt).toHaveBeenCalledOnce()
    expect(mockPush).toHaveBeenCalledWith('/?welcome=true')
  })

  it('Install CTA sets cc:install-dismissed', async () => {
    render(<InstallNudgeStep />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.install.ctaInstall' }))
    expect(localStorage.getItem('cc:install-dismissed')).toBe('1')
  })
})

describe('InstallNudgeStep — Android without native prompt', () => {
  beforeEach(() => {
    mockUseInstallPrompt.mockReturnValue({ isSupported: false, prompt: vi.fn() })
  })

  it('shows "Got it" when beforeinstallprompt has not fired', () => {
    render(<InstallNudgeStep />)
    expect(screen.getByRole('button', { name: 'onboarding.install.ctaGotIt' })).toBeInTheDocument()
  })

  it('does not call prompt() when isSupported is false', async () => {
    const prompt = vi.fn()
    mockUseInstallPrompt.mockReturnValue({ isSupported: false, prompt })
    render(<InstallNudgeStep />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.install.ctaGotIt' }))
    expect(prompt).not.toHaveBeenCalled()
  })
})

describe('InstallNudgeStep — iOS branch', () => {
  beforeEach(() => {
    setIosUA()
    mockUseInstallPrompt.mockReturnValue({ isSupported: false, prompt: vi.fn() })
  })

  it('shows the iOS illustration', () => {
    render(<InstallNudgeStep />)
    expect(screen.getByTestId('ios-illus')).toBeInTheDocument()
  })

  it('shows "Got it" as the primary CTA', () => {
    render(<InstallNudgeStep />)
    expect(screen.getByRole('button', { name: 'onboarding.install.ctaGotIt' })).toBeInTheDocument()
  })

  it('Got it CTA navigates to /?welcome=true', async () => {
    render(<InstallNudgeStep />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.install.ctaGotIt' }))
    expect(mockPush).toHaveBeenCalledWith('/?welcome=true')
  })

  it('Got it CTA sets cc:install-dismissed', async () => {
    render(<InstallNudgeStep />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.install.ctaGotIt' }))
    expect(localStorage.getItem('cc:install-dismissed')).toBe('1')
  })
})

describe('InstallNudgeStep — Maybe Later', () => {
  it('navigates to /?welcome=true on Android', async () => {
    mockUseInstallPrompt.mockReturnValue({ isSupported: true, prompt: vi.fn() })
    render(<InstallNudgeStep />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.install.skip' }))
    expect(mockPush).toHaveBeenCalledWith('/?welcome=true')
  })

  it('navigates to /?welcome=true on iOS', async () => {
    setIosUA()
    mockUseInstallPrompt.mockReturnValue({ isSupported: false, prompt: vi.fn() })
    render(<InstallNudgeStep />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.install.skip' }))
    expect(mockPush).toHaveBeenCalledWith('/?welcome=true')
  })

  it('sets cc:install-dismissed on skip', async () => {
    mockUseInstallPrompt.mockReturnValue({ isSupported: true, prompt: vi.fn() })
    render(<InstallNudgeStep />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.install.skip' }))
    expect(localStorage.getItem('cc:install-dismissed')).toBe('1')
  })
})
