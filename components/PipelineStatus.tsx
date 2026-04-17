// components/PipelineStatus.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { Button } from '@/components/Button'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import type { SessionStatus, ErrorStage } from '@/lib/types'

const STAGES: SessionStatus[] = ['uploading', 'transcribing', 'identifying', 'analysing', 'ready']

interface Props {
  sessionId: string
  initialStatus: SessionStatus
  initialErrorStage: ErrorStage | null
  durationSeconds: number | null
}

export function PipelineStatus({ sessionId, initialStatus, initialErrorStage, durationSeconds }: Props) {
  const router = useRouter()
  const { t } = useTranslation()
  usePushNotifications()

  const STAGE_LABELS: Record<SessionStatus, string> = {
    uploading: t('pipeline.uploading'),
    transcribing: t('pipeline.transcribing'),
    identifying: t('pipeline.identifying'),
    analysing: t('pipeline.analysing'),
    ready: t('pipeline.ready'),
    error: t('status.error'),
  }

  const ERROR_MESSAGES: Record<string, string> = {
    uploading: t('pipeline.errorUploading'),
    transcribing: t('pipeline.errorTranscribing'),
    analysing: t('pipeline.errorAnalysing'),
  }

  const [currentStatus, setCurrentStatus] = useState(initialStatus)
  const [currentErrorStage, setCurrentErrorStage] = useState(initialErrorStage)
  const [showAnalysisRetry, setShowAnalysisRetry] = useState(false)
  const [retryingAnalysis, setRetryingAnalysis] = useState(false)
  const statusRef = useRef(initialStatus)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        setCurrentStatus(data.status)
        if (data.status === 'identifying' || data.status === 'ready') {
          redirect(data.status)
        }
      })
      .catch(console.error)

    intervalRef.current = setInterval(() => {
      fetch(`/api/sessions/${sessionId}/status`)
        .then(r => r.json())
        .then(data => {
          statusRef.current = data.status
          setCurrentStatus(data.status)
          setCurrentErrorStage(data.error_stage ?? null)
          redirect(data.status)
        })
        .catch(console.error)
    }, 5000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (analysisRetryTimerRef.current) clearTimeout(analysisRetryTimerRef.current)
    }
  }, [sessionId, router])

  useEffect(() => {
    if (currentStatus === 'analysing') {
      analysisRetryTimerRef.current = setTimeout(() => setShowAnalysisRetry(true), 60_000)
    } else {
      if (analysisRetryTimerRef.current) clearTimeout(analysisRetryTimerRef.current)
      setShowAnalysisRetry(false)
    }
    return () => { if (analysisRetryTimerRef.current) clearTimeout(analysisRetryTimerRef.current) }
  }, [currentStatus])

  async function handleRetryAnalysis() {
    setRetryingAnalysis(true)
    setShowAnalysisRetry(false)
    await fetch(`/api/sessions/${sessionId}/analyse`, { method: 'POST' })
    setRetryingAnalysis(false)
    setShowAnalysisRetry(false)
  }

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

  if (currentStatus === 'error') {
    const msg = ERROR_MESSAGES[currentErrorStage ?? ''] ?? t('pipeline.errorGeneric')
    return (
      <div className="space-y-5">
        <p className="text-status-error">{msg}</p>
        <Button size="md" onClick={handleRetry}>
          {t('pipeline.retry')}
        </Button>
      </div>
    )
  }

  const currentIndex = STAGES.indexOf(currentStatus)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4">
        {STAGES.filter(s => s !== 'error').map((stage, i) => (
          <div key={stage} className={`flex items-center gap-4 ${i <= currentIndex ? 'text-text-primary' : 'text-text-tertiary'}`}>
            <span className={`w-3 h-3 rounded-full ${i < currentIndex ? 'bg-status-ready' : i === currentIndex ? 'bg-status-processing animate-pulse' : 'bg-border'}`} />
            <span>{STAGE_LABELS[stage]}</span>
          </div>
        ))}
      </div>
      {estimatedMinutes && (
        <p className="text-text-secondary">{t('pipeline.estimatedTime', { n: estimatedMinutes })}</p>
      )}
      {(showAnalysisRetry || retryingAnalysis) && (
        <div className="space-y-3">
          <p className="text-text-secondary">{t('pipeline.takingLong')}</p>
          <Button size="md" onClick={handleRetryAnalysis} disabled={retryingAnalysis}>
            {retryingAnalysis ? t('pipeline.retrying') : t('pipeline.retryAnalysis')}
          </Button>
        </div>
      )}
    </div>
  )
}
