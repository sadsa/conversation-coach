import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OnboardingPage from '@/app/onboarding/page'

const mockPush = vi.fn()
const mockSetTargetLanguage = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({ setTargetLanguage: mockSetTargetLanguage }),
}))

describe('OnboardingPage', () => {
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

  it('redirects to / after confirming selection', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByText('Spanish'))
    await userEvent.click(screen.getByRole('button', { name: /get started/i }))
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('calls setTargetLanguage with the selected language on confirm', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByText('English'))
    await userEvent.click(screen.getByRole('button', { name: /get started/i }))
    expect(mockSetTargetLanguage).toHaveBeenCalledWith('en-NZ')
  })
})
