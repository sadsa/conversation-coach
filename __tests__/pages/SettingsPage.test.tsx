// __tests__/pages/SettingsPage.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPage from '@/app/settings/page'
import { LanguageProvider } from '@/components/LanguageProvider'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}))

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.fontSize = ''
})

describe('SettingsPage', () => {
  it('displays the default font size (16px) when nothing is stored', () => {
    render(<SettingsPage />)
    expect(screen.getByText('16px')).toBeInTheDocument()
  })

  it('displays the stored font size on mount', () => {
    localStorage.setItem('fontSize', '20')
    render(<SettingsPage />)
    expect(screen.getByText('20px')).toBeInTheDocument()
  })

  it('increments font size when + is clicked', async () => {
    localStorage.setItem('fontSize', '16')
    render(<SettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: '+' }))
    expect(screen.getByText('18px')).toBeInTheDocument()
    expect(localStorage.getItem('fontSize')).toBe('18')
    expect(document.documentElement.style.fontSize).toBe('18px')
  })

  it('decrements font size when − is clicked', async () => {
    localStorage.setItem('fontSize', '16')
    render(<SettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: '−' }))
    expect(screen.getByText('14px')).toBeInTheDocument()
    expect(localStorage.getItem('fontSize')).toBe('14')
    expect(document.documentElement.style.fontSize).toBe('14px')
  })

  it('disables the − button at the minimum size (14)', () => {
    localStorage.setItem('fontSize', '14')
    render(<SettingsPage />)
    expect(screen.getByRole('button', { name: '−' })).toBeDisabled()
  })

  it('disables the + button at the maximum size (22)', () => {
    localStorage.setItem('fontSize', '22')
    render(<SettingsPage />)
    expect(screen.getByRole('button', { name: '+' })).toBeDisabled()
  })

  it('renders a preview section', () => {
    render(<SettingsPage />)
    expect(screen.getByText(/Hoy fui al mercado/)).toBeInTheDocument()
  })

  it('defaults auto-open-first-correction toggle to enabled', () => {
    render(<SettingsPage />)
    expect(screen.getByRole('switch', { name: /open first correction automatically/i })).toBeChecked()
  })

  it('loads auto-open-first-correction toggle from localStorage when disabled', () => {
    localStorage.setItem('cc:review:auto-open-first-correction:v1', '0')
    render(<SettingsPage />)
    expect(screen.getByRole('switch', { name: /open first correction automatically/i })).not.toBeChecked()
  })

  it('persists auto-open-first-correction toggle changes to localStorage', async () => {
    render(<SettingsPage />)
    const toggle = screen.getByRole('switch', { name: /open first correction automatically/i })
    expect(toggle).toBeChecked()
    await userEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(localStorage.getItem('cc:review:auto-open-first-correction:v1')).toBe('0')
  })

  it('renders the App section with a version string', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Version')).toBeInTheDocument()
    // VERSION is either "local" or "local · <date>" in the test environment
    expect(screen.getByText(/local/)).toBeInTheDocument()
  })
})

describe('SettingsPage — Help section', () => {
  it('renders a Help section heading', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Help')).toBeInTheDocument()
  })

  it('renders a "How to upload audio" link pointing to the upload tutorial step', () => {
    render(<SettingsPage />)
    const link = screen.getByRole('link', { name: /how to upload audio/i })
    expect(link).toHaveAttribute('href', '/onboarding?step=1&revisit=true')
  })

  it('renders a "Share from WhatsApp" link deep-linking to the share tutorial step', () => {
    render(<SettingsPage />)
    const link = screen.getByRole('link', { name: /share from whatsapp/i })
    expect(link).toHaveAttribute('href', '/onboarding?step=2&revisit=true')
  })
})

describe('SettingsPage — live language update', () => {
  it('updates preview wording when target language changes to en-NZ', async () => {
    render(
      <LanguageProvider initialTargetLanguage="es-AR">
        <SettingsPage />
      </LanguageProvider>
    )
    // Default: English UI, Spanish preview text
    expect(screen.getByText(/Hoy fui al mercado/)).toBeInTheDocument()

    // Change to en-NZ (learning English → UI becomes Spanish)
    const select = screen.getByRole('combobox')
    await userEvent.selectOptions(select, 'en-NZ')

    // Preview text should now be English
    expect(screen.getByText(/Today I went to the market/)).toBeInTheDocument()
  })
})
