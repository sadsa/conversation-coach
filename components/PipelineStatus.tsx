// components/PipelineStatus.tsx
//
// Status page for an in-flight upload → transcribe → identify → analyse
// pipeline. The brief is "patient, encouraging, spacious": the user just
// uploaded a real Spanish conversation and is anxious to see corrections,
// so the page does emotional work as well as functional reporting.
//
// Visual model: one consolidated "we're working on it" screen — a single
// processing graphic at the centre of the page, a stage-aware status line,
// and a quiet reassurance / estimated-time line below. This is the same
// visual the practice-conversation analysing screen uses, so users see
// one consistent shape for "patient processing" wherever long-running
// work is happening.
//
// What we no longer show: the stage-by-stage stepper rail, per-stage
// rotating hints, and the per-stage elapsed timer. The user said the
// per-stage detail was creating more anxiety than insight ("am I stuck?")
// and the unified screen reads as steady progress rather than as a
// progress bar that pauses on each step.
//
// What we still keep: the error state (still per-stage, since the recovery
// action differs), the inline push-notification opt-in, and the long-wait
// retry on `analysing` (60s+ on this stage was a real recovery hatch).
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { Button } from '@/components/Button'
import { ProcessingGraphic } from '@/components/ProcessingGraphic'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import type { SessionStatus, ErrorStage } from '@/lib/types'

interface Props {
  sessionId: string
  initialStatus: SessionStatus
  initialErrorStage: ErrorStage | null
  durationSeconds: number | null
  /** ISO timestamp from `sessions.created_at`, used for the meta line. */
  createdAt?: string | null
}

