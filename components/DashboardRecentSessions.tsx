// components/DashboardRecentSessions.tsx
//
// Wraps SessionList with a dashboard-friendly cap: shows only the most
// recent N sessions by default, with an unobtrusive "Show all (N)" /
// "Show fewer" toggle when there are more.
//
// Inbox model: a two-pill segmented filter sits above the list — Unread |
// All — defaulting to Unread when there's anything unread. The active
// filter persists per device (localStorage) so repeated visits don't reset
// it. When the user reaches "all caught up", the empty state offers a
// one-tap switch to All so they're never stuck staring at nothing.
//
// Within the visible window we group rows under date buckets — Today,
// Yesterday, This week, Earlier — so the list reads as something curated
// rather than five lookalike rows. The bucket header carries the date
// context, so each row's date label only needs to add the time or
// weekday (see formatRowDate in SessionList).

'use client'
import { useState, useMemo, useEffect } from 'react'
import { SessionList } from '@/components/SessionList'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem } from '@/lib/types'

const DEFAULT_VISIBLE = 5
const FILTER_STORAGE_KEY = 'recentSessionsFilter'

type Filter = 'unread' | 'all'

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

function isSessionUnread(s: SessionListItem): boolean {
  // Unread only applies to ready sessions (in-progress + error rows already
  // have their own status signals). See SessionList for the matching check.
  return s.status === 'ready' && s.last_viewed_at == null
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

  const unreadCount = useMemo(
    () => sessions.filter(isSessionUnread).length,
    [sessions],
  )

  // Default filter: Unread when there's something unread, otherwise All.
  // We only consult localStorage after mount so SSR + first paint don't
  // disagree with the client.
  const [filter, setFilter] = useState<Filter>(unreadCount > 0 ? 'unread' : 'all')
  const [filterHydrated, setFilterHydrated] = useState(false)

  useEffect(() => {
    const stored = typeof window !== 'undefined'
      ? window.localStorage.getItem(FILTER_STORAGE_KEY)
      : null
    if (stored === 'unread' || stored === 'all') {
      setFilter(stored)
    } else if (unreadCount === 0) {
      setFilter('all')
    }
    setFilterHydrated(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist user choice. Skip the very first render (before hydration) so we
  // don't overwrite the stored value with the SSR default.
  useEffect(() => {
    if (!filterHydrated) return
    if (typeof window === 'undefined') return
    window.localStorage.setItem(FILTER_STORAGE_KEY, filter)
  }, [filter, filterHydrated])

  // Filter first, then cap to the visible window. Cap counts the filtered
  // list so "Show all" reflects the visible scope, not the global one.
  const filteredSessions = useMemo(
    () => (filter === 'unread' ? sessions.filter(isSessionUnread) : sessions),
    [sessions, filter],
  )

  const visible = useMemo(
    () => (expanded ? filteredSessions : filteredSessions.slice(0, DEFAULT_VISIBLE)),
    [filteredSessions, expanded],
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

  const hiddenCount = Math.max(0, filteredSessions.length - DEFAULT_VISIBLE)
  const isUnreadEmpty = filter === 'unread' && filteredSessions.length === 0

  return (
    <section aria-labelledby="recent-sessions-heading" className="space-y-4">
      <header>
        <h2
          id="recent-sessions-heading"
          className="text-sm font-medium text-text-secondary uppercase tracking-wider"
        >
          {t('home.recentSessionsTitle')}
        </h2>
        {/* The unread count lives on the Unread filter pill below; we
            deliberately don't repeat it here to keep the header calm. */}
      </header>

      {/*
        Two-pill segmented control. Sits as a row of buttons inside a
        single rounded "track" so the selected state reads as a clear
        chip rather than two competing buttons. Per impeccable rules,
        no border-left stripes — the active pill carries weight via
        background + foreground colour change.
      */}
      <div
        role="tablist"
        aria-label={t('home.recentFilterAria')}
        className="inline-flex items-center gap-1 p-1 rounded-full bg-surface-elevated border border-border-subtle"
      >
        <FilterPill
          isActive={filter === 'unread'}
          onClick={() => setFilter('unread')}
          label={t('home.recentFilterUnread')}
          count={unreadCount}
        />
        <FilterPill
          isActive={filter === 'all'}
          onClick={() => setFilter('all')}
          label={t('home.recentFilterAll')}
        />
      </div>

      {isUnreadEmpty ? (
        <AllCaughtUpEmpty onShowAll={() => setFilter('all')} />
      ) : (
        <>
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
                  removeOnRead={filter === 'unread'}
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
                  : t('home.recentShowAll', { n: filteredSessions.length })}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function FilterPill({
  isActive,
  onClick,
  label,
  count,
}: {
  isActive: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
        isActive
          ? 'bg-surface text-text-primary shadow-sm'
          : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      <span>{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span
          className={`tabular-nums text-xs px-1.5 py-0.5 rounded-full ${
            isActive
              ? 'bg-accent-chip text-on-accent-chip'
              : 'bg-bg text-text-tertiary'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function AllCaughtUpEmpty({ onShowAll }: { onShowAll: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      data-testid="recent-sessions-all-caught-up"
      className="rounded-xl border border-dashed border-border-subtle px-6 py-10 text-center space-y-3"
    >
      <p className="text-base font-medium text-text-primary">
        {t('home.recentAllCaughtUpTitle')}
      </p>
      <p className="text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">
        {t('home.recentAllCaughtUpBody')}
      </p>
      <button
        type="button"
        onClick={onShowAll}
        className="inline-flex items-center gap-1 text-sm font-medium text-text-primary hover:text-accent-primary transition-colors"
      >
        {t('home.recentAllCaughtUpShowAll')}
      </button>
    </div>
  )
}
