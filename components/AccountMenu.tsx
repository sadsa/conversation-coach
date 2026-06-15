// components/AccountMenu.tsx
'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useTranslation } from '@/components/LanguageProvider'

/**
 * Account identity + account actions (Settings, Sign out), extracted out of
 * the nav tab list. Two presentations share one source of truth:
 *
 *  • `AccountMenuMobile`  — docks at the bottom of the NavDrawer; the row
 *    toggles a popover that lifts UPWARD (there's nothing below it).
 *  • `AccountMenuDesktop` — a rounded avatar button at the top-right of the
 *    AppHeader; opens a dropdown that drops DOWN-and-left.
 *
 * Settings and Sign out are account-scoped chrome, deliberately kept out of
 * NAV_TABS so they don't compete with the Speak / Review / Refine pillars.
 */

export interface AccountUser {
  name: string | null
  email: string | null
  avatarUrl: string | null
}

/** First letter of the name, else the email; uppercased. Single glyph keeps
 *  the monogram legible at avatar sizes and works for first-name-only data. */
function accountInitial(user: AccountUser): string {
  const source = user.name?.trim() || user.email?.trim() || ''
  return source.charAt(0).toUpperCase() || '?'
}

/** The line shown as the account's primary label. Falls back to the email when
 *  there's no display name (magic-link users have no OAuth full name). */
function primaryLabel(user: AccountUser): string {
  return user.name?.trim() || user.email?.trim() || ''
}

function SettingsIcon() {
  // Phosphor faders-horizontal (regular). Quieter than a gear — reads as
  // "preferences / dials" without the mechanical busyness of cog teeth.
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
      <path d="M176,80a8,8,0,0,1,8-8h32a8,8,0,0,1,0,16H184A8,8,0,0,1,176,80ZM40,88H144v16a8,8,0,0,0,16,0V56a8,8,0,0,0-16,0V72H40a8,8,0,0,0,0,16Zm176,80H120a8,8,0,0,0,0,16h96a8,8,0,0,0,0-16ZM88,144a8,8,0,0,0-8,8v16H40a8,8,0,0,0,0,16H80v16a8,8,0,0,0,16,0V152A8,8,0,0,0,88,144Z" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="w-5 h-5 flex-shrink-0" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function ChevronUpIcon({ flipped }: { flipped: boolean }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={`w-4 h-4 flex-shrink-0 text-text-tertiary transition-transform duration-200 ${flipped ? 'rotate-180' : ''}`}
      aria-hidden="true">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

/** Circular avatar: OAuth photo when present (falls back to initials on load
 *  error), otherwise an initials monogram on a violet-tinted chip. */
function Avatar({ user, size }: { user: AccountUser; size: number }) {
  const [broken, setBroken] = useState(false)
  const showImage = user.avatarUrl && !broken
  return (
    <span
      className="flex items-center justify-center rounded-full overflow-hidden bg-accent-chip text-on-accent-chip font-semibold select-none"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {showImage ? (
        // Plain <img> (not next/image): Google avatar hosts aren't in the
        // image config, and referrerPolicy avoids lh3 403s.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl!}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        accountInitial(user)
      )}
    </span>
  )
}

/** Closes the menu on a pointer press outside `ref` while `open`. */
function useOutsideDismiss(
  ref: React.RefObject<HTMLElement>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return
    function handle(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  }, [ref, open, onClose])
}

/** Shared sign-out: ends the Supabase session, runs an optional cleanup
 *  (e.g. close the drawer), then routes to /login. Reports an in-flight flag
 *  so the button can disable itself and avoid double-submits. */
function useSignOut(afterSignOut?: () => void) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const signOut = useCallback(async () => {
    if (pending) return
    setPending(true)
    try {
      await getSupabaseBrowserClient().auth.signOut()
    } finally {
      afterSignOut?.()
      router.push('/login')
    }
  }, [pending, afterSignOut, router])
  return { signOut, pending }
}