export function PipelineStatus({
  sessionId,
  initialStatus,
  initialErrorStage,
  durationSeconds,
  createdAt,
}: Props) {
  const router = useRouter()
  const { t, uiLanguage } = useTranslation()
  const push = usePushNotifications()

  const ERROR_HEADLINES: Record<string, string> = {
    uploading: t('pipeline.errorUploading'),
    transcribing: t('pipeline.errorTranscribing'),
    analysing: t('pipeline.errorAnalysing'),
  }
  const ERROR_DETAILS: Record<string, string> = {
    uploading: t('pipeline.errorUploadingDetail'),
    transcribing: t('pipeline.errorTranscribingDetail'),
    analysing: t('pipeline.errorAnalysingDetail'),
  }

  const [currentStatus, setCurrentStatus] = useState(initialStatus)
  const [currentErrorStage, setCurrentErrorStage] = useState(initialErrorStage)
  const [showAnalysisRetry, setShowAnalysisRetry] = useState(false)
  const [retryingAnalysis, setRetryingAnalysis] = useState(false)
  const [notifyDismissed, setNotifyDismissed] = useState(false)
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
      router.push(`/sessions/${sessionId}/status`)
    }
  }

  // ── Error state ─────────────────────────────────────────────────────────
  if (currentStatus === 'error') {
    const stageKey = currentErrorStage ?? ''
    const headline = ERROR_HEADLINES[stageKey] ?? t('pipeline.errorGeneric')
    const detail = ERROR_DETAILS[stageKey] ?? t('pipeline.errorGenericDetail')
    return (
      <div className="space-y-6">
        <Meta createdAt={createdAt} durationSeconds={durationSeconds} t={t} uiLanguage={uiLanguage} />
        <div
          role="alert"
          className="rounded-2xl bg-error-container px-5 py-5 sm:px-6 sm:py-6 space-y-3"
        >
          <p className="text-on-error-surface font-medium">{headline}</p>
          <p className="text-text-secondary leading-relaxed">{detail}</p>
          <div className="pt-2">
            {currentErrorStage === 'uploading' ? (
              // No in-app picker — user must share the audio from WhatsApp again.
              <Button size="md" variant="secondary" onClick={() => router.push('/')}>
                {t('pipeline.errorUploadingRetryAction')}
              </Button>
            ) : (
              <Button size="md" onClick={handleRetry}>
                {t('pipeline.retry')}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── In-flight state ─────────────────────────────────────────────────────
  // One consolidated screen for every non-error stage. The graphic is the
  // hero element; the headline below is stage-aware so the user knows what
  // we're actually doing without us re-introducing the rail.
  const showNotifyPrompt =
    push.status === 'default' && !notifyDismissed && !push.subscribed
  const reassuranceCopy =
    push.status === 'granted' || push.subscribed
      ? t('pipeline.leaveBreakNotify')
      : t('pipeline.leaveBreak')
  const headline = stageHeadline(currentStatus, t)

  return (
    <div className="space-y-8">
      <Meta createdAt={createdAt} durationSeconds={durationSeconds} t={t} uiLanguage={uiLanguage} />

      {/* The hero. Centered, generously spaced. role=status so screen
          readers track stage transitions; aria-live polite avoids
          interrupting any in-progress speech. The graphic itself is
          aria-hidden via role=img + decorative label. */}
      <section
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-6 py-10 sm:py-14 text-center"
      >
        <ProcessingGraphic label={headline} />
        <div className="space-y-1.5">
          <p className="text-base sm:text-lg font-medium text-text-primary">
            {headline}
          </p>
          <p className="text-sm text-text-tertiary">
            {estimatedMinutes !== null
              ? t('pipeline.estimatedTime', { n: estimatedMinutes })
              : t('pipeline.statusFallbackHint')}
          </p>
        </div>
      </section>

      {/* Reassurance — patient/encouraging brand voice. Sits as a quiet
          paragraph below the hero so the user knows they don't have to
          stay glued to this screen. */}
      <p className="text-text-secondary text-center max-w-md mx-auto leading-relaxed">
        {reassuranceCopy}
      </p>

      {/* Inline notification opt-in. Only appears when permission is `default`,
          contextual to the wait so it lands as helpful rather than nagging. */}
      {showNotifyPrompt && (
        <div className="rounded-2xl bg-surface-elevated px-5 py-4 sm:px-6 sm:py-5 motion-safe:animate-[stage-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]">
          <p className="font-medium text-text-primary">{t('pipeline.notifyPromptTitle')}</p>
          <p className="mt-1 text-text-secondary">{t('pipeline.notifyPromptBody')}</p>
          <div className="mt-4 flex items-center gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const ok = await push.requestAndSubscribe()
                if (!ok) setNotifyDismissed(true)
              }}
            >
              {t('pipeline.notifyPromptAccept')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setNotifyDismissed(true)}
            >
              {t('pipeline.notifyPromptDismiss')}
            </Button>
          </div>
        </div>
      )}

      {/* Long-wait fallback. Appears after 60s on `analysing`. Demoted to a
          secondary button so it doesn't read as "your only option". */}
      {(showAnalysisRetry || retryingAnalysis) && (
        <div className="rounded-2xl border border-border-subtle px-5 py-4 sm:px-6 sm:py-5 space-y-3 motion-safe:animate-[stage-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]">
          <p className="text-text-secondary">{t('pipeline.takingLong')}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRetryAnalysis}
            disabled={retryingAnalysis}
          >
            {retryingAnalysis ? t('pipeline.retrying') : t('pipeline.retryAnalysis')}
          </Button>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Stage-aware headline. `identifying` is excluded because that stage redirects
// straight to the speaker-identify route; `ready` is excluded for the same
// reason (redirect to the session view fires immediately). If we somehow
// linger on either, fall back to the analysing copy — feels right given
// either is downstream of transcription.
// ────────────────────────────────────────────────────────────────────────────
function stageHeadline(
  status: SessionStatus,
  t: (key: string, replacements?: Record<string, string | number>) => string,
): string {
  switch (status) {
    case 'uploading':    return t('pipeline.statusUploading')
    case 'transcribing': return t('pipeline.statusTranscribing')
    case 'analysing':    return t('pipeline.statusAnalysing')
    default:             return t('pipeline.statusAnalysing')
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Meta line. Dot-separated facts that orient the user without filling the
// page (recorded date, audio length). Both parts degrade gracefully if the
// underlying data isn't available.
// ────────────────────────────────────────────────────────────────────────────
function Meta({
  createdAt,
  durationSeconds,
  t,
  uiLanguage,
}: {
  createdAt: string | null | undefined
  durationSeconds: number | null
  t: (key: string, replacements?: Record<string, string | number>) => string
  uiLanguage: 'en' | 'es'
}) {
  const parts: string[] = []
  if (createdAt) {
    const formatted = formatRecordedDate(createdAt, uiLanguage)
    if (formatted) parts.push(t('pipeline.recordedOn', { date: formatted }))
  }
  if (durationSeconds && durationSeconds > 0) {
    if (durationSeconds >= 60) {
      parts.push(t('pipeline.audioLength', { n: Math.round(durationSeconds / 60) }))
    } else {
      parts.push(t('pipeline.audioLengthShort', { n: Math.round(durationSeconds) }))
    }
  }
  if (parts.length === 0) return null
  return (
    <p className="text-text-tertiary text-sm">{parts.join(' · ')}</p>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function formatRecordedDate(iso: string, uiLanguage: 'en' | 'es'): string | null {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null
    const locale = uiLanguage === 'es' ? 'es-AR' : 'en-NZ'
    const now = new Date()
    const sameYear = date.getFullYear() === now.getFullYear()
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric',
      year: sameYear ? undefined : 'numeric',
    }).format(date)
  } catch {
    return null
  }
}
