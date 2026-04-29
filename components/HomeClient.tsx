'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { HomeUploadFab } from '@/components/HomeUploadFab'
import { UploadCoachmark } from '@/components/UploadCoachmark'
import { DashboardOnboarding } from '@/components/DashboardOnboarding'
import { DashboardReminders } from '@/components/DashboardReminders'
import { DashboardInProgress } from '@/components/DashboardInProgress'
import { DashboardRecentSessions } from '@/components/DashboardRecentSessions'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem, SessionStatus } from '@/lib/types'
import type { DashboardSummary } from '@/lib/dashboard-summary'

const TERMINAL_STATUSES = new Set<SessionStatus>(['ready', 'error'])

// Polling cadence — starts tight (so a freshly-uploaded clip flips to
// `ready` quickly when transcribing finishes) but backs off if the server
// keeps reporting the same status. Capped well under the typical
// pipeline duration so users never wait minutes between updates.
const POLL_BASE_MS = 3000
const POLL_BACKOFF = 1.5
const POLL_MAX_MS = 30_000

// Versioned localStorage key so a future coachmark redesign can re-trigger
// for users who've already seen v1 by bumping this string. Set on dismiss
// or on first successful upload — once the user has demonstrably "got it",
// we never show the spotlight again.
const COACHMARK_SEEN_KEY = 'coachmark.uploadFab.seen.v1'

function pickGreetingKey(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'home.greetingMorning'
  if (hour < 18) return 'home.greetingAfternoon'
  return 'home.greetingEvening'
}

interface Props {
  initialSessions: SessionListItem[]
  initialSummary: DashboardSummary | null
}

