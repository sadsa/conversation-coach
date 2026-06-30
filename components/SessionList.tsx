'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Toast } from '@/components/Toast'
import { RowActionsMenu, type RowAction } from '@/components/RowActionsMenu'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem } from '@/lib/types'
import type { UiLanguage } from '@/lib/i18n'

function statusLabel(status: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    uploading: t('status.uploading'),
    transcribing: t('status.transcribing'),
    identifying: t('status.identifying'),
    analysing: t('status.analysing'),
    ready: t('status.ready'),
    error: t('status.error'),
  }
  return map[status] ?? status
}

const STATUS_COLOUR: Record<string, string> = {
  ready: 'text-status-ready',
  error: 'text-status-error',
}

const TERMINAL_STATUSES = new Set(['ready', 'error'])
const UNDO_TIMEOUT_MS = 5000

// Date + time for the metadata row. Now that the timestamp sits below the
// title (not crammed beside it), there's room to show both the day and the
// clock time. The day half stays relative ("Today"/"Yesterday"/weekday) for
// recent rows and falls back to an absolute date further out; the time half
// is always appended.
function formatRowDateTime(date: Date, uiLanguage: UiLanguage, now: Date = new Date()): string {
  const locale = uiLanguage === 'es' ? 'es-AR' : 'en-GB'
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 6)

  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

  let day: string
  if (date >= startOfToday) {
    day = uiLanguage === 'es' ? 'Hoy' : 'Today'
  } else if (date >= startOfYesterday) {
    day = uiLanguage === 'es' ? 'Ayer' : 'Yesterday'
  } else if (date >= startOfWeek) {
    day = date.toLocaleDateString(locale, { weekday: 'short' })
  } else {
    const sameYear = date.getFullYear() === now.getFullYear()
    day = date.toLocaleDateString(
      locale,
      sameYear
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' },
    )
  }

  return `${day}, ${time}`
}

