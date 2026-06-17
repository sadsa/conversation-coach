// components/AppHeader.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { NAV_TABS, isTabActive } from '@/components/nav-tabs'
import { AccountMenuDesktop, AccountMenuMobileHeader, type AccountUser } from '@/components/AccountMenu'

interface AppHeaderProps {
  user: AccountUser
}

function backHrefFor(pathname: string | null): string | null {
  if (!pathname) return null
  if (pathname.startsWith('/sessions/')) return '/review'
  return null
}

export function AppHeader({ user }: AppHeaderProps) {
  const pathname = usePathname()
  const { t } = useTranslation()

  const backHref = backHrefFor(pathname)

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-accent-primary focus:text-white focus:text-sm focus:font-medium"
      >
        {t('nav.skipToContent')}
      </a>

      <header
        style={{
          height: 'calc(var(--header-height) + env(safe-area-inset-top))',
          paddingTop: 'env(safe-area-inset-top)',
        }}
        className="fixed top-0 left-0 right-0 z-40 bg-bg"
      >
        <div
          style={{ height: 'var(--header-height)' }}
          className="max-w-2xl mx-auto px-4 md:px-10 flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-1 min-w-0">
            {/* Back arrow — mobile only on session sub-routes */}
            {backHref && (
              <Link
                href={backHref}
                aria-label={t('nav.back')}
                className="md:hidden p-2.5 -ml-2.5 text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  className="w-5 h-5" aria-hidden="true">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </Link>
            )}

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

          {/* Right side: three-dot on mobile, avatar on desktop */}
          <div className="flex items-center">
            <AccountMenuMobileHeader user={user} />
            <AccountMenuDesktop user={user} />
          </div>
        </div>
      </header>
    </>
  )
}
