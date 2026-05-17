// components/DashboardRecentSessions.tsx
//
// Wraps SessionList with a dashboard-friendly cap: shows only the most
// recent N sessions by default, with an unobtrusive "Show all (N)" /
// "Show fewer" toggle when there are more.
//
// Used to render a "Your conversations" section heading above the list.
// Dropped once /review's page H1 took over that exact phrasing — having
// the same name in two stacked elements was double-billing the surface.
// The list itself becomes the section; the page H1 is the only label.
// The translation key `home.recentSessionsTitle` is retained in i18n.ts
// because it still backs the screen-reader landmark below.

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

export function DashboardRecentSessions({
  sessions,
  onDeleted,
  onToggleRead,
}: Props) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const visible = useMemo(
    () => (expanded ? sessions : sessions.slice(0, DEFAULT_VISIBLE)),
    [sessions, expanded],
  )

  const hiddenCount = Math.max(0, sessions.length - DEFAULT_VISIBLE)

  return (
    <section aria-label={t('home.recentSessionsTitle')} className="space-y-3">
      {sessions.length === 0 ? (
        <p className="text-sm text-text-tertiary leading-relaxed">
          {t('home.noRecordingsYet')}
        </p>
      ) : (
        <>
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
        </>
      )}
    </section>
  )
}
