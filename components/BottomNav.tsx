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
]

export function BottomNav() {
  const pathname = usePathname()
  const { t } = useTranslation()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border-subtle"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Quick navigation"
    >
      <div className="flex h-16 max-w-4xl mx-auto">
        {TABS.map(tab => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-accent-handle' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {tab.icon}
              <span className="text-sm font-medium">{t(tab.labelKey)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
