// components/PipelineStatus.tsx
'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { SessionStatus, ErrorStage } from '@/lib/types'

const STAGE_LABELS: Record<SessionStatus, string> = {
  uploading: 'Uploading',
  transcribing: 'Transcribing',
  identifying: 'Identifying speakers',
  analysing: 'Analysing your speech',
  ready: 'Ready',
  error: 'Error',
}

const ERROR_MESSAGES: Record<string, string> = {
  uploading: 'Upload failed.',
  transcribing: 'Transcription failed.',
  analysing: 'Analysis failed.',
}

const STAGES: SessionStatus[] = ['uploading', 'transcribing', 'identifying', 'analysing', 'ready']

interface Props {
  sessionId: string
  initialStatus: SessionStatus
  initialErrorStage: ErrorStage | null
  durationSeconds: number | null
}

export function PipelineStatus({ sessionId, initialStatus, initialErrorStage, durationSeconds }: Props) {
  const router = useRouter()
  const statusRef = useRef(initialStatus)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const estimatedMinutes = durationSeconds
    ? Math.ceil(durationSeconds / 60 * 1.5)
    : null

  useEffect(() => {
    function redirect(status: SessionStatus) {
      if (status === 'identifying') router.push(`/sessions/${sessionId}/identify`)
      if (status === 'ready') router.push(`/sessions/${sessionId}`)
    }

    // Immediate check on mount
    fetch(`/api/sessions/${sessionId}/status`)
      .then(r => r.json())
      .then(data => {
        statusRef.current = data.status
        if (data.status === 'identifying' || data.status === 'ready') {
          redirect(data.status)
        }
      })

    intervalRef.current = setInterval(() => {
      fetch(`/api/sessions/${sessionId}/status`)
        .then(r => r.json())
        .then(data => {
          statusRef.current = data.status
          redirect(data.status)
        })
    }, 5000)

    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [sessionId, router])

  async function handleRetry() {
    const res = await fetch(`/api/sessions/${sessionId}/retry`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      if (data.upload_url) {
        // Upload failed — redirect home with message
        router.push('/?retry=upload')
      } else {
        router.push(`/sessions/${sessionId}/status`)
      }
    }
  }

  if (initialStatus === 'error') {
    const msg = ERROR_MESSAGES[initialErrorStage ?? ''] ?? 'Something went wrong.'
    return (
      <div className="space-y-4">
        <p className="text-red-400">{msg}</p>
        <button
          onClick={handleRetry}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium"
        >
          Retry
        </button>
      </div>
    )
  }

  const currentIndex = STAGES.indexOf(initialStatus)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        {STAGES.filter(s => s !== 'error').map((stage, i) => (
          <div key={stage} className={`flex items-center gap-3 ${i <= currentIndex ? 'text-white' : 'text-gray-600'}`}>
            <span className={`w-2 h-2 rounded-full ${i < currentIndex ? 'bg-green-400' : i === currentIndex ? 'bg-violet-400 animate-pulse' : 'bg-gray-700'}`} />
            <span className="text-sm">{STAGE_LABELS[stage]}</span>
          </div>
        ))}
      </div>
      {estimatedMinutes && (
        <p className="text-sm text-gray-400">Estimated time: ~{estimatedMinutes} min</p>
      )}
    </div>
  )
}
