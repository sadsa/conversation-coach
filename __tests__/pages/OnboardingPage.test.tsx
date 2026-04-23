import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OnboardingPage from '@/app/onboarding/page'

const mockPush = vi.fn()
const mockSetTargetLanguage = vi.fn()

const mockSearchParams = { get: vi.fn((_key: string) => null) }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string, replacements?: Record<string, string | number>) => {
      if (!replacements) return key
      return (
        key +
        ':' +
        Object.entries(replacements)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
      )
    },
    setTargetLanguage: mockSetTargetLanguage,
  }),
}))

beforeEach(() => {
  mockPush.mockClear()
  mockSetTargetLanguage.mockClear()
  mockSearchParams.get.mockImplementation((_key: string) => null)
})

// ─── Step 0: language selection ───────────────────────────────────────────────

describe('OnboardingPage — step 0 (language select)', () => {
  it('renders the heading via i18n key (no hardcoded English)', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.languageSelect.heading')).toBeInTheDocument()
  })

  it('renders both language options via i18n keys', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.languageSelect.spanish')).toBeInTheDocument()
    expect(screen.getByText('onboarding.languageSelect.english')).toBeInTheDocument()
  })

  it('CTA reads from onboarding.languageSelect.cta and is disabled until a language is chosen', () => {
    render(<OnboardingPage />)
    const cta = screen.getByRole('button', { name: 'onboarding.languageSelect.cta' })
    expect(cta).toBeDisabled()
  })

  it('enables the CTA after selecting a language', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByText('onboarding.languageSelect.spanish'))
    expect(screen.getByRole('button', { name: 'onboarding.languageSelect.cta' })).not.toBeDisabled()
  })

  it('calls setTargetLanguage and redirects to step=1 after confirming', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByText('onboarding.languageSelect.english'))
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.languageSelect.cta' }))
    expect(mockSetTargetLanguage).toHaveBeenCalledWith('en-NZ')
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=1')
  })

  it('language radios use roving tabindex (only one in tab order)', () => {
    render(<OnboardingPage />)
    const radios = screen.getAllByRole('radio')
    const tabStops = radios.filter(r => r.getAttribute('tabindex') === '0')
    expect(tabStops).toHaveLength(1)
  })

  it('Arrow Down on a language radio moves selection AND focus to the next radio', async () => {
    render(<OnboardingPage />)
    const radios = screen.getAllByRole('radio')
    radios[0].focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(radios[1]).toHaveFocus()
    expect(radios[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('Arrow Up wraps from first radio back to last', async () => {
    render(<OnboardingPage />)
    const radios = screen.getAllByRole('radio')
    radios[0].focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(radios[radios.length - 1]).toHaveFocus()
  })
})

// ─── Tutorial step 1 (Upload) — was the old "step 2" ─────────────────────────

describe('OnboardingPage — tutorial step 1 (Upload)', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'step' ? '1' : null))
  })

  it('renders the upload heading from the semantic key', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.upload.heading')).toBeInTheDocument()
  })

  it('renders the Next CTA', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: 'onboarding.cta.next' })).toBeInTheDocument()
  })

  it('Next pushes to step=2', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.next' }))
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=2')
  })

  it('first tutorial step does NOT render a back button', () => {
    render(<OnboardingPage />)
    expect(screen.queryByRole('button', { name: /nav\.back/i })).not.toBeInTheDocument()
  })

  it('first-run renders a Skip exit (not Close) and Skip routes to /', async () => {
    render(<OnboardingPage />)
    const skip = screen.getByRole('button', { name: 'onboarding.skip' })
    await userEvent.click(skip)
    expect(mockPush).toHaveBeenCalledWith('/')
  })
})

// ─── Tutorial step 2 (Share) — was the old "step 3" ─────────────────────────

describe('OnboardingPage — tutorial step 2 (Share), first run', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'step' ? '2' : null))
  })

  it('renders the share heading from the semantic key', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.share.heading')).toBeInTheDocument()
  })

  it('renders the letsGo CTA on the last step (not done)', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: 'onboarding.cta.letsGo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'onboarding.cta.done' })).not.toBeInTheDocument()
  })

  it('letsGo pushes to /', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.letsGo' }))
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('renders a Back button that returns to step=1', async () => {
    render(<OnboardingPage />)
    const back = screen.getByRole('button', { name: /nav\.back/i })
    await userEvent.click(back)
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=1')
  })
})

describe('OnboardingPage — tutorial step 2 (Share), revisit', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'step') return '2'
      if (key === 'revisit') return 'true'
      return null
    })
  })

  it('renders the done CTA (not letsGo)', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: 'onboarding.cta.done' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'onboarding.cta.letsGo' })).not.toBeInTheDocument()
  })

  it('done pushes to /settings', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.done' }))
    expect(mockPush).toHaveBeenCalledWith('/settings')
  })

  it('Back from step 2 in revisit mode preserves revisit=true', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: /nav\.back/i }))
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=1&revisit=true')
  })

  it('renders a Close exit (not Skip) and Close routes to /settings', async () => {
    render(<OnboardingPage />)
    const close = screen.getByRole('button', { name: 'onboarding.close' })
    await userEvent.click(close)
    expect(mockPush).toHaveBeenCalledWith('/settings')
  })
})

describe('OnboardingPage — tutorial step 1, revisit', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'step') return '1'
      if (key === 'revisit') return 'true'
      return null
    })
  })

  it('Next preserves revisit=true when advancing', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.next' }))
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=2&revisit=true')
  })

  it('shows Close (revisit exit), not Skip', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: 'onboarding.close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'onboarding.skip' })).not.toBeInTheDocument()
  })
})

describe('OnboardingPage — out-of-range step values are clamped', () => {
  it('?step=99 is clamped to the last tutorial step (Share)', () => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'step' ? '99' : null))
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.share.heading')).toBeInTheDocument()
  })
})
