// components/ReviewClient.tsx
//
// Client island for /review — the inbox of recorded conversations.
//
// Layout: a single search field on top, then two tabs — "Needs review"
// (reviewed_at === null) and "Reviewed" (reviewed_at !== null) — docked
// flush onto the session list. A session stays open until the user
// explicitly closes it from the row menu or from inside the transcript
// view — the same model as GitHub PR open/closed.
//
// Search spans BOTH pools: each tab filters its own pool and carries a
// live match-count badge, so a hit hiding in the inactive tab stays
// visible. When the active tab has no matches but the other does, a
// recovery line offers to switch.

'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SessionList } from '@/components/SessionList'
import { FilterBar } from '@/components/FilterBar'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem, SessionStatus } from '@/lib/types'

const TERMINAL_STATUSES = new Set<SessionStatus>(['ready', 'error'])

const POLL_BASE_MS = 3000
const POLL_BACKOFF = 1.5
const POLL_MAX_MS = 30_000

type ReviewTab = 'open' | 'reviewed'

interface Props {
  initialSessions: SessionListItem[]
}

export function ReviewClient({ initialSessions }: Props) {
  const { t } = useTranslation()
  useRouter()
  const [sessions, setSessions] = useState<SessionListItem[]>(initialSessions)
  const [activeTab, setActiveTab] = useState<ReviewTab>('open')
  const [searchQuery, setSearchQuery] = useState('')

  const pollTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pollAttempts = useRef<Map<string, number>>(new Map())

  const stopPolling = useCallback((sessionId: string) => {
    const id = pollTimeouts.current.get(sessionId)
    if (id) clearTimeout(id)
    pollTimeouts.current.delete(sessionId)
    pollAttempts.current.delete(sessionId)
  }, [])

  const stopAllPolling = useCallback(() => {
    pollTimeouts.current.forEach(id => clearTimeout(id))
    pollTimeouts.current.clear()
    pollAttempts.current.clear()
  }, [])

  const startPolling = useCallback((sessionId: string) => {
    if (pollTimeouts.current.has(sessionId)) return
    if (typeof document !== 'undefined' && document.hidden) return

    const attempt = pollAttempts.current.get(sessionId) ?? 0
    const delay = Math.min(POLL_BASE_MS * Math.pow(POLL_BACKOFF, attempt), POLL_MAX_MS)

    const timeoutId = setTimeout(async () => {
      pollTimeouts.current.delete(sessionId)
      try {
        const res = await fetch(`/api/sessions/${sessionId}/status`)
        if (!res.ok) {
          pollAttempts.current.set(sessionId, attempt + 1)
          startPolling(sessionId)
          return
        }
        const { status } = await res.json() as { status: SessionStatus }

        if (TERMINAL_STATUSES.has(status)) {
          pollAttempts.current.delete(sessionId)
          const listRes = await fetch('/api/sessions')
          if (listRes.ok) setSessions(await listRes.json())
        } else {
          setSessions(prev =>
            prev.map(s => s.id === sessionId ? { ...s, status } : s),
          )
          pollAttempts.current.set(sessionId, attempt + 1)
          startPolling(sessionId)
        }
      } catch {
        pollAttempts.current.set(sessionId, attempt + 1)
        startPolling(sessionId)
      }
    }, delay)
    pollTimeouts.current.set(sessionId, timeoutId)
  }, [])

  useEffect(() => {
    initialSessions.forEach(s => {
      if (!TERMINAL_STATUSES.has(s.status)) startPolling(s.id)
    })
    return () => stopAllPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) {
        stopAllPolling()
        return
      }
      sessions.forEach(s => {
        if (!TERMINAL_STATUSES.has(s.status)) startPolling(s.id)
      })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [sessions, startPolling, stopAllPolling])

  function handleSessionDeleted(id: string) {
    stopPolling(id)
    setSessions(prev => prev.filter(s => s.id !== id))
  }

  const handleToggleRead = useCallback((id: string, makeRead: boolean) => {
    setSessions(prev =>
      prev.map(s =>
        s.id === id
          ? { ...s, last_viewed_at: makeRead ? new Date().toISOString() : null }
          : s,
      ),
    )
  }, [])

  const handleMarkReviewed = useCallback((id: string, reviewed: boolean) => {
    setSessions(prev =>
      prev.map(s =>
        s.id === id
          ? { ...s, reviewed_at: reviewed ? new Date().toISOString() : null }
          : s,
      ),
    )
  }, [])

  const openSessions = useMemo(
    () => sessions.filter(s => s.reviewed_at === null),
    [sessions],
  )
  const reviewedSessions = useMemo(
    () => sessions.filter(s => s.reviewed_at !== null),
    [sessions],
  )

  const filterByQuery = useCallback(
    (list: SessionListItem[]) => {
      const q = searchQuery.trim().toLowerCase()
      if (!q) return list
      return list.filter(s => s.title.toLowerCase().includes(q))
    },
    [searchQuery],
  )

  const filteredOpen = useMemo(() => filterByQuery(openSessions), [filterByQuery, openSessions])
  const filteredReviewed = useMemo(() => filterByQuery(reviewedSessions), [filterByQuery, reviewedSessions])

  const hasQuery = searchQuery.trim().length > 0
  const activeList = activeTab === 'open' ? filteredOpen : filteredReviewed
  const otherTab: ReviewTab = activeTab === 'open' ? 'reviewed' : 'open'
  const otherList = activeTab === 'open' ? filteredReviewed : filteredOpen
  const otherTabLabel = t(otherTab === 'open' ? 'review.tab.open' : 'review.tab.reviewed')

  function renderTab(tab: ReviewTab, label: string, count: number) {
    const isActive = activeTab === tab
    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab)}
        data-testid={`tab-${tab}`}
        className={`px-1 py-2.5 mr-6 text-sm font-medium border-b-2 -mb-px transition-colors ${
          isActive
            ? 'border-accent-primary text-text-primary'
            : 'border-transparent text-text-secondary hover:text-text-primary'
        }`}
      >
        {label}
        <span
          className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium tabular-nums transition-colors ${
            isActive
              ? 'bg-accent-primary/15 text-accent-primary'
              : 'bg-surface-elevated text-text-tertiary'
          }`}
          data-testid={`tab-${tab}-count`}
        >
          {count}
        </span>
      </button>
    )
  }

  // The active list is empty: decide between a search-recovery line and the
  // genuine no-query empty states. Wrapped in a top-bordered box so the tab
  // underline keeps its baseline even when no SessionList renders.
  function renderEmpty() {
    if (hasQuery) {
      if (otherList.length > 0) {
        return (
          <p className="text-base leading-relaxed text-text-secondary text-pretty">
            {t('review.search.noneHere')}{' '}
            <button
              type="button"
              onClick={() => setActiveTab(otherTab)}
              data-testid="search-see-other"
              className="font-semibold text-accent-primary border-b border-accent-primary/35 pb-px transition-colors hover:border-accent-primary"
            >
              {t('review.search.seeOther', { count: otherList.length, tab: otherTabLabel })}
            </button>
          </p>
        )
      }
      return (
        <p className="text-base leading-relaxed text-text-secondary text-pretty" data-testid="search-no-matches">
          {t('review.search.noMatches', { query: searchQuery.trim() })}
        </p>
      )
    }

    if (activeTab === 'open') {
      return (
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
      )
    }

    return (
      <p className="text-base text-text-secondary">
        {t('review.tab.reviewedEmpty')}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-page-title">
          {t('review.title')}
        </h1>
      </header>

      <div className="space-y-3">
        <FilterBar
          searchQuery={searchQuery}
          searchPlaceholder={t('review.filter.searchPlaceholder')}
          filterOptions={[]}
          activeFilters={[]}
          onSearchChange={setSearchQuery}
          onFilterAdd={() => {}}
          onFilterRemove={() => {}}
        />

        <div>
          <div className="flex" role="tablist">
            {renderTab('open', t('review.tab.open'), filteredOpen.length)}
            {renderTab('reviewed', t('review.tab.reviewed'), filteredReviewed.length)}
          </div>

          {activeList.length === 0 ? (
            <div className="border-t border-border-subtle pt-6">{renderEmpty()}</div>
          ) : (
            <SessionList
              sessions={activeList}
              onDeleted={handleSessionDeleted}
              onToggleRead={handleToggleRead}
              onMarkReviewed={handleMarkReviewed}
            />
          )}
        </div>
      </div>
    </div>
  )
}
