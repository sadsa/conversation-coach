// components/NavDrawer.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import { useTranslation } from '@/components/LanguageProvider'
import { NAV_TABS, isTabActive } from '@/components/nav-tabs'
import { AccountMenuMobile, type AccountUser } from '@/components/AccountMenu'

interface NavDrawerProps {
  isOpen: boolean
  onClose: () => void
  unreadCount: number
  user: AccountUser
}

export function NavDrawer({ isOpen, onClose, unreadCount, user }: NavDrawerProps) {
  const pathname = usePathname() ?? ''
  const { t } = useTranslation()

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overflow-hidden')
    } else {
      document.body.classList.remove('overflow-hidden')
    }
    return () => { document.body.classList.remove('overflow-hidden') }
  }, [isOpen])

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const drawerRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Focus close button when drawer opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus()
    }
  }, [isOpen])

  // Focus trap — keep Tab navigation cycling inside the drawer while open.
  // The drawer has aria-modal="true"; without this, focus would escape into
  // the page underneath, which violates the modal contract.
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !drawerRef.current) return
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const swipeHandlers = useSwipeable({
    onSwipedLeft: onClose,
    trackMouse: false,
  })

  return (
    <>
      {/* Backdrop — uses the brand-tinted scrim token defined in globals.css
          rather than pure black, so the dimming feels cohesive with the
          warm-cream surface underneath. */}
      <div
        data-testid="nav-backdrop"
        className={`fixed inset-0 z-[45] bg-scrim transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        {...swipeHandlers}
        ref={drawerRef}
        id="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        style={{ transitionTimingFunction: isOpen ? 'cubic-bezier(0.25, 1, 0.5, 1)' : 'cubic-bezier(0.5, 0, 0.75, 0)' }}
        className={`fixed top-0 left-0 bottom-0 z-50 w-[280px] bg-bg flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button — same height as the header bar. Mirrored to the
            top-left so it occupies the same screen position as the hamburger
            that opened it. */}
        <div className="flex items-center h-11 px-4">
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
            className="p-2.5 -ml-2.5 text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="w-5 h-5" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 overflow-y-auto" aria-label="Main navigation">
          {NAV_TABS.map(tab => {
            const active = isTabActive(tab, pathname)
            const Icon = tab.icon
            const showBadge = tab.href === '/review' && unreadCount > 0
            const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg mx-2 transition-colors ${
                  active
                    ? 'bg-accent-chip text-accent-primary font-medium'
                    : 'text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary'
                }`}
              >
                <span className="relative">
                  <Icon active={active} />
                </span>
                <span className="text-sm font-medium">{t(tab.labelKey)}</span>
                {showBadge && (
                  <span
                    aria-label={t('nav.unreadBadge', { n: unreadCount })}
                    className="ml-auto min-w-[22px] h-5 flex items-center justify-center px-1.5 rounded-full bg-accent-primary text-on-accent text-xs font-semibold leading-none tabular-nums pointer-events-none"
                  >
                    {badgeLabel}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Divider */}
        <div className="border-t border-border-subtle mx-3" />

        {/* Account — identity + Settings / Sign out, docked at the bottom of
            the drawer. The row toggles a popover that lifts upward. */}
        <AccountMenuMobile user={user} onNavigate={onClose} />
      </div>
    </>
  )
}
