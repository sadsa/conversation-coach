// components/PipelineStatus.tsx
//
// Status page for an in-flight upload → transcribe → identify → analyse
// pipeline. The brief is "patient, encouraging, spacious": the user just
// uploaded a real Spanish conversation and is anxious to see corrections,
// so the page does emotional work as well as functional reporting.
//
// Visual model: a single vertical rail with stage markers, not five
// disconnected dots. The rail's filled portion grows as stages complete,
// communicating flow at a glance. The active stage is the loudest thing
// on the page (full-chroma processing colour, soft pulse, elapsed timer,
// rotating hint copy); completed stages step down in chroma so they don't
// compete; pending stages are quiet.
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { Modal } from '@/components/Modal'
import { Icon } from '@/components/Icon'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import type { SessionStatus, ErrorStage } from '@/lib/types'

const STAGES: SessionStatus[] = ['uploading', 'transcribing', 'identifying', 'analysing', 'ready']
const VISIBLE_STAGES = STAGES.filter(s => s !== 'error') as SessionStatus[]

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

  const STAGE_LABELS: Record<SessionStatus, string> = {
    uploading: t('pipeline.uploading'),
    transcribing: t('pipeline.transcribing'),
    identifying: t('pipeline.identifying'),
    analysing: t('pipeline.analysing'),
    ready: t('pipeline.ready'),
    error: t('status.error'),
  }

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

  // Per-stage rotating hints. Quiet, single-line, never lecture.
  const STAGE_HINTS: Record<SessionStatus, string[]> = useMemo(() => ({
    uploading: [t('pipeline.hint.uploading.0')],
    transcribing: [
      t('pipeline.hint.transcribing.0'),
      t('pipeline.hint.transcribing.1'),
    ],
    identifying: [],
    analysing: [
      t('pipeline.hint.analysing.0'),
      t('pipeline.hint.analysing.1'),
      t('pipeline.hint.analysing.2'),
      t('pipeline.hint.analysing.3'),
    ],
    ready: [],
    error: [],
  }), [t])

  const [currentStatus, setCurrentStatus] = useState(initialStatus)
  const [currentErrorStage, setCurrentErrorStage] = useState(initialErrorStage)
  const [showAnalysisRetry, setShowAnalysisRetry] = useState(false)
  const [retryingAnalysis, setRetryingAnalysis] = useState(false)
  const [notifyDismissed, setNotifyDismissed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [cancellingSession, setCancellingSession] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const statusRef = useRef(initialStatus)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analysisRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Per-stage elapsed timer. Resets whenever the active stage changes so the
  // user can see "how long has this current step been running" rather than a
  // single global timer that conflates slow uploads with slow analysis.
  const [stageStartedAt, setStageStartedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { setStageStartedAt(Date.now()) }, [currentStatus])
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  // Round-down so the displayed counter feels honest (never ahead of itself).
  const elapsedSeconds = Math.max(0, Math.floor((now - stageStartedAt) / 1000))

  // Hint rotation. Restart the cycle on stage change so the first hint is
  // always shown for the full window before rotating.
  const [hintIndex, setHintIndex] = useState(0)
  useEffect(() => {
    setHintIndex(0)
    const hints = STAGE_HINTS[currentStatus] ?? []
    if (hints.length <= 1) return
    const id = setInterval(() => {
      setHintIndex(i => (i + 1) % hints.length)
    }, 5500)
    return () => clearInterval(id)
  }, [currentStatus, STAGE_HINTS])

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

  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

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
        router.push('/?retry=upload')
      } else {
        router.push(`/sessions/${sessionId}/status`)
      }
    }
  }

  async function handleCancelSession() {
    setCancelError(null)
    setCancellingSession(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      if (!res.ok) {
        setCancelError(t('pipeline.cancelSessionError'))
        return
      }
      setConfirmCancelOpen(false)
      router.push('/')
    } catch {
      setCancelError(t('pipeline.cancelSessionError'))
    } finally {
      setCancellingSession(false)
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
            <Button size="md" onClick={handleRetry}>
              {t('pipeline.retry')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── In-flight state ─────────────────────────────────────────────────────
  const currentIndex = VISIBLE_STAGES.indexOf(currentStatus)
  // Last visible stage is `ready` which only renders for half a beat before
  // the redirect fires; treat it as "almost done" rather than fully complete.
  const showNotifyPrompt =
    push.status === 'default' && !notifyDismissed && !push.subscribed
  const reassuranceCopy =
    push.status === 'granted' || push.subscribed
      ? t('pipeline.leaveBreakNotify')
      : t('pipeline.leaveBreak')
  const activeHints = STAGE_HINTS[currentStatus] ?? []
  const activeHint = activeHints[hintIndex] ?? ''
  const canCancelSession = currentStatus === 'uploading' || currentStatus === 'transcribing'

  useEffect(() => {
    if (!canCancelSession) setMenuOpen(false)
  }, [canCancelSession])

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3">
        <Meta createdAt={createdAt} durationSeconds={durationSeconds} t={t} uiLanguage={uiLanguage} />
        {canCancelSession && (
          <div className="relative shrink-0" ref={menuRef}>
            <IconButton
              icon="more"
              size="lg"
              onClick={() => setMenuOpen(o => !o)}
              aria-label={t('pipeline.moreActions')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            />
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-30 min-w-[14rem] bg-surface-elevated border border-border rounded-lg shadow-lg overflow-hidden"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setCancelError(null)
                    setConfirmCancelOpen(true)
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-status-error hover:bg-bg transition-colors"
                >
                  <Icon name="trash" className="w-4 h-4" />
                  {t('pipeline.cancelSession')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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

      {/* Stepper. The rail (background line) and the filled portion (status-done)
          live as siblings of the <li> rows so they sit behind the dots without
          coupling each row to a border-left tell. */}
      <ol className="relative flex flex-col gap-6">
        <span
          aria-hidden
          className="absolute left-[7px] top-2 bottom-2 w-px bg-status-rail"
        />
        <span
          aria-hidden
          className="absolute left-[7px] top-2 w-px bg-status-done/80 transition-[height] duration-700 ease-out"
          style={{ height: railFillPercent(currentIndex, VISIBLE_STAGES.length) }}
        />

        {VISIBLE_STAGES.map((stage, i) => {
          const state =
            i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending'
          const label = STAGE_LABELS[stage]
          const ariaLabelKey =
            state === 'done'
              ? 'pipeline.stageDone'
              : state === 'active'
                ? 'pipeline.stageActive'
                : 'pipeline.stagePending'
          const showElapsed = state === 'active' && elapsedSeconds >= 8
          const showHint = state === 'active' && activeHint.length > 0

          return (
            <li
              key={stage}
              aria-label={t(ariaLabelKey, { label })}
              className="relative flex items-start gap-4 motion-safe:animate-[stage-in_450ms_cubic-bezier(0.16,1,0.3,1)_both]"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <Marker state={state} />
              <div className="flex min-w-0 flex-col gap-1 pt-px">
                <span
                  className={
                    state === 'pending'
                      ? 'text-text-tertiary'
                      : state === 'active'
                        ? 'text-text-primary font-medium'
                        : 'text-text-secondary'
                  }
                >
                  {label}
                </span>
                {(showHint || showElapsed) && (
                  <span className="text-text-tertiary text-sm tabular-nums motion-safe:animate-[fadein_300ms_ease-out_both]">
                    {showHint ? activeHint : null}
                    {showHint && showElapsed ? ' · ' : null}
                    {showElapsed ? formatElapsed(elapsedSeconds) : null}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Reassurance + estimated time. Stacked tightly so they read as one
          calm note rather than two separate UI bits. */}
      <div className="space-y-1 text-text-secondary">
        <p>{reassuranceCopy}</p>
        {estimatedMinutes !== null && (
          <p className="text-text-tertiary text-sm">
            {t('pipeline.estimatedTime', { n: estimatedMinutes })}
          </p>
        )}
      </div>

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

      <Modal
        isOpen={confirmCancelOpen}
        title={
          <div className="flex items-center gap-2 text-status-error">
            <Icon name="alert" className="w-5 h-5" />
            <span>{t('pipeline.cancelSessionTitle')}</span>
          </div>
        }
        onClose={() => { if (!cancellingSession) setConfirmCancelOpen(false) }}
      >
        <div className="space-y-5">
          <p className="text-text-secondary leading-relaxed">{t('pipeline.cancelSessionBody')}</p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmCancelOpen(false)}
              disabled={cancellingSession}
              className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg disabled:opacity-50 transition-colors"
            >
              {t('reanalyse.cancel')}
            </button>
            <button
              type="button"
              onClick={handleCancelSession}
              disabled={cancellingSession}
              className="px-4 py-2 rounded-lg bg-status-error text-white hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
            >
              {cancellingSession && <Icon name="spinner" className="w-4 h-4" />}
              {t('pipeline.cancelSessionConfirm')}
            </button>
          </div>
          {cancelError && (
            <p role="alert" className="text-status-error text-sm">{cancelError}</p>
          )}
        </div>
      </Modal>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Stage marker. Three visual states. Kept as a small component so the JSX in
// the stepper stays scannable.
// ────────────────────────────────────────────────────────────────────────────
function Marker({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <span
        aria-hidden
        className="relative z-10 mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-status-done text-bg"
      >
        <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none">
          <path
            d="M2 5.2 L4.2 7.4 L8 3.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span
        aria-hidden
        className="relative z-10 mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
      >
        {/* Soft outer pulse — opacity-only so it doesn't push layout. */}
        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-status-processing opacity-40" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-processing" />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className="relative z-10 mt-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
    >
      <span className="inline-flex h-2 w-2 rounded-full border border-status-rail bg-bg" />
    </span>
  )
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

/**
 * Returns the % of the rail that should be filled. Each completed stage
 * fills one segment between consecutive dots; the active stage doesn't fill
 * its own segment (the visual signal for "in progress" is the pulse, not
 * a half-filled bar).
 */
function railFillPercent(currentIndex: number, total: number): string {
  if (currentIndex <= 0) return '0%'
  if (currentIndex >= total) return '100%'
  // Convert from "completed dot count" to a percentage of the rail length.
  const segments = total - 1
  const completed = Math.min(currentIndex, segments)
  return `${(completed / segments) * 100}%`
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatRecordedDate(iso: string, uiLanguage: 'en' | 'es'): string | null {
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return null
    const locale = uiLanguage === 'es' ? 'es-AR' : 'en-NZ'
    // Today / yesterday-aware? Keep it simple for now: month + day, and only
    // include the year when it's not the current year.
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
