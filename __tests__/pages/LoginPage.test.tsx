import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '@/app/login/page'

const signInWithOtp = vi.fn().mockResolvedValue({ error: null })
const signInWithOAuth = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { signInWithOtp, signInWithOAuth },
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
    signInWithOAuth.mockClear()
    localStorage.clear()
  })

  // The project's vitest setup patches makeNormalizer in a way that breaks
  // getByLabelText / getByRole('textbox', { name }). Query by id directly.
  function getEmailInput(container: HTMLElement): HTMLInputElement {
    const el = container.querySelector('#email')
    if (!el) throw new Error('email input not found')
    return el as HTMLInputElement
  }

  // First-time view: the email form is now gated behind a provider
  // chooser tap. Tests that exercise the form must open it first.
  async function openEmailForm() {
    await userEvent.click(
      screen.getByRole('button', { name: 'auth.emailMeSignInLink' }),
    )
  }

  it('initial view shows the provider chooser, NOT the email form', () => {
    const { container } = render(<LoginPage />)
    expect(
      screen.getByRole('button', { name: /auth\.continueWithGoogle/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'auth.emailMeSignInLink' }),
    ).toBeInTheDocument()
    expect(container.querySelector('#email')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'auth.submit' }),
    ).not.toBeInTheDocument()
  })

  it('reveals the email form and focuses the input when the Email CTA is tapped', async () => {
    const { container } = render(<LoginPage />)
    await openEmailForm()
    const input = getEmailInput(container)
    expect(input).toBeInTheDocument()
    // autoFocus on the freshly-mounted input lands focus on the field
    // so the user can start typing immediately — no extra tap.
    expect(document.activeElement).toBe(input)
    expect(
      screen.getByRole('button', { name: 'auth.submit' }),
    ).toBeInTheDocument()
  })

  it('offers a "use a different method" link inside the email form that returns to the chooser', async () => {
    const { container } = render(<LoginPage />)
    await openEmailForm()
    expect(getEmailInput(container)).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'auth.useDifferentMethod' }),
    )
    // Form is gone, chooser is back.
    expect(container.querySelector('#email')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'auth.emailMeSignInLink' }),
    ).toBeInTheDocument()
  })

  it('disables submit when the field is empty', async () => {
    render(<LoginPage />)
    await openEmailForm()
    expect(screen.getByRole('button', { name: 'auth.submit' })).toBeDisabled()
  })

  it('disables submit when the email is malformed', async () => {
    const { container } = render(<LoginPage />)
    await openEmailForm()
    await userEvent.type(getEmailInput(container), 'bogus')
    expect(screen.getByRole('button', { name: 'auth.submit' })).toBeDisabled()
  })

  it('shows an inline validity hint after blur with a malformed email', async () => {
    const { container } = render(<LoginPage />)
    await openEmailForm()
    const input = getEmailInput(container)
    await userEvent.type(input, 'bogus')
    await userEvent.tab()
    expect(screen.getByRole('alert')).toHaveTextContent('auth.invalidEmail')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('does NOT nag the user before they have interacted', async () => {
    render(<LoginPage />)
    await openEmailForm()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('enables submit and calls signInWithOtp for a valid email', async () => {
    const { container } = render(<LoginPage />)
    await openEmailForm()
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
    await openEmailForm()
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
    await openEmailForm()
    await userEvent.type(getEmailInput(container), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'auth.submit' }))
    expect(await screen.findByText('auth.error.rateLimit')).toBeInTheDocument()
  })

  it('shows the signup-disabled error for signup_disabled', async () => {
    signInWithOtp.mockResolvedValueOnce({
      error: { code: 'signup_disabled', message: 'signups not allowed' },
    })
    const { container } = render(<LoginPage />)
    await openEmailForm()
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
    await openEmailForm()
    await userEvent.type(getEmailInput(container), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'auth.submit' }))
    expect(await screen.findByText('auth.error.generic')).toBeInTheDocument()
  })

  it('shows the sent confirmation and offers to use a different email', async () => {
    const { container } = render(<LoginPage />)
    await openEmailForm()
    await userEvent.type(getEmailInput(container), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'auth.submit' }))
    expect(await screen.findByText(/auth\.linkSentTo/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'auth.useDifferentEmail' }),
    ).toBeInTheDocument()
  })

  it('persists the magic-link provider after a successful send', async () => {
    const { container } = render(<LoginPage />)
    await openEmailForm()
    await userEvent.type(getEmailInput(container), 'me@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'auth.submit' }))
    await screen.findByText(/auth\.linkSentTo/)
    expect(localStorage.getItem('cc:login-email')).toBe('me@example.com')
    expect(localStorage.getItem('cc:login-provider')).toBe('email')
  })

  // Google click writes the provider OPTIMISTICALLY (before the OAuth
  // redirect) — relying on the callback to recover it from
  // `app_metadata.provider` proved flaky in practice. Email is NOT
  // written here because we don't yet know which Google account the
  // user will pick; the callback fills it in from the confirmed
  // session. The first-time CTA also forces Google's account picker
  // via `prompt=select_account` — otherwise a single-signed-in
  // browser auto-redirects back as the cached account, defeating
  // "Use a different account".
  it('writes the provider optimistically and forces the account picker when first-time Google is tapped', async () => {
    render(<LoginPage />)
    await userEvent.click(
      screen.getByRole('button', { name: /auth\.continueWithGoogle/ }),
    )
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
    expect(localStorage.getItem('cc:login-provider')).toBe('google')
    expect(localStorage.getItem('cc:login-email')).toBeNull()
  })
})

