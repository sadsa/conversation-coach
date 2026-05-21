'use client'
import { useState, useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useTranslation } from '@/components/LanguageProvider'
import { Button, buttonStyles } from '@/components/Button'
import { LogoMark } from '@/components/LogoMark'
import { Wordmark } from '@/components/Wordmark'
import { IosInstallHint } from '@/components/IosInstallHint'

function GoogleButton({ label, loading, onClick }: { label: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-border bg-surface text-text-primary text-sm font-medium hover:bg-surface/80 transition-colors disabled:opacity-60"
    >
      {/* Google multi-colour G glyph */}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
        <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
      </svg>
      {loading ? '…' : label}
    </button>
  )
}

function GoogleDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-text-tertiary">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

// Small banner pinned ABOVE the Google button on the first-time view so
// users who tap Google (the loud, default-instinct first move) know the
// product is invite-only before they commit. Lives below the H1 and above
// every auth control, so neither path can miss it. Hidden for the
// returning-user quick-select branch — they already have access.
function InviteOnlyChip({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-accent-chip text-on-accent-chip text-xs leading-snug">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 mt-px"
        aria-hidden="true"
      >
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <path d="m3 8 9 6 9-6" />
      </svg>
      <span>{label}</span>
    </div>
  )
}

// Loose RFC-5322-ish check: localpart@domain.tld. Permissive on purpose —
// Supabase will reject anything truly malformed, so this is just to catch
// obvious typos before the network call.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SAVED_EMAIL_KEY = 'cc:login-email'

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/**
 * Translate a Supabase auth error into a friendly UI string.
 *
 * Supabase exposes both a `code` and a `message`. The message is human-ish
 * but English-only and changes between releases, so we key on the codes we
 * know about and fall back to a generic message rather than leaking the
 * raw upstream string into the UI.
 */
function friendlyError(
  error: { message?: string; code?: string; status?: number } | null,
  t: (key: string) => string,
): string {
  if (!error) return t('auth.error.generic')
  const code = error.code ?? ''
  const msg = (error.message ?? '').toLowerCase()
  if (code === 'over_email_send_rate_limit' || error.status === 429 || msg.includes('rate limit')) {
    return t('auth.error.rateLimit')
  }
  if (code === 'signup_disabled' || msg.includes('signups not allowed') || msg.includes('signup is disabled')) {
    return t('auth.error.signupDisabled')
  }
  if (code === 'email_address_invalid' || code === 'validation_failed' || msg.includes('invalid')) {
    return t('auth.error.invalidEmail')
  }
  return t('auth.error.generic')
}

