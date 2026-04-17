'use client'
import { useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useTranslation } from '@/components/LanguageProvider'

// Loose RFC-5322-ish check: localpart@domain.tld. Permissive on purpose —
// Supabase will reject anything truly malformed, so this is just to catch
// obvious typos before the network call.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  const [touched, setTouched] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const trimmed = email.trim()
  const formatValid = isValidEmail(trimmed)
  // Only surface the inline validity hint after the user has interacted —
  // pre-submit nagging is hostile to first-time users.
  const showInlineInvalid = touched && trimmed.length > 0 && !formatValid

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!formatValid) {
      setError(t('auth.invalidEmail'))
      return
    }
    setLoading(true)
    setError(null)
    const { error: authError } = await getSupabaseBrowserClient().auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    })
    setLoading(false)
    if (authError) {
      setError(friendlyError(authError, t))
    } else {
      setSent(true)
    }
  }

  const submitDisabled = loading || trimmed.length === 0 || !formatValid

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-7rem)] px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
            {t('auth.signInTitle')}
          </h1>
          <p className="text-base text-text-secondary">
            {t('auth.signInSubtitle')}
          </p>
        </div>

        {sent ? (
          <div className="space-y-4 rounded-2xl border border-border-subtle bg-surface p-6 text-center">
            <p className="text-base text-text-primary">
              {t('auth.linkSentTo', { email: trimmed })}
            </p>
            <p className="text-sm text-text-tertiary">
              {t('auth.linkSentNote')}
            </p>
            <button
              type="button"
              onClick={() => {
                setSent(false)
                setError(null)
              }}
              className="text-sm text-accent-primary hover:underline"
            >
              {t('auth.useDifferentEmail')}
            </button>
          </div>
        ) : (
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
            <button
              type="submit"
              disabled={submitDisabled}
              className="w-full px-4 py-2.5 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white font-medium text-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? t('auth.submitting') : t('auth.submit')}
            </button>
            <p className="text-xs text-text-tertiary text-center">
              {t('auth.invitedNote')}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
