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
// Within the visible window we group rows under date buckets — Today,
// Yesterday, This week, Earlier — so the list reads as something curated
// rather than a flat scroll of identical-looking rows. The bucket header
// carries the date context, so each row's date label only needs to add
// the time or weekday (see formatRowDate in SessionList).

'use client'
import { useState, useMemo } from 'react'
import { SessionList } from '@/components/SessionList'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem } from '@/lib/types'

const DEFAULT_VISIBLE = 5

type Bucket = 'today' | 'yesterday' | 'thisWeek' | 'earlier'

const BUCKET_ORDER: Bucket[] = ['today', 'yesterday', 'thisWeek', 'earlier']

const BUCKET_LABEL_KEY: Record<Bucket, string> = {
  today: 'home.recentBucketToday',
  yesterday: 'home.recentBucketYesterday',
  thisWeek: 'home.recentBucketThisWeek',
  earlier: 'home.recentBucketEarlier',
}

function bucketFor(createdAt: string, now: Date): Bucket {
  const date = new Date(createdAt)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 6)

  if (date >= startOfToday) return 'today'
  if (date >= startOfYesterday) return 'yesterday'
  if (date >= startOfWeek) return 'thisWeek'
  return 'earlier'
}

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

  // Group the visible sessions by bucket. We compute `now` once per render so
  // every row sees a consistent reference point, and we preserve the original
  // (newest-first) ordering inside each bucket.
  const groups = useMemo(() => {
    const now = new Date()
    const map = new Map<Bucket, SessionListItem[]>()
    for (const s of visible) {
      const b = bucketFor(s.created_at, now)
      const list = map.get(b)
      if (list) list.push(s)
      else map.set(b, [s])
    }
    return BUCKET_ORDER
      .map(b => ({ bucket: b, items: map.get(b) ?? [] }))
      .filter(g => g.items.length > 0)
  }, [visible])

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

      {/*
        Generous gap *between* buckets, tight gap *inside* a bucket. This is
        the rhythm trick: relatedness compresses, separation expands. The
        SessionList itself uses divide-y to keep rows snug.
      */}
      <div className="space-y-6">
        {groups.map(group => (
          <div key={group.bucket} className="space-y-2">
            {/* Hide the bucket label when there's only one group — the
                section header above already tells you these are recent
                conversations, and a lone "EARLIER" stripe just adds
                visual noise. */}
            {groups.length > 1 && (
              <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
                {t(BUCKET_LABEL_KEY[group.bucket])}
              </h3>
            )}
            <SessionList
              sessions={group.items}
              onDeleted={onDeleted}
              onToggleRead={onToggleRead}
            />
          </div>
        ))}
      </div>

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
