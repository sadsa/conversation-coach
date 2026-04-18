// components/SessionList.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSwipeable } from 'react-swipeable'
import { Modal } from '@/components/Modal'
import { Toast } from '@/components/Toast'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionListItem } from '@/lib/types'

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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function SwipeableSessionItem({
  session,
  onDelete,
}: {
  session: SessionListItem
  onDelete: (id: string) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [translateX, setTranslateX] = useState(0)
  const [rowHeight, setRowHeight] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [confirmPending, setConfirmPending] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  async function triggerDelete() {
    if (isAnimating || !rowRef.current) return
    setIsAnimating(true)

    // Phase 1: slide item off-screen left (220ms), fire API call in parallel
    setTranslateX(-window.innerWidth)
    const deletePromise = onDelete(session.id)

    await new Promise(r => setTimeout(r, 220))
    if (!mountedRef.current) return

    // Phase 2: collapse row via grid-template-rows (no layout thrash)
    setRowHeight(0)

    const [, deleteResult] = await Promise.allSettled([
      new Promise(r => setTimeout(r, 220)),
      deletePromise,
    ])
    if (!mountedRef.current) return

    const succeeded = deleteResult.status === 'fulfilled' && deleteResult.value === true

    if (!succeeded) {
      setRowHeight(null)
      setTranslateX(0)
      setIsAnimating(false)
    }
    // On success: parent already called onDeleted inside onDelete
  }

  const handlers = useSwipeable({
    delta: 10,
    onSwiping: (e) => {
      if (e.dir === 'Left') setTranslateX(-e.absX)
      else setTranslateX(0)
    },
    onSwipedLeft: (e) => {
      if (e.absX > 80) {
        setTranslateX(0)
        setConfirmPending(true)
      } else {
        setTranslateX(0)
      }
    },
    onSwipedRight: () => setTranslateX(0),
    trackMouse: false,
  })

  const isProcessing = !TERMINAL_STATUSES.has(session.status)
  const processingSeconds =
    session.status === 'ready' && session.processing_completed_at
      ? Math.round(
          (new Date(session.processing_completed_at).getTime() - new Date(session.created_at).getTime()) / 1000
        )
      : null

  return (
    <li
      ref={rowRef}
      className="relative overflow-hidden grid"
      style={
        rowHeight !== null
          ? { gridTemplateRows: rowHeight === 0 ? '0fr' : '1fr', transition: 'grid-template-rows 0.22s cubic-bezier(0.25, 1, 0.5, 1)' }
          : { gridTemplateRows: '1fr' }
      }
    >
      <div className="overflow-hidden min-h-0 min-w-0">
      {/* Swipe-to-delete background */}
      <div className="absolute inset-0 bg-status-error flex items-center justify-end pr-5">
        <span className="text-white font-medium">{t('session.delete')}</span>
      </div>

      {/* Session card */}
      <div
        {...handlers}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating
            ? 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)'
            : translateX === 0
            ? 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)'
            : 'none',
          userSelect: 'none',
          touchAction: 'pan-y',
        }}
        className={`relative${isProcessing ? ' bg-accent-chip' : ' bg-surface'}`}
      >
        {/* Hidden test seam for triggering delete in tests */}
        <button
          data-testid={`delete-session-${session.id}`}
          className="sr-only"
          onClick={e => { e.stopPropagation(); setTranslateX(0); setConfirmPending(true) }}
          tabIndex={-1}
          aria-hidden="true"
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore — inert is a valid HTML attribute not yet in React's types
          inert=""
        />
        <Link
          href={session.status === 'ready' ? `/sessions/${session.id}` : `/sessions/${session.id}/status`}
          onClick={(e) => { if (isAnimating || translateX !== 0) e.preventDefault() }}
          className="flex items-center gap-4 py-4 px-5 min-w-0"
        >
          <div className="flex-1 min-w-0">
            <p className="text-lg font-medium truncate text-text-primary">{session.title}</p>
            <div className="flex items-center gap-2 text-sm text-text-secondary mt-1.5 flex-wrap">
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
              <span>·</span>
              <span>{new Date(session.created_at).toLocaleDateString()}</span>
              {session.duration_seconds != null && (
                <>
                  <span>·</span>
                  <span>{formatDuration(session.duration_seconds)}</span>
                </>
              )}
              {processingSeconds != null && (
                <>
                  <span>·</span>
                  <span className="text-status-processing">⚡ {formatDuration(processingSeconds)}</span>
                </>
              )}
            </div>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="w-4 h-4 text-text-tertiary flex-shrink-0" aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>

      {/* Confirmation modal */}
      <Modal isOpen={confirmPending} title={t('session.deleteTitle')} onClose={() => setConfirmPending(false)}>
        <div className="space-y-5">
          <p className="text-text-secondary leading-relaxed">
            <strong className="text-text-primary">{session.title}</strong>{' '}
            {t('session.deleteWarning')}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmPending(false)}
              className="flex-1 py-3 rounded-xl border border-border text-text-secondary font-medium hover:bg-surface-elevated transition-colors"
            >
              {t('session.cancelButton')}
            </button>
            <button
              onClick={() => { setConfirmPending(false); triggerDelete() }}
              className="flex-1 py-3 rounded-xl bg-status-error text-white font-semibold hover:opacity-90 transition-opacity"
            >
              {t('session.deleteButton')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
    </li>
  )
}

interface Props {
  sessions: SessionListItem[]
  onDeleted?: (id: string) => void
}

export function SessionList({ sessions, onDeleted }: Props) {
  const { t } = useTranslation()
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(timer)
  }, [toastMessage])

  async function deleteSession(id: string): Promise<boolean> {
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      setToastMessage(t('session.deleteError'))
      return false
    }
    onDeleted?.(id)
    return true
  }

  if (sessions.length === 0) {
    return <p className="text-text-tertiary py-4">{t('session.noSessions')}</p>
  }

  return (
    <div>
      <ul className="divide-y divide-border-subtle">
        {sessions.map(s => (
          <SwipeableSessionItem
            key={s.id}
            session={s}
            onDelete={deleteSession}
          />
        ))}
      </ul>

      {toastMessage && <Toast message={toastMessage} />}
    </div>
  )
}
