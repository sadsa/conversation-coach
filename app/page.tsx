// app/page.tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DropZone } from '@/components/DropZone'
import { SessionList } from '@/components/SessionList'
import type { SessionListItem } from '@/lib/types'

export default function HomePage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(setSessions)
      .catch(console.error)
  }, [])

  async function handleRename(id: string, newTitle: string) {
    await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    })
    setSessions(prev => prev.map(s => s.id === id ? { ...s, title: newTitle } : s))
  }

  const handleFile = useCallback(async (file: File) => {
    setUploading(true)
    setError(null)
    const sessionTitle = title.trim() || file.name.replace(/\.[^.]+$/, '')
    const ext = file.name.split('.').pop() ?? 'mp3'

    // Get duration from audio metadata
    const duration_seconds = await getAudioDuration(file)

    // Create session + get presigned URL
    const createRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: sessionTitle, extension: ext }),
    })
    if (!createRes.ok) { setError('Failed to create session'); setUploading(false); return }
    const { session_id, upload_url } = await createRes.json() as { session_id: string; upload_url: string }

    // Upload to R2
    try {
      const uploadRes = await fetch(upload_url, { method: 'PUT', body: file })
      if (!uploadRes.ok) throw new Error('Upload failed')
    } catch {
      await fetch(`/api/sessions/${session_id}/upload-failed`, { method: 'POST' })
      setError('Upload failed — please try again')
      setUploading(false)
      return
    }

    // Notify server
    await fetch(`/api/sessions/${session_id}/upload-complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration_seconds }),
    })

    router.push(`/sessions/${session_id}/status`)
  }, [title, router])

  // Check for a file shared via the PWA share target
  useEffect(() => {
    if (typeof indexedDB === 'undefined') return
    readPendingShare().then(file => {
      if (file) handleFile(file)
    })
  }, [handleFile])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Conversation Coach</h1>
        <p className="text-gray-400 text-sm">Upload a recorded Spanish conversation to get feedback on your speech.</p>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          placeholder="Session title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm outline-none focus:border-violet-500"
        />
        <DropZone onFile={handleFile} />
        {uploading && <p className="text-sm text-violet-400">Uploading…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Past Sessions</h2>
        <SessionList sessions={sessions} onRename={handleRename} />
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
