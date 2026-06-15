// components/BottomNav.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { NAV_TABS, isTabActive } from '@/components/nav-tabs'

interface Props {
  unreviewedCount: number
}

export function BottomNav({ unreviewedCount }: Props) {
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
      <div className="flex h-16 max-w-2xl mx-auto pt-1.5">
        {NAV_TABS.map(tab => {
          const active = isTabActive(tab, pathname)
          const IconLg = tab.iconLg
          const showBadge = tab.href === '/review' && unreviewedCount > 0
          const badgeLabel = unreviewedCount > 99 ? '99+' : String(unreviewedCount)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-accent-primary' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <span className="relative">
                <IconLg active={active} />
                {showBadge && (
                  <span
                    aria-label={t('nav.unreviewedBadge', { n: unreviewedCount })}
                    className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full bg-accent-primary text-on-accent text-[10px] font-semibold leading-none tabular-nums pointer-events-none"
                  >
                    {badgeLabel}
                  </span>
                )}
              </span>
              <span className="text-xs font-medium">{t(tab.labelKey)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