describe('LoginPage · quick-select (returning user)', () => {
  beforeEach(() => {
    signInWithOtp.mockClear()
    signInWithOAuth.mockClear()
    localStorage.clear()
  })

  // The "Continue as" pill renders the verb above the email visually
  // but the button's accessible name is the natural concatenation
  // ("Continue with Google as josh@example.com"). With the identity-
  // style t() mock the verb resolves to its key, so we assert on
  // `<verb-key> <email>` — that's what a screen reader would announce
  // in test, and what testing-library's getByRole computes.

  it('shows the Google "Continue as" chrome when last provider was google', () => {
    localStorage.setItem('cc:login-email', 'josh@example.com')
    localStorage.setItem('cc:login-provider', 'google')
    render(<LoginPage />)
    expect(
      screen.getByRole('button', {
        name: 'auth.continueWithGoogleVerb josh@example.com',
      }),
    ).toBeInTheDocument()
  })

  it('shows the email "Continue as" chrome when last provider was email', () => {
    localStorage.setItem('cc:login-email', 'alex@example.com')
    localStorage.setItem('cc:login-provider', 'email')
    render(<LoginPage />)
    expect(
      screen.getByRole('button', {
        name: 'auth.sendLinkToVerb alex@example.com',
      }),
    ).toBeInTheDocument()
  })

  // Legacy state: pre-Option-A users only ever wrote the email — Google
  // sign-ins didn't touch localStorage. Treat email-only as a magic-link
  // user so their behaviour is unchanged.
  it('defaults to the email chrome when no provider is stored (legacy state)', () => {
    localStorage.setItem('cc:login-email', 'oldhand@example.com')
    render(<LoginPage />)
    expect(
      screen.getByRole('button', {
        name: 'auth.sendLinkToVerb oldhand@example.com',
      }),
    ).toBeInTheDocument()
  })

  it('fires signInWithOAuth when the Google "Continue as" is tapped', async () => {
    localStorage.setItem('cc:login-email', 'josh@example.com')
    localStorage.setItem('cc:login-provider', 'google')
    render(<LoginPage />)
    await userEvent.click(
      screen.getByRole('button', {
        name: 'auth.continueWithGoogleVerb josh@example.com',
      }),
    )
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('fires signInWithOtp for the saved email when the email "Continue as" is tapped', async () => {
    localStorage.setItem('cc:login-email', 'alex@example.com')
    localStorage.setItem('cc:login-provider', 'email')
    render(<LoginPage />)
    await userEvent.click(
      screen.getByRole('button', {
        name: 'auth.sendLinkToVerb alex@example.com',
      }),
    )
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alex@example.com' }),
    )
    expect(signInWithOAuth).not.toHaveBeenCalled()
  })

  it('offers Google as the quiet alternative when last provider was email', () => {
    localStorage.setItem('cc:login-email', 'alex@example.com')
    localStorage.setItem('cc:login-provider', 'email')
    render(<LoginPage />)
    expect(
      screen.getByRole('button', { name: 'auth.googleInstead' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'auth.emailLinkInstead' }),
    ).not.toBeInTheDocument()
  })

  it('offers email link as the quiet alternative when last provider was google', () => {
    localStorage.setItem('cc:login-email', 'josh@example.com')
    localStorage.setItem('cc:login-provider', 'google')
    render(<LoginPage />)
    expect(
      screen.getByRole('button', { name: 'auth.emailLinkInstead' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'auth.googleInstead' }),
    ).not.toBeInTheDocument()
  })

  it('fires Google OAuth when the "sign in with Google instead" alt is tapped', async () => {
    localStorage.setItem('cc:login-email', 'alex@example.com')
    localStorage.setItem('cc:login-provider', 'email')
    render(<LoginPage />)
    await userEvent.click(
      screen.getByRole('button', { name: 'auth.googleInstead' }),
    )
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  // The alt-button path is the actual unstuck mechanism for a user
  // whose stored provider is 'email' but who actually signs in with
  // Google: tapping "Sign in with Google instead" must overwrite the
  // stale provider BEFORE the redirect, so the welcome-back surface
  // recognises them as a Google user on next visit even if the
  // callback's app_metadata read misses.
  it('overwrites the stored provider to google when the "google instead" alt is tapped', async () => {
    localStorage.setItem('cc:login-email', 'alex@example.com')
    localStorage.setItem('cc:login-provider', 'email')
    render(<LoginPage />)
    await userEvent.click(
      screen.getByRole('button', { name: 'auth.googleInstead' }),
    )
    expect(localStorage.getItem('cc:login-provider')).toBe('google')
  })

  // The alt button is one-tap, matching the loud "Continue as" above it.
  // Tapping it sends the magic link to the recognised email immediately —
  // no form intermediate step. The escape for a different email is the
  // explicit "Use a different account" link below.
  it('fires signInWithOtp for the saved email when the "email link instead" alt is tapped', async () => {
    localStorage.setItem('cc:login-email', 'josh@example.com')
    localStorage.setItem('cc:login-provider', 'google')
    render(<LoginPage />)
    await userEvent.click(
      screen.getByRole('button', { name: 'auth.emailLinkInstead' }),
    )
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'josh@example.com' }),
    )
    expect(await screen.findByText(/auth\.linkSentTo/)).toBeInTheDocument()
  })

  it('clears both identity keys and shows the first-time view when "Use a different account" is tapped', async () => {
    localStorage.setItem('cc:login-email', 'josh@example.com')
    localStorage.setItem('cc:login-provider', 'google')
    render(<LoginPage />)
    await userEvent.click(
      screen.getByRole('button', { name: 'auth.useDifferentAccount' }),
    )
    expect(localStorage.getItem('cc:login-email')).toBeNull()
    expect(localStorage.getItem('cc:login-provider')).toBeNull()
    // First-time view shows the invite-only chip + Google button + email
    // form. The Google "Continue as" pill is gone.
    expect(
      screen.queryByRole('button', {
        name: 'auth.continueWithGoogleVerb josh@example.com',
      }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('auth.inviteOnlyNote')).toBeInTheDocument()
  })
})