/** The two action rows shared by both presentations. */
function AccountActions({
  onSettings,
  onSignOut,
  signOutPending,
  settingsLabel,
  signOutLabel,
}: {
  onSettings: () => void
  onSignOut: () => void
  signOutPending: boolean
  settingsLabel: string
  signOutLabel: string
}) {
  return (
    <>
      <Link
        href="/settings"
        role="menuitem"
        onClick={onSettings}
        className="flex items-center gap-3 px-4 py-3 text-text-secondary hover:bg-surface-elevated hover:text-text-primary transition-colors text-sm font-medium focus:outline-none focus-visible:bg-surface-elevated"
      >
        <SettingsIcon />
        <span>{settingsLabel}</span>
      </Link>
      <button
        type="button"
        role="menuitem"
        onClick={onSignOut}
        disabled={signOutPending}
        className="w-full flex items-center gap-3 px-4 py-3 text-on-error-surface hover:bg-error-surface transition-colors text-left text-sm font-medium disabled:opacity-60 focus:outline-none focus-visible:bg-error-surface"
      >
        <SignOutIcon />
        <span>{signOutLabel}</span>
      </button>
    </>
  )
}

// ── Mobile: NavDrawer footer ────────────────────────────────────────────────

export function AccountMenuMobile({
  user,
  onNavigate,
}: {
  user: AccountUser
  /** Called when the user navigates away (Settings) so the drawer can close. */
  onNavigate: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  useOutsideDismiss(containerRef, open, () => setOpen(false))
  const { signOut, pending } = useSignOut(onNavigate)

  return (
    <div
      ref={containerRef}
      className="relative p-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('nav.account')}
          className="absolute bottom-full left-3 right-3 mb-2 rounded-xl bg-surface border border-border-subtle overflow-hidden shadow-[0_-12px_32px_-18px_rgba(0,0,0,0.28)] motion-safe:animate-[fadein_160ms_var(--ease-out-expo)_both]"
        >
          <AccountActions
            settingsLabel={t('nav.settings')}
            signOutLabel={t('nav.signOut')}
            signOutPending={pending}
            onSettings={onNavigate}
            onSignOut={signOut}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-surface-elevated transition-colors"
      >
        <Avatar user={user} size={40} />
        <span className="flex-1 min-w-0">
          <span className="block truncate text-sm font-semibold text-text-primary">
            {primaryLabel(user)}
          </span>
          {user.name && user.email && (
            <span className="block truncate text-xs text-text-tertiary">{user.email}</span>
          )}
        </span>
        <ChevronUpIcon flipped={!open} />
      </button>
    </div>
  )
}

// ── Desktop: AppHeader top-right ────────────────────────────────────────────

export function AccountMenuDesktop({ user }: { user: AccountUser }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  useOutsideDismiss(containerRef, open, () => setOpen(false))

  // Escape closes the menu and returns focus to the trigger.
  useEffect(() => {
    if (!open) return
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [open])

  const close = useCallback(() => setOpen(false), [])
  const { signOut, pending } = useSignOut(close)

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('nav.accountMenu')}
        className="flex items-center rounded-full transition-shadow hover:ring-2 hover:ring-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <Avatar user={user} size={32} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('nav.account')}
          className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-surface border border-border-subtle overflow-hidden shadow-[0_12px_32px_-16px_rgba(0,0,0,0.28)] motion-safe:animate-[fadein_160ms_var(--ease-out-expo)_both]"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Avatar user={user} size={40} />
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-semibold text-text-primary">
                {primaryLabel(user)}
              </span>
              {user.name && user.email && (
                <span className="block truncate text-xs text-text-tertiary">{user.email}</span>
              )}
            </span>
          </div>
          <div className="border-t border-border-subtle" />
          <AccountActions
            settingsLabel={t('nav.settings')}
            signOutLabel={t('nav.signOut')}
            signOutPending={pending}
            onSettings={close}
            onSignOut={signOut}
          />
        </div>
      )}
    </div>
  )
}