function SessionItem({
  session,
  onDelete,
  onToggleRead,
  onMarkReviewed,
}: {
  session: SessionListItem
  onDelete: (id: string) => void
  onToggleRead: (id: string, makeRead: boolean) => void
  onMarkReviewed?: (id: string, reviewed: boolean) => void
}) {
  const { t, uiLanguage } = useTranslation()

  const isProcessing = !TERMINAL_STATUSES.has(session.status)
  const isError = session.status === 'error'
  const showStatus = isProcessing || isError
  const isUnread = session.last_viewed_at === null

  const [dateLabel, setDateLabel] = useState<string>(() =>
    formatRowDateTime(new Date(session.created_at), uiLanguage)
  )
  useEffect(() => {
    setDateLabel(formatRowDateTime(new Date(session.created_at), uiLanguage))
  }, [session.created_at, uiLanguage])

  const actions: RowAction[] = [
    ...(session.status === 'ready'
      ? [{
          label: isUnread ? t('session.markRead') : t('session.markUnread'),
          onSelect: () => onToggleRead(session.id, isUnread),
          testId: `toggle-read-${session.id}`,
        }]
      : []),
    ...(TERMINAL_STATUSES.has(session.status) && onMarkReviewed
      ? [{
          label: session.reviewed_at ? t('session.markUnreviewed') : t('session.markReviewed'),
          onSelect: () => onMarkReviewed(session.id, session.reviewed_at === null),
          testId: `toggle-reviewed-${session.id}`,
        }]
      : []),
    {
      label: t('session.delete'),
      onSelect: () => onDelete(session.id),
      destructive: true,
      testId: `delete-session-${session.id}`,
    },
  ]

  return (
    <li className="relative group">
      <Link
        href={session.status === 'ready' ? `/sessions/${session.id}` : `/sessions/${session.id}/status`}
        className={`block py-3 pl-1 pr-12 min-w-0 rounded-lg transition-colors ${
          isProcessing ? 'bg-accent-chip' : 'hover:bg-surface-elevated'
        }`}
      >
        <p className={`text-lg text-balance ${isUnread ? 'font-semibold text-text-primary' : 'font-normal text-text-secondary'}`}>
          {session.title}
        </p>
        <div className="flex items-baseline gap-3 text-sm text-text-secondary mt-1 flex-wrap tabular-nums">
          {showStatus && (
            <span className={`flex items-center gap-1 ${STATUS_COLOUR[session.status] ?? 'text-text-secondary'}`}>
              {isProcessing && (
                <svg
                  className="w-3 h-3 animate-spin text-status-processing"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {statusLabel(session.status, t)}
            </span>
          )}
          <span suppressHydrationWarning>{dateLabel}</span>
        </div>
      </Link>

      <RowActionsMenu
        actions={actions}
        triggerLabel={t('session.menuAria')}
        triggerTestId={`session-menu-${session.id}`}
      />
    </li>
  )
}

interface Props {
  sessions: SessionListItem[]
  onDeleted?: (id: string) => void
  onToggleRead?: (id: string, makeRead: boolean) => void
  onMarkReviewed?: (id: string, reviewed: boolean) => void
}

interface ToastState {
  message: string
  onUndo?: () => void
  key: number
}

export function SessionList({ sessions: initialSessions, onDeleted, onToggleRead, onMarkReviewed }: Props) {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState(initialSessions)
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSessions(initialSessions)
  }, [initialSessions])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  function deleteSession(id: string) {
    const snapshot = sessions.find(s => s.id === id)
    if (!snapshot) return

    setSessions(prev => prev.filter(s => s.id !== id))

    let cancelled = false
    let pendingDeleteTimer: ReturnType<typeof setTimeout> | null = null

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({
      key: Date.now(),
      message: t('session.movedToTrash'),
      onUndo: () => {
        cancelled = true
        if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer)
        setSessions(prev =>
          prev.find(s => s.id === id)
            ? prev
            : [...prev, snapshot].sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )
        )
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast(null)
      },
    })
    toastTimerRef.current = setTimeout(() => setToast(null), UNDO_TIMEOUT_MS)

    pendingDeleteTimer = setTimeout(async () => {
      if (cancelled) return
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        setSessions(prev =>
          prev.find(s => s.id === id)
            ? prev
            : [...prev, snapshot].sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )
        )
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast({ key: Date.now(), message: t('session.deleteError') })
        toastTimerRef.current = setTimeout(() => setToast(null), 3000)
        return
      }
      onDeleted?.(id)
    }, UNDO_TIMEOUT_MS)
  }

  function handleToggleRead(id: string, makeRead: boolean) {
    onToggleRead?.(id, makeRead)
    fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read: makeRead }),
    }).then(res => {
      if (!res.ok) {
        onToggleRead?.(id, !makeRead)
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast({ key: Date.now(), message: t('session.toggleReviewedError') })
        toastTimerRef.current = setTimeout(() => setToast(null), 3000)
      }
    })
  }

  function handleMarkReviewed(id: string, reviewed: boolean) {
    onMarkReviewed?.(id, reviewed)
    fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reviewed }),
    }).then(res => {
      if (!res.ok) {
        onMarkReviewed?.(id, !reviewed)
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast({ key: Date.now(), message: t('session.toggleReviewedError') })
        toastTimerRef.current = setTimeout(() => setToast(null), 3000)
      }
    })
  }

  const renderedToast = toast && (
    <Toast
      toastKey={toast.key}
      message={toast.message}
      action={toast.onUndo ? { label: t('session.undo'), onClick: toast.onUndo } : undefined}
    />
  )

  if (sessions.length === 0) {
    return (
      <>
        <p className="text-text-tertiary py-4">{t('session.noSessions')}</p>
        {renderedToast}
      </>
    )
  }

  return (
    <div>
      <ul className="divide-y divide-border-subtle border-y border-border-subtle">
        {sessions.map(s => (
          <SessionItem
            key={s.id}
            session={s}
            onDelete={deleteSession}
            onToggleRead={handleToggleRead}
            onMarkReviewed={onMarkReviewed ? handleMarkReviewed : undefined}
          />
        ))}
      </ul>
      {renderedToast}
    </div>
  )
}
