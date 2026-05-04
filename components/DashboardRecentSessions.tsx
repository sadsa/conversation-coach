// components/DashboardRecentSessions.tsx
//
// Wraps SessionList with a dashboard-friendly cap: shows only the most
// recent N sessions by default, with an unobtrusive "Show all (N)" /
// "Show fewer" toggle when there are more.
//
// We deliberately do NOT offer an Unread / All filter pill — the read vs
// unread distinction is carried by font weight + tone on each row, which
// is enough to scan at a glance without forcing a filter UI on top.
// Removing the filter also removes a class of subtle bugs where toggling
// a row's read state would optimistically drop it from the visible array
// before its slide-out animation could play.
//
// Date context lives on each row (top-right, Drive/Gmail pattern) — no
// bucket header groups, so the list is denser and the date is always
// directly adjacent to the title it describes.

'use client'
import { useState, useMemo } from 'react'
import { SessionList } from '@/components/SessionList'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem } from '@/lib/types'

const DEFAULT_VISIBLE = 5

interface Props {
  sessions: SessionListItem[]
  onDeleted?: (id: string) => void
  /**
   * Optimistic read-toggle handoff. The page owns the canonical sessions
   * array; we forward the row's request straight up without buffering. A
   * second call with the inverse value is treated as a rollback.
   */
  onToggleRead?: (id: string, makeRead: boolean) => void
}

export function DashboardRecentSessions({ sessions, onDeleted, onToggleRead }: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const visible = useMemo(
    () => (expanded ? sessions : sessions.slice(0, DEFAULT_VISIBLE)),
    [sessions, expanded],
  )

  const hiddenCount = Math.max(0, sessions.length - DEFAULT_VISIBLE)

  return (
    <section aria-labelledby="recent-sessions-heading" className="space-y-4">
      <header>
        <h2
          id="recent-sessions-heading"
          className="text-sm font-medium text-text-secondary uppercase tracking-wider"
        >
          {t('home.recentSessionsTitle')}
        </h2>
      </header>

      <SessionList
        sessions={visible}
        onDeleted={onDeleted}
        onToggleRead={onToggleRead}
      />

      {hiddenCount > 0 && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setExpanded(prev => !prev)}
            aria-expanded={expanded}
            className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5"
          >
            {expanded
              ? t('home.recentShowFewer')
              : t('home.recentShowAll', { n: sessions.length })}
          </button>
        </div>
      )}
    </section>
  )
}
