// components/ReviewClient.tsx
//
// Client island for /review — the inbox of recorded conversations.
//
// History: this code used to live in `<HomeClient>` and back the dashboard
// at `/`. The Practise-as-home redesign moved the methodology entry point
// (mode-picker) to the root URL and pushed the inbox out to its own route.
// Behaviour preserved: polling for in-flight sessions with visibility-aware
// backoff, optimistic delete + 5s undo, swipe-to-toggle-read, an
// in-progress strip above the list, and the full list of past
// conversations below.
//
// Header now names the surface directly:
//   - The warm time-of-day greeting ("Buenos días") is HOME ONLY now —
//     that's the home's peak-end moment after onboarding and the warm
//     "I'm back" beat on every return. Duplicating it on /review was
//     stealing the home's moment and made the inbox feel like a second
//     home page instead of a focused list.
//   - The methodology eyebrow (Practise → Review → Study) appears beneath
//     the H1, with Review in accent so a user landing here via deep link
//     or share-target still has the three-pillar mental model the home
//     introduced.
//   - The write-down reminder widget that used to sit at the top of this
//     page was dropped — the bottom-nav Study tab is the single home of
//     the "items waiting" signal; a second repeat on /review was visual
//     noise on what should be a focused inbox.
//
// The share-target pickup (IndexedDB → POST /api/sessions → /sessions/[id]/status)
// now lives in `<PractiseClient>` on `/`, since that's the route the
// service worker redirects to when a file is shared from another app. We
// don't duplicate the pickup here.

'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardInProgress } from '@/components/DashboardInProgress'
import { DashboardRecentSessions } from '@/components/DashboardRecentSessions'
import { MethodologyEyebrow } from '@/components/MethodologyEyebrow'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem, SessionStatus } from '@/lib/types'

const TERMINAL_STATUSES = new Set<SessionStatus>(['ready', 'error'])

// Polling cadence — starts tight (so a freshly-uploaded clip flips to
// `ready` quickly when transcribing finishes) but backs off if the server
// keeps reporting the same status. Capped well under the typical pipeline
// duration so users never wait minutes between updates.
const POLL_BASE_MS = 3000
const POLL_BACKOFF = 1.5
const POLL_MAX_MS = 30_000

interface Props {
  initialSessions: SessionListItem[]
}

export function ReviewClient({ initialSessions }: Props) {
  const { t } = useTranslation()
  // Router only retained for parity with HomeClient ergonomics — no
  // route changes are triggered from this component today; remove if
  // future versions never need it.
  useRouter()
  const [sessions, setSessions] = useState<SessionListItem[]>(initialSessions)

  // One pending timeout per polled session, plus per-session attempt count
  // for exponential backoff. Refs so the polling loop can read its own
  // latest state without re-binding on every render.
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
    // No point burning poll cycles when the tab is hidden — the user can't
    // see the result. The visibility listener below restarts these when
    // focus returns.
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
          // Pull the canonical record once we know the pipeline finished.
          // We don't re-fetch the dashboard summary here: the pipeline
          // never auto-creates practice_items (CLAUDE.md gotcha — they're
          // only added by users inside /sessions/[id]), so the Study
          // count can't change as a side-effect of a session landing.
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

  // Initial poll fan-out for any sessions the server told us are still
  // in flight. The list itself came from the parent RSC so we don't
  // have to wait on a client fetch first.
  useEffect(() => {
    initialSessions.forEach(s => {
      if (!TERMINAL_STATUSES.has(s.status)) startPolling(s.id)
    })
    return () => stopAllPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pause polling when the tab is hidden, resume when it comes back.
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

  const inProgressSessions = useMemo(
    () => sessions.filter(s => !TERMINAL_STATUSES.has(s.status)),
    [sessions],
  )
  const recentSessions = useMemo(
    () => sessions.filter(s => TERMINAL_STATUSES.has(s.status)),
    [sessions],
  )

  return (
    // Page rhythm matches /, /write, /settings: layout owns the column
    // width and BottomNav clearance, this wrapper owns the section gap.
    // The old `max-w-2xl mx-auto` duplicated the layout cap; the old
    // `pb-[6rem+safe]` is no longer needed — layout's pb now sizes off
    // --bottom-nav-h directly.
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl md:text-4xl font-medium text-text-primary">
          {t('review.title')}
        </h1>
        <MethodologyEyebrow active="review" />
      </header>

      {/* In-progress strip — only renders when there's at least one
          processing session. Drops to the recent list below as soon as
          each session reaches a terminal status. Inter-section gap
          comes from the wrapper's space-y-8. */}
      {inProgressSessions.length > 0 && (
        <DashboardInProgress sessions={inProgressSessions} />
      )}

      {/* Conversations — the bulk of the page. The section header used
          to read "Your conversations"; we dropped it once the page H1
          took over that name. Swipe gestures live in SessionList rows;
          this wrapper just caps the visible count and surfaces the
          "Show all" / "Show fewer" toggle. */}
      <DashboardRecentSessions
        sessions={recentSessions}
        onDeleted={handleSessionDeleted}
        onToggleRead={handleToggleRead}
      />
    </div>
  )
}
