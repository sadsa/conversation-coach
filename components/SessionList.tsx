// components/SessionList.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSwipeable } from 'react-swipeable'
import { Modal } from '@/components/Modal'
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
  ready: 'text-green-400',
  error: 'text-red-400',
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

    // Phase 1: slide item fully off-screen left (200ms), fire API call in parallel
    setTranslateX(-window.innerWidth)
    const deletePromise = onDelete(session.id)

    await new Promise(r => setTimeout(r, 200))
    if (!mountedRef.current) return

    // Phase 2: measure height, then collapse row
    const h = rowRef.current?.offsetHeight ?? 0
    setRowHeight(h)
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    if (!mountedRef.current) return
    setRowHeight(0)

    const [, deleteResult] = await Promise.allSettled([
      new Promise(r => setTimeout(r, 200)),
      deletePromise,
    ])
    if (!mountedRef.current) return

    const succeeded = deleteResult.status === 'fulfilled' && deleteResult.value === true

    if (!succeeded) {
      // Restore on failure
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
      className="relative overflow-hidden"
      style={
        rowHeight !== null
          ? { height: rowHeight, transition: 'height 0.2s ease', overflow: 'hidden' }
          : undefined
      }
    >
      {/* Swipe-to-delete background */}
      <div className="absolute inset-0 bg-red-600 flex items-center justify-end pr-5">
        <span className="text-white text-sm font-medium">{t('session.delete')}</span>
      </div>

      {/* Session card */}
      <div
        {...handlers}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating
            ? 'transform 0.2s ease'
            : translateX === 0
            ? 'transform 0.2s'
            : 'none',
          userSelect: 'none',
          touchAction: 'pan-y',
        }}
        className={`relative bg-surface${isProcessing ? ' border-l-2 border-indigo-600' : ''}`}
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
          className={`flex items-center gap-3 py-3 min-w-0 ${isProcessing ? 'pl-3 pr-4' : 'px-4'}`}
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-text-primary">{session.title}</p>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary mt-0.5 flex-wrap">
              <span className={`flex items-center gap-1 ${STATUS_COLOUR[session.status] ?? 'text-text-secondary'}`}>
                {isProcessing && (
                  <svg
                    className="w-3 h-3 animate-spin text-indigo-400"
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
                  <span className="text-indigo-400">⚡ {formatDuration(processingSeconds)}</span>
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

      {/* Confirmation modal — owned by this item so triggerDelete is called directly */}
      {confirmPending && (
        <Modal title={t('session.deleteTitle')} onClose={() => setConfirmPending(false)}>
          <div className="space-y-4 text-sm">
            <p className="text-text-secondary leading-relaxed">
              <strong className="text-text-primary">{session.title}</strong>{' '}
              {t('session.deleteWarning')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmPending(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm font-medium"
              >
                {t('session.cancelButton')}
              </button>
              <button
                onClick={() => { setConfirmPending(false); triggerDelete() }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold"
              >
                {t('session.deleteButton')}
              </button>
            </div>
          </div>
        </Modal>
      )}
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
    return <p className="text-text-tertiary text-sm">{t('session.noSessions')}</p>
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

      {toastMessage && (
        <div
          role="alert"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  )
}
