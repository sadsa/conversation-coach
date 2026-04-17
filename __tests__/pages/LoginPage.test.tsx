import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '@/app/login/page'

const signInWithOtp = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signInWithOtp },
  }),
}))

vi.mock('@/components/LanguageProvider', () => ({
  // Identity-style mock: returns the key. Tests assert on key strings to
  // stay decoupled from copy churn.
  useTranslation: () => ({
    t: (key: string, replacements?: Record<string, string | number>) => {
      if (!replacements) return key
      return Object.entries(replacements).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        key,
      )
    },
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    signInWithOtp.mockClear()
  })

  it('disables submit when the field is empty', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: 'auth.submit' })).toBeDisabled()
  })

  // The project's vitest setup patches makeNormalizer in a way that breaks
  // getByLabelText / getByRole('textbox', { name }). Query by id directly.
  function getEmailInput(container: HTMLElement): HTMLInputElement {
    const el = container.querySelector('#email')
    if (!el) throw new Error('email input not found')
    return el as HTMLInputElement
  }

  it('disables submit when the email is malformed', async () => {
    const { container } = render(<LoginPage />)
    await userEvent.type(getEmailInput(container), 'bogus')
    expect(screen.getByRole('button', { name: 'auth.submit' })).toBeDisabled()
  })

  it('shows an inline validity hint after blur with a malformed email', async () => {
    const { container } = render(<LoginPage />)
    const input = getEmailInput(container)
    await userEvent.type(input, 'bogus')
    await userEvent.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('auth.invalidEmail')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('does NOT nag the user before they have interacted', () => {
    render(<LoginPage />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('enables submit and calls signInWithOtp for a valid email', async () => {
    const { container } = render(<LoginPage />)
    await userEvent.type(getEmailInput(container), 'me@example.com')
    const submit = screen.getByRole('button', { name: 'auth.submit' })
    expect(submit).not.toBeDisabled()
    await userEvent.click(submit)
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'me@example.com' }),
    )
  })

  it('trims whitespace before validating and submitting', async () => {
    const { container } = render(<LoginPage />)
    await userEvent.type(getEmailInput(container), '  me@example.com  ')
    await userEvent.click(screen.getByRole('button', { name: 'auth.submit' }))
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'me@example.com' }),
    )
  })

  it('shows the rate-limit error for over_email_send_rate_limit', async () => {
    signInWithOtp.mockResolvedValueOnce({
      error: { code: 'over_email_send_rate_limit', message: 'rate limit' },
    })
    const { container } = render(<LoginPage />)
    await userEvent.type(getEmailInput(container), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'auth.submit' }))
    expect(await screen.findByText('auth.error.rateLimit')).toBeInTheDocument()
  })

  it('shows the signup-disabled error for signup_disabled', async () => {
    signInWithOtp.mockResolvedValueOnce({
      error: { code: 'signup_disabled', message: 'signups not allowed' },
    })
    const { container } = render(<LoginPage />)
    await userEvent.type(getEmailInput(container), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'auth.submit' }))
    expect(
      await screen.findByText('auth.error.signupDisabled'),
    ).toBeInTheDocument()
  })

  it('falls back to a generic error for unknown failures', async () => {
    signInWithOtp.mockResolvedValueOnce({
      error: { code: 'something_weird', message: 'who knows' },
    })
    const { container } = render(<LoginPage />)
    await userEvent.type(getEmailInput(container), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'auth.submit' }))
    expect(await screen.findByText('auth.error.generic')).toBeInTheDocument()
  })

  it('shows the sent confirmation and offers to use a different email', async () => {
    const { container } = render(<LoginPage />)
    await userEvent.type(getEmailInput(container), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'auth.submit' }))
    expect(await screen.findByText(/auth\.linkSentTo/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'auth.useDifferentEmail' }),
    ).toBeInTheDocument()
  })
})
