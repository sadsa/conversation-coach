// components/AppHeader.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { useTranslation } from '@/components/LanguageProvider'

interface AppHeaderProps {
  isOpen: boolean
  onOpen: () => void
}

/**
 * Derive a header label from the current route.
 *
 * Top-level sections use their nav.* translation key. Session sub-routes
 * collapse to "Session" — the page itself owns the title rendered below
 * the header, so we don't try to duplicate it here.
 */
function sectionKeyFor(pathname: string | null): string {
  if (!pathname) return ''
  if (pathname === '/') return 'nav.home'
  if (pathname.startsWith('/practice')) return 'nav.practice'
  if (pathname.startsWith('/insights')) return 'nav.insights'
  if (pathname.startsWith('/settings')) return 'nav.settings'
  if (pathname.startsWith('/sessions')) return 'nav.session'
  return ''
}

/**
 * Session sub-routes get a back arrow that takes the user up to Home.
 * router.back() is unreliable in PWA/Safari (CLAUDE.md gotcha) so we
 * use a real Link with a known destination.
 */
function backHrefFor(pathname: string | null): string | null {
  if (!pathname) return null
  if (pathname.startsWith('/sessions/')) return '/'
  return null
}

export function AppHeader({ isOpen, onOpen }: AppHeaderProps) {
  const { theme, setTheme } = useTheme()
  const pathname = usePathname()
  const { t } = useTranslation()

  const sectionKey = sectionKeyFor(pathname)
  const sectionLabel = sectionKey ? t(sectionKey) : ''
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

      <header className="fixed top-0 left-0 right-0 z-40 h-11 bg-surface border-b border-border-subtle">
        <div className="h-full max-w-4xl mx-auto px-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={onOpen}
              aria-label="Open menu"
              aria-expanded={isOpen}
              aria-controls="nav-drawer"
              className="p-2.5 -ml-2.5 text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-5 h-5" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {backHref && (
              <Link
                href={backHref}
                aria-label={t('nav.back')}
                className="p-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  className="w-5 h-5" aria-hidden="true">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </Link>
            )}

            {sectionLabel && (
              <span className="ml-1 text-sm font-medium text-text-primary truncate">
                {sectionLabel}
              </span>
            )}
          </div>

          {/* Theme toggle — 44x44 hit area for AAA touch-target compliance,
              with a smaller 32px visual circle inside so the chrome stays
              quiet. Negative margin keeps it flush with the header edge. */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="w-11 h-11 -mr-2 flex items-center justify-center flex-shrink-0 group"
          >
            <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-text-secondary group-hover:text-text-primary transition-colors">
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-4 h-4" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-4 h-4" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
            </span>
          </button>
        </div>
      </header>
    </>
  )
}
