// components/NavDrawer.tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useTranslation } from '@/components/LanguageProvider'
import { NAV_TABS, isTabActive } from '@/components/nav-tabs'

interface NavDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function NavDrawer({ isOpen, onClose }: NavDrawerProps) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
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

  async function handleSignOut() {
    await getSupabaseBrowserClient().auth.signOut()
    onClose()
    router.push('/login')
  }

  return (
    <>
      {/* Backdrop — uses the brand-tinted scrim token defined in globals.css
          rather than pure black, so the dimming feels cohesive with the
          warm-cream surface underneath. */}
      <div
        data-testid="nav-backdrop"
        className={`fixed inset-0 z-40 bg-scrim transition-opacity duration-300 ${
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
        className={`fixed top-0 left-0 bottom-0 z-50 w-[280px] bg-surface border-r border-border-subtle flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button — same height as the header bar. Mirrored to the
            top-left so it occupies the same screen position as the hamburger
            that opened it. */}
        <div className="flex items-center h-11 px-4 border-b border-border-subtle">
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close menu"
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
                {tab.icon}
                <span className="text-sm font-medium">{t(tab.labelKey)}</span>
              </Link>
            )
          })}
        </nav>

        {/* Divider */}
        <div className="border-t border-border-subtle mx-3" />

        {/* Sign out — destructive auth action, treated quieter than the
            primary nav but with a distinct error tint on hover so it doesn't
            blend into the navigation list. The icon adds an unambiguous
            "leave" affordance. */}
        <div className="p-3">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-text-tertiary hover:bg-error-surface hover:text-on-error-surface transition-colors text-left text-sm font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="w-5 h-5 flex-shrink-0" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>{t('nav.signOut')}</span>
          </button>
        </div>
      </div>
    </>
  )
}