export default function LoginPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  // Email remembered from a previous sign-in (localStorage). When present,
  // the quick-select view offers "Continue as X" instead of the full form.
  const [savedEmail, setSavedEmail] = useState<string | null>(null)
  // Set to true when the user explicitly wants to type a different email.
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [touched, setTouched] = useState(false)
  const [sent, setSent] = useState(false)
  // Tracks which email was actually sent — may differ from `email` state
  // when the request came from the quick-select path.
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(SAVED_EMAIL_KEY)
    if (stored) setSavedEmail(stored)
  }, [])

  async function continueWithGoogle() {
    setGoogleLoading(true)
    setError(null)
    const { error: authError } = await getSupabaseBrowserClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (authError) {
      setGoogleLoading(false)
      setError(friendlyError(authError, t))
    }
    // On success Supabase navigates away; no further state to manage.
  }

  async function requestLink(targetEmail: string) {
    setLoading(true)
    setError(null)
    const { error: authError } = await getSupabaseBrowserClient().auth.signInWithOtp({
      email: targetEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    })
    setLoading(false)
    if (authError) {
      setError(friendlyError(authError, t))
      return
    }
    localStorage.setItem(SAVED_EMAIL_KEY, targetEmail)
    setSavedEmail(targetEmail)
    setSentTo(targetEmail)
    setSent(true)
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    const trimmed = email.trim()
    if (!isValidEmail(trimmed)) {
      setError(t('auth.invalidEmail'))
      return
    }
    await requestLink(trimmed)
  }

  const trimmed = email.trim()
  const formatValid = isValidEmail(trimmed)
  // Only surface the inline validity hint after the user has interacted —
  // pre-submit nagging is hostile to first-time users.
  const showInlineInvalid = touched && trimmed.length > 0 && !formatValid
  const submitDisabled = loading || trimmed.length === 0 || !formatValid

  // Quick-select: show remembered email as a one-tap option unless the user
  // has explicitly asked to type a different address.
  const showQuickSelect = savedEmail !== null && !showEmailForm

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 gap-8">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-5">
          <div className="space-y-2">
            <LogoMark size={64} />
            <Wordmark />
          </div>
          <h1 className="font-display text-3xl font-medium text-text-primary">
            {savedEmail ? t('auth.welcomeBack') : t('auth.signInTitle')}
          </h1>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-base text-text-primary">
              {t('auth.linkSentTo', { email: sentTo })}
            </p>
            <p className="text-sm text-text-secondary">
              {t('auth.linkSentNote')}
            </p>
            <a
              href="mailto:"
              className={buttonStyles({ variant: 'secondary', size: 'sm', fullWidth: true })}
            >
              {t('auth.openMailApp')}
            </a>
            <button
              type="button"
              onClick={() => {
                setSent(false)
                setSentTo('')
                setShowEmailForm(true)
                setError(null)
              }}
              className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {t('auth.useDifferentEmail')}
            </button>
          </div>
        ) : showQuickSelect ? (
          <div className="space-y-4">
            {error && (
              <p
                role="alert"
                className="text-sm text-on-error-surface bg-error-surface px-3 py-2 rounded-lg"
              >
                {error}
              </p>
            )}
            <Button
              type="button"
              size="sm"
              fullWidth
              disabled={loading}
              onClick={() => requestLink(savedEmail!)}
            >
              {loading ? t('auth.submitting') : t('auth.continueAs', { email: savedEmail! })}
            </Button>
            <GoogleDivider label={t('auth.orUseEmail')} />
            <GoogleButton
              label={t('auth.continueWithGoogle')}
              loading={googleLoading}
              onClick={continueWithGoogle}
            />
            <button
              type="button"
              onClick={() => { setShowEmailForm(true); setError(null) }}
              className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {t('auth.useDifferentEmail')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* The invite-only disclaimer used to live below the Google
                divider, inside the email form's intro paragraph. Users who
                tapped Google first never read it — they'd commit to OAuth
                without knowing the product was invite-only and only learn
                that after the access-denied bounce. Moving it above every
                auth control makes it impossible to miss. */}
            <InviteOnlyChip label={t('auth.inviteOnlyNote')} />
            <GoogleButton
              label={t('auth.continueWithGoogle')}
              loading={googleLoading}
              onClick={continueWithGoogle}
            />
            <GoogleDivider label={t('auth.orUseEmail')} />
            <form onSubmit={sendMagicLink} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-text-secondary"
                >
                  {t('auth.emailLabel')}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  inputMode="email"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value)
                    if (error) setError(null)
                  }}
                  onBlur={() => setTouched(true)}
                  aria-invalid={showInlineInvalid || Boolean(error)}
                  aria-describedby={
                    showInlineInvalid ? 'email-error' : error ? 'auth-error' : undefined
                  }
                  className={`w-full px-3 py-2.5 rounded-lg border bg-surface text-text-primary text-base placeholder-text-tertiary focus:outline-none focus:ring-2 ${
                    showInlineInvalid
                      ? 'border-on-error-surface focus:border-on-error-surface focus:ring-on-error-surface/30'
                      : 'border-border focus:border-accent-primary focus:ring-accent-primary/30'
                  }`}
                />
                {showInlineInvalid && (
                  <p
                    id="email-error"
                    className="text-xs text-on-error-surface"
                    role="alert"
                  >
                    {t('auth.invalidEmail')}
                  </p>
                )}
              </div>
              {error && (
                <p
                  id="auth-error"
                  className="text-sm text-on-error-surface bg-error-surface px-3 py-2 rounded-lg"
                  role="alert"
                >
                  {error}
                </p>
              )}
              <Button type="submit" size="sm" fullWidth disabled={submitDisabled}>
                {loading ? t('auth.submitting') : t('auth.submit')}
              </Button>
            </form>
          </div>
        )}
      </div>
      <IosInstallHint />
    </div>
  )
}
