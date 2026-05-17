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

  // Onboarding collapsed to a single screen: the language pick IS the wizard.
  // Confirming the language commits the choice and lands the user on the
  // home dashboard with the peak-end welcome flag — there's no longer a
  // hub or tutorial step between here and the app.
  it('calls setTargetLanguage and redirects straight to / with welcome flag', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByText('onboarding.languageSelect.english'))
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.languageSelect.cta' }))
    expect(mockSetTargetLanguage).toHaveBeenCalledWith('en-NZ')
    expect(mockPush).toHaveBeenCalledWith('/?welcome=true')
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

// ─── Step 2: share illustration (standalone deep-dive) ───────────────────────
// The previous step=1 hub is gone — the share illustration is now a
// standalone page reached from the home page Share CTA. No Back button
// (there's nowhere to go back to within the wizard), no progress dots
// (totalSteps=1), and the exit returns to / without firing the welcome
// beat (that fired once when the language was first picked).

describe('OnboardingPage — share illustration (?step=2)', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'step' ? '2' : null))
  })

  it('renders the share heading from the semantic key', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.share.heading')).toBeInTheDocument()
  })

  it('uses the "done" CTA (collapsed flow has no first-run "letsGo" variant anymore)', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: 'onboarding.cta.done' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'onboarding.cta.letsGo' })).not.toBeInTheDocument()
  })

  it('CTA returns the user to / (no welcome flag — only the language pick fires the beat)', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.done' }))
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('does NOT render a Back button (the hub it used to belong to is gone)', () => {
    render(<OnboardingPage />)
    expect(screen.queryByRole('button', { name: /nav\.back/i })).not.toBeInTheDocument()
  })

  it('hides the progress dots row (single-step deep-dive, no sequence to indicate)', () => {
    render(<OnboardingPage />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('exit affordance reads as Close (not Skip — wizard chrome is gone)', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: 'onboarding.close' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'onboarding.skip' })).not.toBeInTheDocument()
  })
})

describe('OnboardingPage — share illustration (?step=2&revisit=true)', () => {
  // `revisit=true` is preserved for forward-compat with any future
  // Settings re-entry. No in-app surface sets it today, but if/when
  // Settings → Help returns the contract is: exit lands on /settings
  // instead of /.
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'step') return '2'
      if (key === 'revisit') return 'true'
      return null
    })
  })

  it('CTA routes to /settings when revisit=true', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.done' }))
    expect(mockPush).toHaveBeenCalledWith('/settings')
  })
})

describe('OnboardingPage — stale URLs fall through to the share illustration', () => {
  // ?step=1 used to render the hub. With the hub removed, stale
  // bookmarks (and the old Settings → Help → "Show me the tutorial"
  // link) land on the only remaining tutorial surface instead of
  // 404-ing or silently bouncing to /.
  it('?step=1 (legacy hub URL) clamps to the share illustration', () => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'step' ? '1' : null))
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.share.heading')).toBeInTheDocument()
  })

  it('?step=99 (out of range) also clamps to the share illustration', () => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'step' ? '99' : null))
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.share.heading')).toBeInTheDocument()
  })
})
