// components/AppHeader.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { NAV_TABS, isTabActive } from '@/components/nav-tabs'
import { AccountMenuDesktop, type AccountUser } from '@/components/AccountMenu'

interface AppHeaderProps {
  isOpen: boolean
  onOpen: () => void
  user: AccountUser
}

/**
 * Session sub-routes get a back arrow. The back destination is the
 * Review inbox now (where the user came from to open a transcript),
 * not the Practise home. router.back() is unreliable in PWA/Safari
 * (CLAUDE.md gotcha) so we use a real Link with a known destination.
 */
function backHrefFor(pathname: string | null): string | null {
  if (!pathname) return null
  if (pathname.startsWith('/sessions/')) return '/review'
  return null
}

export function AppHeader({ isOpen, onOpen, user }: AppHeaderProps) {
  const pathname = usePathname()
  const { t } = useTranslation()

  const backHref = backHrefFor(pathname)

  return (
    <>
      {/* Skip-link — visually hidden until keyboard-focused. Lets a screen-reader
          or keyboard user jump past the chrome straight to page content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-accent-primary focus:text-white focus:text-sm focus:font-medium"
      >
        {t('nav.skipToContent')}
      </a>

      <header
        // The header shares the page background and extends up under the
        // iOS status bar (safe-area-inset-top) so it blends seamlessly with
        // the content below. Inner row keeps `var(--header-height)` so all
        // the existing 44px hit-areas and visual rhythm stay correct.
        style={{
          height: 'calc(var(--header-height) + env(safe-area-inset-top))',
          paddingTop: 'env(safe-area-inset-top)',
        }}
        className="fixed top-0 left-0 right-0 z-40 bg-bg"
      >
        {/* Header inner row tracks the same 672px reading column the page
            content uses (see <main> in app/layout.tsx). Without this match
            the menu/back/section-label cluster would float left of where
            the page content starts on wide viewports. */}
        <div
          style={{ height: 'var(--header-height)' }}
          className="max-w-2xl mx-auto px-4 md:px-10 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-1 min-w-0">
            {/* Hamburger — mobile only; desktop uses inline nav links below */}
            <button
              onClick={onOpen}
              aria-label={t('nav.openMenu')}
              aria-expanded={isOpen}
              aria-controls="nav-drawer"
              className="md:hidden p-2.5 -ml-2.5 text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-5 h-5" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {/* Back arrow — mobile only on sub-routes. Desktop already shows
                the full inline nav, so the back arrow is redundant there —
                the "Recordings" tab is the return affordance. */}
            {backHref && (
              <Link
                href={backHref}
                aria-label={t('nav.back')}
                className="md:hidden p-2.5 -ml-1 text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  className="w-5 h-5" aria-hidden="true">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </Link>
            )}

            {/* No section label on mobile — the page owns its title. The
                big serif H1 below names the surface (greeting on /,
                "Your conversations" on /review, etc.), so repeating the
                pillar name up here was pure redundant chrome. Wayfinding
                still lives in the bottom nav (active tab) and the
                methodology eyebrow. Desktop shows the inline nav below. */}

            {/* Inline nav links — desktop only */}
            <nav
              className="hidden md:flex items-center gap-0.5 -ml-1"
              aria-label={t('nav.quickNavAria')}
            >
              {NAV_TABS.map(tab => {
                const active = isTabActive(tab, pathname ?? '')
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={active ? 'page' : undefined}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? 'bg-accent-chip text-accent-primary'
                        : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-elevated'
                    }`}
                  >
                    {t(tab.labelKey)}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Account — desktop only. Mobile reaches Settings / Sign out via
              the NavDrawer footer; the avatar would otherwise duplicate it. */}
          <AccountMenuDesktop user={user} />
        </div>
      </header>
    </>
  )
}
