'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { DropZone } from '@/components/DropZone'
import { PendingUploadCard, type SpeakerMode } from '@/components/PendingUploadCard'
import { DashboardOnboarding } from '@/components/DashboardOnboarding'
import { DashboardReminders } from '@/components/DashboardReminders'
import { DashboardUploadStarter } from '@/components/DashboardUploadStarter'
import { DashboardInProgress } from '@/components/DashboardInProgress'
import { DashboardRecentSessions } from '@/components/DashboardRecentSessions'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem, SessionStatus } from '@/lib/types'
import type { DashboardSummary } from '@/lib/dashboard-summary'
import { Button } from '@/components/Button'

const SPEAKER_MODE_KEY = 'speakerMode'
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
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [speakerMode, setSpeakerMode] = useState<SpeakerMode>('solo')
  const [speakersExpected, setSpeakersExpected] = useState(2)
  const [uploading, setUploading] = useState(false)
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())
  const uploadAbortRef = useRef<AbortController | null>(null)
  const uploadCancelRequestedRef = useRef(false)
  const deletedUploadSessionIdRef = useRef<string | null>(null)

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
          // Re-fetch full list to pick up the updated title / processing time
          // and the dashboard summary so the reminders pill catches any new
          // practice items the pipeline saved at the end of analysis.
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

  // Load sessions on mount and start polling for any in-progress ones.
  useEffect(() => {
    // Capture the polling map *now* so cleanup runs against the same Map
    // instance the effect populated, rather than whatever pollingRefs.current
    // points to when the component unmounts. (The ref itself is stable, but
    // React's lint catches the general pattern.)
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

    // Dashboard summary — non-critical, silently skipped on failure so the
    // page still loads even if the summary endpoint is down.
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

  // Restore last-used speaker mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SPEAKER_MODE_KEY)
    if (saved === 'solo' || saved === 'conversation') setSpeakerMode(saved)
  }, [])

  const handleModeChange = useCallback((mode: SpeakerMode) => {
    setSpeakerMode(mode)
    localStorage.setItem(SPEAKER_MODE_KEY, mode)
    if (mode === 'solo') setSpeakersExpected(2)
  }, [])

  const deleteUploadSessionOnce = useCallback(async (sessionId: string) => {
    if (deletedUploadSessionIdRef.current === sessionId) return
    deletedUploadSessionIdRef.current = sessionId
    await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
  }, [])

  const doUpload = useCallback(async (file: File, mode: SpeakerMode, speakers: number) => {
    setUploading(true)
    setUploadSessionId(null)
    setError(null)
    uploadCancelRequestedRef.current = false
    deletedUploadSessionIdRef.current = null
    const ext = file.name.split('.').pop() ?? 'mp3'
    const duration_seconds = await getAudioDuration(file)
    if (uploadCancelRequestedRef.current) {
      setUploading(false)
      setPendingFile(null)
      setError(t('home.uploadCancelled'))
      return
    }

    const createRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', extension: ext, original_filename: file.name }),
    })
    if (!createRes.ok) { setError('Failed to create session'); setUploading(false); return }
    const { session_id, upload_url } = await createRes.json() as { session_id: string; upload_url: string }
    setUploadSessionId(session_id)
    if (uploadCancelRequestedRef.current) {
      await deleteUploadSessionOnce(session_id)
      setUploadSessionId(null)
      setUploading(false)
      setPendingFile(null)
      setError(t('home.uploadCancelled'))
      return
    }
    const abortController = new AbortController()
    uploadAbortRef.current = abortController
    if (uploadCancelRequestedRef.current) {
      abortController.abort()
    }
    if (uploadCancelRequestedRef.current) {
      await deleteUploadSessionOnce(session_id)
      if (uploadAbortRef.current === abortController) uploadAbortRef.current = null
      setUploadSessionId(null)
      setUploading(false)
      setPendingFile(null)
      setError(t('home.uploadCancelled'))
      return
    }

    try {
      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        signal: abortController.signal,
      })
      if (!uploadRes.ok) throw new Error('Upload failed')
    } catch {
      const wasCancelled = abortController.signal.aborted || uploadCancelRequestedRef.current
      if (wasCancelled) {
        await deleteUploadSessionOnce(session_id)
      } else {
        await fetch(`/api/sessions/${session_id}/upload-failed`, { method: 'POST' })
      }
      if (uploadAbortRef.current === abortController) uploadAbortRef.current = null
      setUploadSessionId(null)
      setPendingFile(null)
      setError(t('home.uploadFailed'))
      if (wasCancelled) setError(t('home.uploadCancelled'))
      setUploading(false)
      return
    }
    if (uploadAbortRef.current === abortController) uploadAbortRef.current = null
    if (uploadCancelRequestedRef.current) {
      await deleteUploadSessionOnce(session_id)
      setUploadSessionId(null)
      setUploading(false)
      setPendingFile(null)
      setError(t('home.uploadCancelled'))
      return
    }
    setUploadSessionId(null)

    await fetch(`/api/sessions/${session_id}/upload-complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        duration_seconds,
        speakers_expected: mode === 'solo' ? 1 : speakers,
      }),
    })

    const newSession: SessionListItem = {
      id: session_id,
      title: file.name,
      status: 'transcribing',
      duration_seconds,
      created_at: new Date().toISOString(),
      processing_completed_at: null,
    }
    setSessions(prev => [newSession, ...prev])
    startPolling(session_id)
    setUploading(false)
  }, [deleteUploadSessionOnce, t])

  const handleCancelUpload = useCallback(() => {
    uploadCancelRequestedRef.current = true
    const controller = uploadAbortRef.current
    controller?.abort()
    const sessionIdToDelete = uploadSessionId
    if (sessionIdToDelete) {
      void deleteUploadSessionOnce(sessionIdToDelete)
    }
    uploadAbortRef.current = null
    setUploadSessionId(null)
    setUploading(false)
    setPendingFile(null)
    setError(t('home.uploadCancelled'))
  }, [deleteUploadSessionOnce, uploadSessionId, t])

  const handleFile = useCallback((file: File) => {
    if (file.name.toLowerCase().endsWith('.opus')) {
      doUpload(file, 'solo', 2)
    } else {
      setPendingFile(file)
    }
  }, [doUpload])

  const handleConfirmUpload = useCallback(async () => {
    if (!pendingFile) return
    setPendingFile(null)
    await doUpload(pendingFile, speakerMode, speakersExpected)
  }, [pendingFile, speakerMode, speakersExpected, doUpload])

  // Check for a file shared via the PWA share target (preserved behaviour).
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

  const isFirstTime = sessionsLoaded && sessions.length === 0
  const readyCount = sessions.filter(s => s.status === 'ready').length
  // Split sessions by lifecycle so each surface owns one place to show them:
  //   - In-progress callout at the top → still moving through the pipeline.
  //   - Recent conversations below     → terminal (ready or error).
  // A freshly uploaded session lives in the callout while it processes, then
  // pops into the recent list when it's ready (the polling loop re-fetches
  // the full list on terminal status, so this happens automatically).
  const inProgressSessions = useMemo(
    () => sessions.filter(s => !TERMINAL_STATUSES.has(s.status)),
    [sessions],
  )
  const recentSessions = useMemo(
    () => sessions.filter(s => TERMINAL_STATUSES.has(s.status)),
    [sessions],
  )

  // Pending upload card preempts the dropzone slot whether we're in the
  // first-time or returning-user view.
  const uploadSurface = pendingFile ? (
    <PendingUploadCard
      file={pendingFile}
      speakerMode={speakerMode}
      speakersExpected={speakersExpected}
      onModeChange={handleModeChange}
      onSpeakersChange={setSpeakersExpected}
      onConfirm={handleConfirmUpload}
      onDismiss={() => setPendingFile(null)}
    />
  ) : (
    <DropZone onFile={handleFile} />
  )

  return (
    <div className="max-w-2xl mx-auto space-y-12">
      {/*
        Greeting block — modest, single line of warm copy + a softer
        secondary line. We avoid a hero metric / streak / "level" widget
        here; per `.impeccable.md` the tone is patient, not gamified.
      */}
      <header className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-semibold text-text-primary tracking-tight">
          {t(greetingKey)}
        </h1>
        <p className="text-text-secondary leading-relaxed">
          {readyCount > 0
            ? (readyCount === 1
                ? t('home.sessionCountOne')
                : t('home.sessionCountMany', { n: readyCount }))
            : t('home.dashboardSubtitle')}
        </p>
      </header>

      {isFirstTime ? (
        // First-time experience: onboarding steps + prominent upload.
        // The empty state IS the onboarding so it self-resets after the
        // first successful upload — no localStorage flag to drift.
        <>
          <DashboardOnboarding />
          <section aria-labelledby="first-upload-heading" className="space-y-3">
            <h2
              id="first-upload-heading"
              className="text-sm font-medium text-text-secondary uppercase tracking-wider"
            >
              {t('home.newSessionTitle')}
            </h2>
            {uploadSurface}
            {uploading && (
              <div className="mt-3 flex items-center gap-3">
                <p className="text-status-processing text-sm">{t('home.uploading')}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelUpload}
                >
                  {t('home.uploadCancel')}
                </Button>
              </div>
            )}
            {error && <p className="text-status-error text-sm">{error}</p>}
          </section>
        </>
      ) : (
        // Returning view: review surfaces first, upload demoted to the
        // bottom. The reminders pill renders even while data is loading
        // (with the legacy "—" placeholder) so existing test contracts
        // and screen-readers keep their anchor.
        <>
          {/*
            In-progress callout sits ABOVE reminders so the user immediately
            sees what's brewing in the background — but only when there's
            something to show. Self-renders to nothing when the array is
            empty, so we don't need a guard here. In-progress sessions are
            shown ONLY here (not also in the recent list below) so the user
            doesn't see the same row twice.
          */}
          <DashboardInProgress sessions={inProgressSessions} />

          <DashboardReminders summary={summary} />

          {sessionsLoaded && recentSessions.length > 0 && (
            <DashboardRecentSessions
              sessions={recentSessions}
              onDeleted={handleSessionDeleted}
            />
          )}

          <DashboardUploadStarter>
            {uploadSurface}
            {uploading && (
              <div className="mt-3 flex items-center gap-3">
                <p className="text-status-processing text-sm">{t('home.uploading')}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelUpload}
                >
                  {t('home.uploadCancel')}
                </Button>
              </div>
            )}
            {error && <p className="text-status-error text-sm mt-3">{error}</p>}
          </DashboardUploadStarter>
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
