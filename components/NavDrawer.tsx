// components/NavDrawer.tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { useTranslation } from '@/components/LanguageProvider'

const TABS = [
  {
    href: '/',
    labelKey: 'nav.home',
    exact: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-5 h-5 flex-shrink-0" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/practice',
    labelKey: 'nav.practice',
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-5 h-5 flex-shrink-0" aria-hidden="true">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    href: '/insights',
    labelKey: 'nav.insights',
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-5 h-5 flex-shrink-0" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: '/settings',
    labelKey: 'nav.settings',
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-5 h-5 flex-shrink-0" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

interface NavDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export function NavDrawer({ isOpen, onClose }: NavDrawerProps) {
  const pathname = usePathname()
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

  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Focus close button when drawer opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus()
    }
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
      {/* Backdrop */}
      <div
        data-testid="nav-backdrop"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        {...swipeHandlers}
        id="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        style={{ transitionTimingFunction: isOpen ? 'cubic-bezier(0.25, 1, 0.5, 1)' : 'cubic-bezier(0.5, 0, 0.75, 0)' }}
        className={`fixed top-0 left-0 bottom-0 z-50 w-[280px] bg-surface border-r border-border-subtle flex flex-col transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button — same height as the header bar */}
        <div className="flex items-center justify-end h-11 px-4 border-b border-border-subtle">
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close menu"
            className="p-1 text-text-tertiary hover:text-text-secondary transition-colors"
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
          {TABS.map(tab => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
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

        {/* Sign out */}
        <div className="p-3">
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-surface text-text-secondary hover:bg-surface-elevated transition-colors text-left"
          >
            {t('settings.signOut')}
          </button>
        </div>
      </div>
    </>
  )
}
