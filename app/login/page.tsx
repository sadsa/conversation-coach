'use client'
import { useState, useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useTranslation } from '@/components/LanguageProvider'
import { Button, buttonStyles } from '@/components/Button'
import { LogoMark } from '@/components/LogoMark'
import { Wordmark } from '@/components/Wordmark'
import { IosInstallHint } from '@/components/IosInstallHint'

// Inline Google G glyph — reused by every Google-flavoured button on this
// page (first-time CTA, returning-user "Continue with Google as", and the
// quiet "sign in with Google instead" alt). Always rendered with the
// multi-colour brand fill, regardless of theme.
function GoogleGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

// Envelope glyph — Phosphor-style. Used by every email-flavoured surface
// (first-time invite chip, "Send a sign-in link to" pill, "email me a
// link instead" alt).
function EnvelopeGlyph({ className = '', size = 18 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="6" width="18" height="14" rx="2" />
      <path d="m3 8 9 6 9-6" />
    </svg>
  )
}

// First-time loud Google CTA. Visual chrome matches the welcome-back
// `ContinueAsPill` (dark-navy `bg-google-surface` in light, inverted
// cream in dark, with a contrasting chip housing the multi-colour G)
// — same loud-then-quiet shape as the welcome-back state, so the
// chooser pattern reads as ONE design told twice (recognised users
// see their email; unknown users see the provider). Previous treatment
// (outlined neutral) sat at the same visual weight as the quiet email
// `AltProviderButton` below, violating "visual weight signals the path"
// — there was no design cue that Google is the dominant flow.
function GoogleButton({ label, loading, onClick }: { label: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="w-full flex items-center justify-center gap-3 min-h-12 px-4 rounded-xl bg-google-surface text-on-google-surface text-sm font-medium hover:bg-google-surface-hover transition-colors disabled:opacity-60"
    >
      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-on-google-surface">
        <GoogleGlyph size={16} />
      </span>
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

// Provider-aware "Continue as <email>" pill. The visual chrome IS the
// affordance — dark navy + Google G chip means "tapping this fires
// OAuth", violet + envelope chip means "tapping this sends a magic
// link". The verb sits above the email visually for legibility; the
// button's accessible name is a single natural sentence composed
// from `<verb> <email>` and set via aria-label so AT users hear
// "Continue with Google as josh@gmail.com" without the two visual
// spans running together.
function ContinueAsPill({
  email,
  provider,
  loading,
  onClick,
  t,
}: {
  email: string
  provider: 'google' | 'email'
  loading: boolean
  onClick: () => void
  t: (key: string, replacements?: Record<string, string>) => string
}) {
  const isGoogle = provider === 'google'
  const verb = t(isGoogle ? 'auth.continueWithGoogleVerb' : 'auth.sendLinkToVerb')
  // The visual layout splits verb + email across two lines (flex-col)
  // for legibility. The bare text-content concatenation has no
  // whitespace between the two spans, which both Testing Library and
  // real screen readers expose as a run-together accessible name.
  // We set aria-label explicitly so AT users hear a properly-spaced
  // sentence ("Continue with Google as josh@gmail.com"); the two
  // visual lines stay as-is.
  const accessibleName = `${verb} ${email}`

  // Provider drives the chrome. Google: dark navy / elevated dark
  // surface (semantic --color-google-surface, theme-aware). Email:
  // accent-primary violet. Foreground is always the cream "on-*" token
  // so the white G chip + bottom-line email never lose contrast.
  const surface = isGoogle
    ? 'bg-google-surface text-on-google-surface border-google-surface hover:bg-google-surface-hover'
    : 'bg-accent-primary text-on-accent border-accent-primary hover:bg-accent-primary-hover'
  const chipSurface = isGoogle
    ? 'bg-on-google-surface'
    : 'bg-on-accent/15 text-on-accent'
  const verbColor = isGoogle ? 'text-on-google-surface/75' : 'text-on-accent/80'
  const chevronColor = isGoogle ? 'text-on-google-surface/55' : 'text-on-accent/55'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={accessibleName}
      className={`w-full flex items-center gap-3 min-h-14 pl-3 pr-3.5 py-2.5 rounded-2xl border transition-colors disabled:opacity-60 ${surface}`}
    >
      <span className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${chipSurface}`}>
        {isGoogle ? <GoogleGlyph /> : <EnvelopeGlyph />}
      </span>
      <span aria-hidden="true" className="flex flex-col gap-0.5 min-w-0 flex-1 text-left">
        <span className={`text-xs ${verbColor} leading-tight`}>{verb}</span>
        <span className="text-[0.9375rem] font-semibold leading-tight truncate">{loading ? '…' : email}</span>
      </span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`flex-shrink-0 ${chevronColor}`}
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  )
}

// Quiet "or try the other provider instead" button below the pill.
// Same one-tap shape, just visually receded so the recognised path is
// clearly the recommendation.
function AltProviderButton({
  provider,
  label,
  loading,
  onClick,
}: {
  provider: 'google' | 'email'
  label: string
  loading: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 min-h-11 px-3.5 rounded-xl border border-border bg-transparent text-sm font-medium text-text-secondary hover:bg-surface-elevated transition-colors disabled:opacity-60"
    >
      {provider === 'google' ? <GoogleGlyph size={16} /> : <EnvelopeGlyph size={16} className="text-text-tertiary" />}
      {loading ? '…' : label}
    </button>
  )
}

// Small banner pinned ABOVE the auth controls on the first-time view so
// users who tap Google (the loud, default-instinct first move) know the
// product is invite-only before they commit. Lives below the H1 and above
// every auth control, so neither path can miss it. Hidden for the
// returning-user quick-select branch — they already have access.
//
// Icon is a lock — direct semantic match for "invite-only" (the door is
// locked, you need access). Previous treatment used the envelope glyph,
// which collided with the email `AltProviderButton` directly below
// inside the same focal cluster — two envelopes in close proximity made
// the chip read as "email-related" rather than "access-related".
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
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
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
// Stored alongside the email on every successful sign-in so the
// welcome-back surface can render the provider-aware "Continue as"
// pill. The magic-link path writes 'email' here directly; the Google
// path writes 'google' from app/auth/callback after the OAuth round-
// trip lands a confirmed session. Legacy state — pre-Option A users
// only had an email stored — is read as 'email' (matches the prior
// behaviour: violet pill, magic link on tap).
const SAVED_PROVIDER_KEY = 'cc:login-provider'
type LoginProvider = 'google' | 'email'

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
  // Email + provider remembered from the previous successful sign-in
  // (localStorage). When the email is present, the quick-select view
  // renders the provider-aware "Continue as" pill instead of the full
  // first-time form. A missing provider is treated as 'email' — that
  // preserves the pre-Option-A behaviour for legacy users (only
  // magic-link sign-ins ever wrote to localStorage before).
  const [savedEmail, setSavedEmail] = useState<string | null>(null)
  const [savedProvider, setSavedProvider] = useState<LoginProvider>('email')
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
    const storedEmail = localStorage.getItem(SAVED_EMAIL_KEY)
    if (storedEmail) setSavedEmail(storedEmail)
    const storedProvider = localStorage.getItem(SAVED_PROVIDER_KEY)
    if (storedProvider === 'google' || storedProvider === 'email') {
      setSavedProvider(storedProvider)
    }
  }, [])

  // Used by every Google CTA on the page. The provider is written
  // OPTIMISTICALLY before the redirect: we already know the user
  // pressed the Google button, so this is the most reliable signal.
  // Trying to recover the provider in the callback from
  // `session.user.app_metadata.provider` works in theory but turned
  // out flaky in practice — the field can be undefined, arrive late,
  // or be shaped differently across Supabase versions, and silent
  // miss-writes meant returning Google users kept seeing the email
  // pill. Email is NOT written here because we don't yet know which
  // Google account the user will pick — the callback fills it in
  // from the confirmed session. If the user abandons OAuth, the
  // orphan provider key is harmless: the welcome-back view is gated
  // on `savedEmail !== null`, so they'll still see the first-time
  // view until a sign-in succeeds.
  //
  // `forceAccountPicker` is wired only by callers that have NO
  // recognised identity — the first-time Google CTA, which is also
  // the surface the user lands on after tapping "Use a different
  // account". Without `prompt=select_account` Google auto-redirects
  // a single-signed-in browser straight back as the cached account,
  // which is exactly the trap "Use a different account" exists to
  // escape. The pill + alt-button paths intentionally leave this
  // off so a recognised user stays one tap from being signed in.
  async function continueWithGoogle({ forceAccountPicker = false } = {}) {
    setGoogleLoading(true)
    setError(null)
    try {
      localStorage.setItem(SAVED_PROVIDER_KEY, 'google')
    } catch {
      // Private mode / quota — the callback's app_metadata write is
      // the fallback, and the legacy 'email' default still works.
    }
    const { error: authError } = await getSupabaseBrowserClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        ...(forceAccountPicker && {
          queryParams: { prompt: 'select_account' },
        }),
      },
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
    localStorage.setItem(SAVED_PROVIDER_KEY, 'email')
    setSavedEmail(targetEmail)
    setSavedProvider('email')
    setSentTo(targetEmail)
    setSent(true)
  }

  // Reset BOTH identity keys and route back to the first-time view.
  // Used by the quick-select "Use a different account" link — covers
  // both "I want to sign in as a different person" and "my cached
  // provider is stale (revoked Google access, etc.)" without asking
  // the user to articulate which.
  function forgetSavedIdentity() {
    localStorage.removeItem(SAVED_EMAIL_KEY)
    localStorage.removeItem(SAVED_PROVIDER_KEY)
    setSavedEmail(null)
    setSavedProvider('email')
    setShowEmailForm(false)
    setError(null)
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
            {/* LogoMark is marked decorative because Wordmark below
                renders the brand name as visible text — without
                `decorative` AT users hear "Conversation Coach" twice
                in a row. */}
            <LogoMark size={64} decorative />
            <Wordmark />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-medium text-text-primary">
              {savedEmail ? t('auth.welcomeBack') : t('auth.signInTitle')}
            </h1>
            {/* Subtitle is first-time only — returning users already
                know what the product is and the H1 ("Welcome back")
                does the greeting on its own. For the first-time view
                a single-line product description gives an unknown
                visitor enough context to decide whether to sign in,
                without a wall of marketing copy. */}
            {!savedEmail && (
              <p className="text-base text-text-secondary leading-relaxed">
                {t('auth.signInSubtitle')}
              </p>
            )}
          </div>
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
              className="text-sm text-text-secondary hover:text-text-primary hover:underline transition-colors"
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
            {/* Loud, provider-aware "Continue as <email>" — fires the
                provider the user actually used last time. Chrome = the
                affordance. */}
            <ContinueAsPill
              email={savedEmail!}
              provider={savedProvider}
              loading={savedProvider === 'google' ? googleLoading : loading}
              onClick={() => {
                if (savedProvider === 'google') {
                  void continueWithGoogle()
                } else {
                  void requestLink(savedEmail!)
                }
              }}
              t={t}
            />
            <GoogleDivider label={t('auth.or')} />
            {/* Quiet alt button — the OTHER provider, one-tap. Both
                paths use the recognised identity so the alt is just as
                fast as the loud pill. */}
            {savedProvider === 'google' ? (
              <AltProviderButton
                provider="email"
                label={t('auth.emailLinkInstead')}
                loading={loading}
                onClick={() => void requestLink(savedEmail!)}
              />
            ) : (
              <AltProviderButton
                provider="google"
                label={t('auth.googleInstead')}
                loading={googleLoading}
                onClick={continueWithGoogle}
              />
            )}
            <button
              type="button"
              onClick={forgetSavedIdentity}
              className="text-sm text-text-secondary hover:text-text-primary hover:underline transition-colors block mx-auto"
            >
              {t('auth.useDifferentAccount')}
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
            {showEmailForm ? (
              // The email form is now progressive disclosure — only
              // visible after the user explicitly opts into the email
              // path from the chooser. autoFocus on the freshly-
              // mounted input means a single tap on the email CTA
              // lands the cursor in the field ready to type.
              <>
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
                {/* Back-out path. Returns to the chooser rather than
                    firing Google directly — the user explicitly chose
                    email a moment ago, so an instant OAuth redirect on
                    "different method" would feel hijacked. */}
                <button
                  type="button"
                  onClick={() => {
                    setShowEmailForm(false)
                    setError(null)
                    setTouched(false)
                  }}
                  className="text-sm text-text-secondary hover:text-text-primary hover:underline transition-colors block mx-auto"
                >
                  {t('auth.useDifferentMethod')}
                </button>
              </>
            ) : (
              // Provider chooser — mirrors the welcome-back layout
              // (loud preferred + "or" + quiet alt). Google is loud
              // because it's the dominant flow; email is the quiet
              // alt that expands into a form on tap. The first-time
              // Google CTA forces Google's account picker — without
              // `prompt=select_account` a single-signed-in browser
              // auto-redirects as the cached account, defeating
              // "Use a different account" which is the only way to
              // reach this surface for a returning user.
              <>
                <GoogleButton
                  label={t('auth.continueWithGoogle')}
                  loading={googleLoading}
                  onClick={() => continueWithGoogle({ forceAccountPicker: true })}
                />
                <GoogleDivider label={t('auth.or')} />
                <AltProviderButton
                  provider="email"
                  label={t('auth.emailMeSignInLink')}
                  loading={false}
                  onClick={() => {
                    setShowEmailForm(true)
                    setError(null)
                  }}
                />
                {error && (
                  <p
                    role="alert"
                    className="text-sm text-on-error-surface bg-error-surface px-3 py-2 rounded-lg"
                  >
                    {error}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <IosInstallHint />
    </div>
  )
}
