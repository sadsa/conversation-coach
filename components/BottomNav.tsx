// components/BottomNav.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'

const TABS = [
  {
    href: '/',
    labelKey: 'nav.home',
    exact: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-6 h-6" aria-hidden="true">
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
        className="w-6 h-6" aria-hidden="true">
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
    href: '/flashcards',
    labelKey: 'nav.flashcards',
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-6 h-6" aria-hidden="true">
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
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
        className="w-6 h-6" aria-hidden="true">
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
        className="w-6 h-6" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

export function BottomNav() {
  const pathname = usePathname()
  const { t } = useTranslation()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-gray-800"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="flex h-16 max-w-4xl mx-auto">
        {TABS.map(tab => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={t(tab.labelKey)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex items-center justify-center transition-colors ${
                active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.icon}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
