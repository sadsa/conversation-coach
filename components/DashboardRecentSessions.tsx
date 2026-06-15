// components/DashboardRecentSessions.tsx
//
// Wraps SessionList with an empty-state fallback and an accessible section
// landmark. All sessions passed in are rendered — callers control filtering
// and truncation.
//
// The old DEFAULT_VISIBLE cap and "Show all (N)" toggle were removed when the
// review page adopted a two-tier layout (unreviewed / reviewed). The pending
// tier is a work queue and hiding items from it undersells urgency.

'use client'
import Link from 'next/link'
import { SessionList } from '@/components/SessionList'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem } from '@/lib/types'

interface Props {
  sessions: SessionListItem[]
  onDeleted?: (id: string) => void
  /**
   * Optimistic read-toggle handoff. The page owns the canonical sessions
   * array; we forward the row's request straight up without buffering. A
   * second call with the inverse value is treated as a rollback.
   */
  onToggleReviewed?: (id: string, makeReviewed: boolean) => void
}

export function DashboardRecentSessions({
  sessions,
  onDeleted,
  onToggleReviewed,
}: Props) {
  const { t } = useTranslation()

  return (
    <section aria-label={t('home.recentSessionsTitle')} className="space-y-3">
      {sessions.length === 0 ? (
        <p className="max-w-prose text-base leading-relaxed text-text-secondary text-pretty">
          {t('review.emptyLine')}
          <br />
          <Link
            href="/"
            className="font-semibold text-accent-primary border-b border-accent-primary/35 pb-px transition-colors hover:border-accent-primary"
          >
            {t('review.emptyCta')}
          </Link>
        </p>
      ) : (
        <SessionList
          sessions={sessions}
          onDeleted={onDeleted}
          onToggleReviewed={onToggleReviewed}
        />
      )}
    </section>
  )
}
