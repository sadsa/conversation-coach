'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { DropZone } from '@/components/DropZone'
import { PendingUploadCard, type SpeakerMode } from '@/components/PendingUploadCard'
import { SessionList } from '@/components/SessionList'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem, SessionStatus } from '@/lib/types'

interface DashboardSummary {
  writeDownCount: number
}

const SPEAKER_MODE_KEY = 'speakerMode'
const TERMINAL_STATUSES = new Set<SessionStatus>(['ready', 'error'])
const POLL_INTERVAL_MS = 3000

export default function HomePage() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [speakerMode, setSpeakerMode] = useState<SpeakerMode>('solo')
  const [speakersExpected, setSpeakersExpected] = useState(2)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const pollingRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

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
          // Re-fetch full list to get updated title, processing_completed_at, etc.
          const listRes = await fetch('/api/sessions')
          if (listRes.ok) setSessions(await listRes.json())
        } else {
          setSessions(prev =>
            prev.map(s => s.id === sessionId ? { ...s, status } : s)
          )
        }
      } catch {
        // Network error — keep polling
      }
    }, POLL_INTERVAL_MS)
    pollingRefs.current.set(sessionId, intervalId)
  }

  // Load sessions on mount and start polling for any in-progress ones
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then((data: SessionListItem[]) => {
        setSessions(data)
        data.forEach(s => {
          if (!TERMINAL_STATUSES.has(s.status)) startPolling(s.id)
        })
      })
      .catch(console.error)

    // Summary fetch (new)
    fetch('/api/dashboard-summary')
      .then(r => r.json())
      .then((data: DashboardSummary) => {
        if (typeof data.writeDownCount === 'number') setSummary(data)
      })
      .catch(() => { /* silently ignore — widget is non-critical */ })

    return () => {
      pollingRefs.current.forEach(id => clearInterval(id))
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

  const doUpload = useCallback(async (file: File, mode: SpeakerMode, speakers: number) => {
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
      body: JSON.stringify({
        duration_seconds,
        speakers_expected: mode === 'solo' ? 1 : speakers,
      }),
    })

    // Prepend the new session and start polling — no navigation
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
  }, [t])

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

  // Check for a file shared via the PWA share target
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

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold mb-3">{t('home.title')}</h1>
        <p className="text-text-secondary">{t('home.subtitle')}</p>
      </div>

      {/* Daily habit widget */}
      <div className="flex flex-col gap-3">
        <Link
          href="/practice?written_down=false"
          data-testid="widget-write-down"
          className="flex items-center px-4 py-2 rounded-full border border-widget-write-border bg-widget-write-bg text-widget-write-text hover:bg-widget-write-bg-hover transition-colors"
        >
          {summary !== null ? t('home.toWriteDown', { n: summary.writeDownCount }) : '—'}
        </Link>
      </div>

      <div className="space-y-4">
        {pendingFile ? (
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
        )}
        {uploading && <p className="text-status-processing">{t('home.uploading')}</p>}
        {error && <p className="text-status-error">{error}</p>}
      </div>

      <div>
        <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-4">{t('home.pastSessions')}</h2>
        <SessionList sessions={sessions} onDeleted={handleSessionDeleted} />
      </div>
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