export function HomeClient({ initialSessions, initialSummary }: Props) {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<SessionListItem[]>(initialSessions)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(initialSummary)
  // Coachmark visibility starts false on the server (no localStorage there)
  // and on first client paint — the useEffect below promotes it to true if
  // the user is in the empty state and hasn't dismissed it before. Doing
  // this in an effect avoids a hydration mismatch flash.
  const [coachmarkVisible, setCoachmarkVisible] = useState(false)
  // One pending timeout per polled session, plus per-session attempt
  // count for exponential backoff. Refs so the polling loop can read its
  // own latest state without re-binding on every render.
  const pollTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pollAttempts = useRef<Map<string, number>>(new Map())

  const greetingKey = useMemo(() => pickGreetingKey(new Date()), [])

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
    // No point burning poll cycles when the tab is hidden — the user
    // can't see the result. The visibility listener below restarts
    // these when focus returns.
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
          const listRes = await fetch('/api/sessions')
          if (listRes.ok) setSessions(await listRes.json())
          fetch('/api/dashboard-summary')
            .then(r => r.ok ? r.json() : null)
            .then((data: DashboardSummary | null) => { if (data) setSummary(data) })
            .catch(() => { /* non-critical */ })
        } else {
          // Status hasn't moved yet — keep our local row in sync and
          // back off for the next poll so a slow analysis pass doesn't
          // hammer the API every 3s for ten minutes.
          setSessions(prev =>
            prev.map(s => s.id === sessionId ? { ...s, status } : s)
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
    // We deliberately depend only on the initial list — re-firing this
    // effect when `sessions` changes would double-poll. New sessions
    // added via `doUpload` start their own polling explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pause polling when the tab is hidden, resume when it comes back.
  // We re-scan `sessions` on resume because the user may have navigated
  // away and back, and the list of in-flight items can have changed.
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

  // Coachmark visibility — derived from `sessions` so we can't read it here
  // (sessions is stateful and reads further down rely on it). We re-derive
  // `isFirstTime` locally so this block stays self-contained and the hook
  // order is independent of the rest of the component.
  const coachmarkEligible = sessions.length === 0
  // Promote the coachmark on the client only — reading localStorage during
  // render would break SSR, and showing it before hydration would risk a
  // visible flash for returning users who've already dismissed it.
  // The effect re-runs when eligibility flips so the coachmark hides the
  // moment the first session lands (whether via the upload path below or
  // a polling refresh from another tab).
  useEffect(() => {
    if (!coachmarkEligible) {
      setCoachmarkVisible(false)
      return
    }
    if (typeof window === 'undefined') return
    try {
      if (window.localStorage.getItem(COACHMARK_SEEN_KEY)) return
    } catch {
      // localStorage can throw in private modes or with quota issues —
      // err on the side of showing the hint rather than swallowing it.
    }
    setCoachmarkVisible(true)
  }, [coachmarkEligible])

  const dismissCoachmark = useCallback(() => {
    setCoachmarkVisible(false)
    try {
      window.localStorage.setItem(COACHMARK_SEEN_KEY, '1')
    } catch {
      // Same fallback as above — if we can't persist, the worst case is
      // the hint reappears next visit. Not catastrophic.
    }
  }, [])

  const doUpload = useCallback(async (file: File) => {
    setUploading(true)
    setError(null)
    const ext = file.name.split('.').pop() ?? 'mp3'
    const duration_seconds = await getAudioDuration(file)

    const createRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', extension: ext, original_filename: file.name }),
    })
    if (!createRes.ok) { setError('Failed to create session'); setUploading(false); return }
    const { session_id, upload_url } = await createRes.json() as { session_id: string; upload_url: string }

    try {
      const uploadRes = await fetch(upload_url, { method: 'PUT', body: file })
      if (!uploadRes.ok) throw new Error('Upload failed')
    } catch {
      await fetch(`/api/sessions/${session_id}/upload-failed`, { method: 'POST' })
      setError(t('home.uploadFailed'))
      setUploading(false)
      return
    }

    await fetch(`/api/sessions/${session_id}/upload-complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration_seconds }),
    })

    const newSession: SessionListItem = {
      id: session_id,
      title: file.name,
      status: 'transcribing',
      duration_seconds,
      created_at: new Date().toISOString(),
      processing_completed_at: null,
      last_viewed_at: null,
    }
    setSessions(prev => [newSession, ...prev])
    startPolling(session_id)
    setUploading(false)
  }, [t, startPolling])

  const handleFile = useCallback((file: File) => {
    // Tapping the FAB to upload is the strongest possible "I understood
    // the hint" signal, so we retire the coachmark here too — not just on
    // explicit dismiss. Belt-and-braces with the isFirstTime effect above:
    // even if the upload fails and they never get a session, the spotlight
    // doesn't re-fire on next visit because the flag is now set.
    dismissCoachmark()
    void doUpload(file)
  }, [doUpload, dismissCoachmark])

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return
    readPendingShare().then(file => {
      if (file) handleFile(file)
    })
  }, [handleFile])

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

  const isFirstTime = sessions.length === 0
  // First-run users haven't recorded anything yet, so the default
  // "quiet place to review what you've recorded" subtitle would be
  // a small lie. Swap to a welcoming variant that fits the empty state.
  const subtitleKey = isFirstTime ? 'home.firstRunSubtitle' : 'home.dashboardSubtitle'

  const inProgressSessions = useMemo(
    () => sessions.filter(s => !TERMINAL_STATUSES.has(s.status)),
    [sessions],
  )
  const recentSessions = useMemo(
    () => sessions.filter(s => TERMINAL_STATUSES.has(s.status)),
    [sessions],
  )

  return (
    <div className="max-w-2xl mx-auto space-y-12 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-0">
      {coachmarkVisible && <UploadCoachmark onDismiss={dismissCoachmark} />}
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2 flex-1">
            <h1 className="font-display text-3xl md:text-4xl font-medium text-text-primary">
              {t(greetingKey)}
            </h1>
            <p className="text-text-secondary leading-relaxed">
              {t(subtitleKey)}
            </p>
          </div>
          <HomeUploadFab
            onFile={handleFile}
            onPickInvalid={msg => setError(msg)}
            disabled={uploading}
            // While the coachmark is visible the mobile FAB lifts above
            // its dim backdrop and grows a soft halo so it reads as the
            // spotlight subject. Resting (no coachmark) it returns to the
            // ordinary z-40 floating control.
            highlight={coachmarkVisible}
          />
        </div>
      </header>

      {isFirstTime ? (
        <>
          <DashboardOnboarding />
          {error && (
            <p className="text-sm text-status-error" aria-live="polite">{error}</p>
          )}
        </>
      ) : (
        <>
          <DashboardInProgress sessions={inProgressSessions} />

          <DashboardReminders summary={summary} />

          {recentSessions.length > 0 && (
            <DashboardRecentSessions
              sessions={recentSessions}
              onDeleted={handleSessionDeleted}
              onToggleRead={handleToggleRead}
            />
          )}

          {error && (
            <p className="text-sm text-status-error" aria-live="polite">{error}</p>
          )}
        </>
      )}
    </div>
  )
}

function readPendingShare(): Promise<File | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open('conversation-coach-db', 1)
    req.onupgradeneeded = (e) => {
      (e.target as IDBOpenDBRequest).result.createObjectStore('pending-share')
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('pending-share', 'readwrite')
      const store = tx.objectStore('pending-share')
      tx.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
      const getReq = store.get('file')
      getReq.onsuccess = () => {
        const file = (getReq as IDBRequest<File | undefined>).result ?? null
        if (file) store.delete('file')
        tx.oncomplete = () => resolve(file)
      }
      getReq.onerror = () => resolve(null)
    }
    req.onerror = () => resolve(null)
  })
}

async function getAudioDuration(file: File): Promise<number> {
  return new Promise(resolve => {
    const audio = new Audio()
    audio.src = URL.createObjectURL(file)
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(audio.src)
      resolve(Math.round(audio.duration))
    }
    audio.onerror = () => resolve(0)
  })
}
