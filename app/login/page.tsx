'use client'
import { useState, useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useTranslation } from '@/components/LanguageProvider'
import { Button, buttonStyles } from '@/components/Button'
import { LogoMark } from '@/components/LogoMark'
import { Wordmark } from '@/components/Wordmark'

// Loose RFC-5322-ish check: localpart@domain.tld. Permissive on purpose —
// Supabase will reject anything truly malformed, so this is just to catch
// obvious typos before the network call.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getEmailInboxUrl(email: string): { href: string; label: string } {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return { href: 'https://mail.google.com/mail/u/0/#inbox', label: 'Open Gmail' }
  }
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) {
    return { href: 'https://outlook.live.com/mail/inbox', label: 'Open Outlook' }
  }
  if (domain.startsWith('yahoo.')) {
    return { href: 'https://mail.yahoo.com/', label: 'Open Yahoo Mail' }
  }
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) {
    return { href: 'https://www.icloud.com/mail/', label: 'Open iCloud Mail' }
  }
  if (domain === 'protonmail.com' || domain === 'proton.me') {
    return { href: 'https://mail.proton.me/', label: 'Open Proton Mail' }
  }
  return { href: 'mailto:', label: '' }
}
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

  useEffect(() => {
    const stored = localStorage.getItem(SAVED_EMAIL_KEY)
    if (stored) setSavedEmail(stored)
  }, [])

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
    <div className="flex items-center justify-center min-h-[calc(100vh-7rem)] px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-5">
          <div className="space-y-2">
            <LogoMark size={64} />
            <Wordmark />
          </div>
          <h1 className="font-display text-3xl font-medium text-text-primary">
            {t('auth.signInTitle')}
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
            {(() => {
              const { href, label } = getEmailInboxUrl(sentTo)
              return (
                <a
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className={buttonStyles({ variant: 'secondary', size: 'sm', fullWidth: true })}
                >
                  {label || t('auth.openMailApp')}
                </a>
              )
            })()}
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
            <button
              type="button"
              onClick={() => { setShowEmailForm(true); setError(null) }}
              className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
            >
              {t('auth.useDifferentEmail')}
            </button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="space-y-4" noValidate>
            <p className="text-sm text-text-secondary">
              {t('auth.invitedNote')}
            </p>
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
        )}
      </div>
    </div>
  )
}
