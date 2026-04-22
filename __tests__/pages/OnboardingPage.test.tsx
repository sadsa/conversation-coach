import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OnboardingPage from '@/app/onboarding/page'

const mockPush = vi.fn()
const mockSetTargetLanguage = vi.fn()

// searchParams is mutable per-test via mockSearchParams.get
const mockSearchParams = { get: vi.fn((_key: string) => null) }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}))
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) },
  }),
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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
  it('renders the heading', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('What are you learning?')).toBeInTheDocument()
  })

  it('renders both language options', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('Spanish')).toBeInTheDocument()
    expect(screen.getByText('English')).toBeInTheDocument()
  })

  it('Get started button is disabled until a language is selected', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: /get started/i })).toBeDisabled()
  })

  it('enables Get started after selecting a language', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByText('Spanish'))
    expect(screen.getByRole('button', { name: /get started/i })).not.toBeDisabled()
  })

  it('calls setTargetLanguage and redirects to step=1 after confirming', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByText('English'))
    await userEvent.click(screen.getByRole('button', { name: /get started/i }))
    expect(mockSetTargetLanguage).toHaveBeenCalledWith('en-NZ')
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=1')
  })
})

// ─── Steps 1–3: tutorial ──────────────────────────────────────────────────────

describe('OnboardingPage — step 1 (welcome)', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'step' ? '1' : null
    )
  })

  it('renders the step 1 heading key', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.step1.heading')).toBeInTheDocument()
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
})

describe('OnboardingPage — step 2 (upload)', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'step' ? '2' : null
    )
  })

  it('renders the step 2 heading key', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.step2.heading')).toBeInTheDocument()
  })

  it('Next pushes to step=3', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.next' }))
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=3')
  })
})

describe('OnboardingPage — step 3 (share), first run', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'step' ? '3' : null
    )
  })

  it('renders the step 3 heading key', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.step3.heading')).toBeInTheDocument()
  })

  it('renders the letsGo CTA (not done)', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: 'onboarding.cta.letsGo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'onboarding.cta.done' })).not.toBeInTheDocument()
  })

  it('letsGo pushes to /', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.letsGo' }))
    expect(mockPush).toHaveBeenCalledWith('/')
  })
})

describe('OnboardingPage — step 3 (share), revisit', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'step') return '3'
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
})

describe('OnboardingPage — step 1, revisit', () => {
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
})
