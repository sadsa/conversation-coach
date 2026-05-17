// components/BottomNav.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { NAV_TABS, isTabActive } from '@/components/nav-tabs'

export function BottomNav() {
  const pathname = usePathname() ?? ''
  const { t } = useTranslation()

  return (
    // Mobile-only thumb-zone nav. On md+ the NavDrawer is the single source
    // of nav truth, so this strip is hidden to avoid a stranded mobile pattern
    // on desktop.
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border-subtle"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Quick navigation"
    >
      <div className="flex h-16 max-w-2xl mx-auto">
        {NAV_TABS.map(tab => {
          const active = isTabActive(tab, pathname)
          const IconLg = tab.iconLg
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-accent-primary' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <IconLg active={active} />
              <span className="text-xs font-medium">{t(tab.labelKey)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
