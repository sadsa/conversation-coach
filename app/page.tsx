'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { HomeUploadFab } from '@/components/HomeUploadFab'
import { DashboardOnboarding } from '@/components/DashboardOnboarding'
import { DashboardReminders } from '@/components/DashboardReminders'
import { DashboardInProgress } from '@/components/DashboardInProgress'
import { DashboardRecentSessions } from '@/components/DashboardRecentSessions'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem, SessionStatus } from '@/lib/types'
import type { DashboardSummary } from '@/lib/dashboard-summary'

const TERMINAL_STATUSES = new Set<SessionStatus>(['ready', 'error'])
const POLL_INTERVAL_MS = 3000

function pickGreetingKey(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'home.greetingMorning'
  if (hour < 18) return 'home.greetingAfternoon'
  return 'home.greetingEvening'
}

export default function HomePage() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  const greetingKey = useMemo(() => pickGreetingKey(new Date()), [])

  function startPolling(sessionId: string) {
    if (pollingRefs.current.has(sessionId)) return
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/status`)
        if (!res.ok) return
        const { status } = await res.json() as { status: SessionStatus }

        if (TERMINAL_STATUSES.has(status)) {
          clearInterval(pollingRefs.current.get(sessionId))
          pollingRefs.current.delete(sessionId)
          const listRes = await fetch('/api/sessions')
          if (listRes.ok) setSessions(await listRes.json())
          fetch('/api/dashboard-summary')
            .then(r => r.ok ? r.json() : null)
            .then((data: DashboardSummary | null) => { if (data) setSummary(data) })
            .catch(() => { /* non-critical */ })
        } else {
          setSessions(prev =>
            prev.map(s => s.id === sessionId ? { ...s, status } : s)
          )
        }
      } catch {
        // Network blip — keep polling
      }
    }, POLL_INTERVAL_MS)
    pollingRefs.current.set(sessionId, intervalId)
  }

  useEffect(() => {
    const polling = pollingRefs.current

    fetch('/api/sessions')
      .then(r => r.json())
      .then((data: SessionListItem[]) => {
        setSessions(data)
        setSessionsLoaded(true)
        data.forEach(s => {
          if (!TERMINAL_STATUSES.has(s.status)) startPolling(s.id)
        })
      })
      .catch(() => setSessionsLoaded(true))

    fetch('/api/dashboard-summary')
      .then(r => r.ok ? r.json() : null)
      .then((data: DashboardSummary | null) => {
        if (data && typeof data.writeDownCount === 'number') {
          setSummary({ writeDownCount: data.writeDownCount })
        }
      })
      .catch(() => { /* silently ignore */ })

    return () => {
      polling.forEach(id => clearInterval(id))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, [t])

  const handleFile = useCallback((file: File) => {
    void doUpload(file)
  }, [doUpload])

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return
    readPendingShare().then(file => {
      if (file) handleFile(file)
    })
  }, [handleFile])

  function handleSessionDeleted(id: string) {
    const interval = pollingRefs.current.get(id)
    if (interval) {
      clearInterval(interval)
      pollingRefs.current.delete(id)
    }
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

  const isFirstTime = sessionsLoaded && sessions.length === 0
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
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2 flex-1">
            <h1 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight">
              {t(greetingKey)}
            </h1>
            <p className="text-text-secondary leading-relaxed">
              {t('home.dashboardSubtitle')}
            </p>
          </div>
          <HomeUploadFab
            onFile={handleFile}
            onPickInvalid={msg => setError(msg)}
            disabled={uploading}
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

          {sessionsLoaded && recentSessions.length > 0 && (
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
