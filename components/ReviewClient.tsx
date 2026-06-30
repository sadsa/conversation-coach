// components/ReviewClient.tsx
//
// Client island for /review — the inbox of recorded conversations.
//
// Two tabs: "Needs review" (reviewed_at === null) and "Reviewed"
// (reviewed_at !== null). A session stays open until the user explicitly
// closes it from the row menu or from inside the transcript view —
// the same model as GitHub PR open/closed.

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

  const filteredOpenSessions = useMemo(() => {
    if (!searchQuery.trim()) return openSessions
    const q = searchQuery.toLowerCase()
    return openSessions.filter(s => s.title.toLowerCase().includes(q))
  }, [openSessions, searchQuery])

  const openCount = openSessions.length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-page-title">
          {t('review.title')}
        </h1>
      </header>

      <div className="border-b border-border-subtle">
        <div className="flex">
          <button
            type="button"
            onClick={() => setActiveTab('open')}
            data-testid="tab-open"
            className={`px-1 py-2.5 mr-6 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'open'
                ? 'border-accent-primary text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('review.tab.open')}
            {openCount > 0 && (
              <span
                className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-accent-primary/15 text-accent-primary font-medium tabular-nums"
                data-testid="tab-open-count"
              >
                {openCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reviewed')}
            data-testid="tab-reviewed"
            className={`px-1 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'reviewed'
                ? 'border-accent-primary text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t('review.tab.reviewed')}
          </button>
        </div>
      </div>

      {activeTab === 'open' && (
        <div className="space-y-6">
          <FilterBar
            searchQuery={searchQuery}
            searchPlaceholder={t('review.filter.searchPlaceholder')}
            filterOptions={[]}
            activeFilters={[]}
            onSearchChange={setSearchQuery}
            onFilterAdd={() => {}}
            onFilterRemove={() => {}}
          />
          {filteredOpenSessions.length === 0 ? (
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
              sessions={filteredOpenSessions}
              onDeleted={handleSessionDeleted}
              onToggleRead={handleToggleRead}
              onMarkReviewed={handleMarkReviewed}
            />
          )}
        </div>
      )}

      {activeTab === 'reviewed' && (
        <div className="space-y-6">
          {reviewedSessions.length === 0 ? (
            <p className="text-base text-text-secondary">
              {t('review.tab.reviewedEmpty')}
            </p>
          ) : (
            <SessionList
              sessions={reviewedSessions}
              onDeleted={handleSessionDeleted}
              onToggleRead={handleToggleRead}
              onMarkReviewed={handleMarkReviewed}
            />
          )}
        </div>
      )}
    </div>
  )
}
