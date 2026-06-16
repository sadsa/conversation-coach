// components/AccountMenu.tsx
'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useTranslation } from '@/components/LanguageProvider'

/**
 * Account identity + account actions (Settings, Sign out). Three presentations:
 *
 *  • `AccountMenuMobileHeader` — three-dot button at the top-right of the
 *    AppHeader on mobile; drops a small menu with Settings + Sign out.
 *  • `AccountMenuDesktop`      — rounded avatar button at the top-right of the
 *    AppHeader on desktop; opens a dropdown with identity header + actions.
 *  • `AccountWidget`           — presentational identity row (avatar + name/email)
 *    used at the top of the Settings page.
 */

export interface AccountUser {
  name: string | null
  email: string | null
  avatarUrl: string | null
}

function accountInitial(user: AccountUser): string {
  const source = user.name?.trim() || user.email?.trim() || ''
  return source.charAt(0).toUpperCase() || '?'
}

function primaryLabel(user: AccountUser): string {
  return user.name?.trim() || user.email?.trim() || ''
}

function SettingsIcon() {
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

function ThreeDotsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
      className="w-5 h-5" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
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
      className="flex items-center justify-center rounded-full overflow-hidden bg-accent-chip text-on-accent-chip font-semibold select-none flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {showImage ? (
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

// ── Mobile: header three-dot button ─────────────────────────────────────────

export function AccountMenuMobileHeader() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  useOutsideDismiss(containerRef, open, () => setOpen(false))

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
    <div ref={containerRef} className="relative md:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('nav.accountOptions')}
        className="p-2.5 -mr-2.5 text-text-secondary hover:text-text-primary transition-colors"
      >
        <ThreeDotsIcon />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('nav.account')}
          className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-surface border border-border-subtle overflow-hidden shadow-[0_12px_32px_-16px_rgba(0,0,0,0.28)] motion-safe:animate-[fadein_160ms_var(--ease-out-expo)_both]"
        >
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

// ── Desktop: AppHeader top-right ────────────────────────────────────────────

export function AccountMenuDesktop({ user }: { user: AccountUser }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  useOutsideDismiss(containerRef, open, () => setOpen(false))

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

// ── Presentational: Settings page identity header ───────────────────────────

export function AccountWidget({ user }: { user: AccountUser }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar user={user} size={48} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary truncate">{primaryLabel(user)}</p>
        {user.name && user.email && (
          <p className="text-xs text-text-tertiary truncate">{user.email}</p>
        )}
      </div>
    </div>
  )
}
