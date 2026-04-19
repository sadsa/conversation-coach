// components/SessionList.tsx
//
// Inbox row with two opposing swipe gestures:
//   • Swipe LEFT  → confirm-then-delete (destructive, gated by modal)
//   • Swipe RIGHT → toggle read/unread (reversible, no confirm)
//
// Both gestures live on the same row using `react-swipeable`. The translateX
// during a drag has its sign sniff which side's background to reveal: negative
// = red delete background on the right; positive = neutral toggle background
// on the left. Past the 80px threshold the gesture commits on release; below
// it we snap back.
//
// Read state is signalled by *weight + tone only* — no dot, no border stripe
// (banned per impeccable rules). Read rows recede to `font-normal` +
// `text-text-secondary`; unread rows hold the assertive default
// `font-semibold` + `text-text-primary`. The Unread filter pill above does
// the heavy lifting when the user wants to scope the view.
//
// When the parent passes `removeOnRead` (i.e. we're inside the Unread filter),
// marking a row as read causes it to slide-out + collapse first, then the
// parent's filter re-runs and removes it from the array. This avoids the row
// blinking out of existence.

'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSwipeable } from 'react-swipeable'
import { Modal } from '@/components/Modal'
import { Toast } from '@/components/Toast'
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

// Threshold past which a release commits the swipe. Matches the delete
// threshold so users learn one rule for both gestures.
const SWIPE_COMMIT_PX = 80

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

// The date label sits next to the title and is the primary way the user
// distinguishes one row from another within a bucket. Because the parent
// (DashboardRecentSessions) groups rows under "Today / Yesterday / This week
// / Earlier" headers, the per-row label only needs to add what the header
// can't say:
//   • Today / Yesterday rows → time-of-day (HH:MM)
//   • This week rows         → weekday + time (e.g. "Tue 14:32")
//   • Earlier rows           → short date (e.g. "15 Mar")
function formatRowDate(date: Date, uiLanguage: UiLanguage, now: Date = new Date()): string {
  const locale = uiLanguage === 'es' ? 'es-AR' : 'en-GB'
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 6)

  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (date >= startOfYesterday) return time
  if (date >= startOfWeek) {
    const day = date.toLocaleDateString(locale, { weekday: 'short' })
    return `${day} ${time}`
  }
  // Older than a week: short date. Include the year only when it differs from
  // the current year — otherwise "15 Mar" alone would silently mean different
  // things in January vs December across a year boundary.
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(
    locale,
    sameYear
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' },
  )
}

function SwipeableSessionItem({
  session,
  onDelete,
  onToggleRead,
  removeOnRead,
}: {
  session: SessionListItem
  onDelete: (id: string) => Promise<boolean>
  onToggleRead: (id: string, makeRead: boolean) => Promise<boolean>
  removeOnRead: boolean
}) {
  const { t, uiLanguage } = useTranslation()
  // translateX is signed: negative = dragging left (delete reveal), positive
  // = dragging right (toggle reveal). Zero = at rest.
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

  // Toggling read/unread is non-destructive — no confirmation. When the row
  // would leave the current filter (Unread → marked read), we animate it out
  // using the same two-phase pattern as delete so it doesn't blink.
  async function triggerToggleRead() {
    if (isAnimating || !rowRef.current) return
    const willRemove = removeOnRead && isUnread // marking unread row as read inside Unread filter

    if (!willRemove) {
      // In-place toggle: fire and forget. The optimistic update happens at
      // the page level via onToggleRead so the row's bold/normal flips
      // immediately on next render.
      const ok = await onToggleRead(session.id, isUnread)
      if (!ok && mountedRef.current) {
        // Parent already rolled back its optimistic update; nothing to do
        // here — the toast surface lives at the SessionList level.
      }
      return
    }

    setIsAnimating(true)

    // Phase 1: slide off-screen RIGHT (positive direction), fire API
    setTranslateX(window.innerWidth)
    const togglePromise = onToggleRead(session.id, true)

    await new Promise(r => setTimeout(r, 220))
    if (!mountedRef.current) return

    setRowHeight(0)

    const [, result] = await Promise.allSettled([
      new Promise(r => setTimeout(r, 220)),
      togglePromise,
    ])
    if (!mountedRef.current) return

    const succeeded = result.status === 'fulfilled' && result.value === true
    if (!succeeded) {
      setRowHeight(null)
      setTranslateX(0)
      setIsAnimating(false)
    }
  }

  const handlers = useSwipeable({
    delta: 10,
    onSwiping: (e) => {
      // Only allow horizontal drag; vertical scrolls fall through naturally.
      if (e.dir === 'Left') {
        setTranslateX(-e.absX)
      } else if (e.dir === 'Right' && session.status === 'ready') {
        // Right-swipe gesture is only meaningful for ready sessions — there's
        // no read state to toggle on rows still in the pipeline.
        setTranslateX(e.absX)
      } else {
        setTranslateX(0)
      }
    },
    onSwipedLeft: (e) => {
      if (e.absX > SWIPE_COMMIT_PX) {
        setTranslateX(0)
        setConfirmPending(true)
      } else {
        setTranslateX(0)
      }
    },
    onSwipedRight: (e) => {
      if (session.status !== 'ready') {
        setTranslateX(0)
        return
      }
      if (e.absX > SWIPE_COMMIT_PX) {
        // Snap back to 0 first so the in-place toggle doesn't fight with
        // the drag offset; the slide-out animation (when removeOnRead is
        // true) will set its own translateX.
        setTranslateX(0)
        triggerToggleRead()
      } else {
        setTranslateX(0)
      }
    },
    trackMouse: false,
  })

  const isProcessing = !TERMINAL_STATUSES.has(session.status)
  const isError = session.status === 'error'
  const showStatus = isProcessing || isError
  const dateLabel = formatRowDate(new Date(session.created_at), uiLanguage)
  // Unread is meaningful only for ready conversations — in-progress rows
  // already carry a spinner + status, and errors get a red status. Showing
  // any unread treatment on those would just add noise.
  const isUnread = session.status === 'ready' && session.last_viewed_at == null

  // Right-swipe action label flips with current state — same gesture, opposite
  // verb. When the row isn't toggleable (still processing) we skip the label.
  const toggleLabel = !isUnread ? t('session.markUnread') : t('session.markRead')

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
      {/* Swipe reveals — only one is mounted at a time based on drag direction
          (or active commit animation). Both layers are `absolute inset-0`, so
          if we mounted them simultaneously the second one in the DOM would
          paint over the first and the user would see the wrong colour for
          half the gestures. Sign of `translateX` is the source of truth:
            • negative → row sliding left → reveal delete (red, pinned right)
            • positive → row sliding right → reveal toggle (chip, pinned left)
          We only render the toggle layer for ready sessions; for in-progress
          rows the right-swipe gesture is a no-op and there's nothing to show. */}
      {translateX < 0 && (
        <div className="absolute inset-0 bg-status-error flex items-center justify-end pr-5 pointer-events-none">
          <span className="text-white font-medium">{t('session.delete')}</span>
        </div>
      )}
      {translateX > 0 && session.status === 'ready' && (
        <div className="absolute inset-0 bg-accent-chip flex items-center justify-start pl-5 pointer-events-none">
          <span className="text-on-accent-chip font-medium">{toggleLabel}</span>
        </div>
      )}

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
        {/* Hidden test seam for triggering the read/unread toggle. The visible
            affordance is the swipe gesture; this gives unit tests a stable
            handle since simulating touch swipes in JSDOM is brittle. */}
        {session.status === 'ready' && (
          <button
            data-testid={`toggle-read-${session.id}`}
            className="sr-only"
            onClick={e => { e.stopPropagation(); triggerToggleRead() }}
            tabIndex={-1}
            aria-hidden="true"
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore — inert is a valid HTML attribute not yet in React's types
            inert=""
          />
        )}
        <Link
          href={session.status === 'ready' ? `/sessions/${session.id}` : `/sessions/${session.id}/status`}
          onClick={(e) => { if (isAnimating || translateX !== 0) e.preventDefault() }}
          className="block py-4 px-5 min-w-0 hover:bg-surface-elevated transition-colors"
        >
          {/*
            Title row. Read state lives on weight + tone alone — no dot, no
            border stripe (banned per impeccable rules). Read rows recede to
            `font-normal` + secondary tone; unread rows hold the assertive
            default. Two compatible signals, both achromatic. The Unread
            filter pill above already grades between them at the section level.
          */}
          <div className="flex items-center gap-2.5 min-w-0">
            <p
              className={`text-lg truncate ${
                isUnread
                  ? 'font-semibold text-text-primary'
                  : 'font-normal text-text-secondary'
              }`}
            >
              {session.title}
              {isUnread && (
                <span className="sr-only"> — {t('home.recentSessionUnreadAria')}</span>
              )}
            </p>
          </div>
          {/*
            Metadata row: no bullet separators. Whitespace + a softer (tertiary)
            tone for duration carries the visual hierarchy — date is the
            primary fact, duration is supporting. Status only appears when it
            adds information (processing or error); for "Ready" the bare row
            is enough. `tabular-nums` keeps digit columns aligned as the eye
            scans down the list.
          */}
          <div className="flex items-baseline gap-3 text-sm text-text-secondary mt-1.5 flex-wrap tabular-nums">
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
            <span>{dateLabel}</span>
            {session.duration_seconds != null && (
              <span className="text-text-tertiary">{formatDuration(session.duration_seconds)}</span>
            )}
          </div>
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
  /**
   * Optimistic toggle hook. Called by the row when a swipe-right commits.
   * The handler should flip the row's `last_viewed_at` (null ↔ timestamp)
   * locally before awaiting the network so the visual state changes
   * immediately, and roll back if the API call fails.
   */
  onToggleRead?: (id: string, makeRead: boolean) => void
  /**
   * Set when the parent is filtering by Unread. Tells the row to play a
   * slide-out + collapse animation when toggled to read, instead of
   * mutating in place — otherwise the row would just blink out of view as
   * the parent's filter re-runs.
   */
  removeOnRead?: boolean
}

export function SessionList({ sessions, onDeleted, onToggleRead, removeOnRead = false }: Props) {
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

  async function toggleReadSession(id: string, makeRead: boolean): Promise<boolean> {
    // Optimistic flip is owned by the parent (so the visual change is
    // immediate even when the row stays in place). We notify first, await
    // the network, and ask the parent to roll back on failure via a second
    // call with the inverse value.
    onToggleRead?.(id, makeRead)
    const res = await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read: makeRead }),
    })
    if (!res.ok) {
      onToggleRead?.(id, !makeRead)
      setToastMessage(t('session.toggleReadError'))
      return false
    }
    return true
  }

  if (sessions.length === 0) {
    return <p className="text-text-tertiary py-4">{t('session.noSessions')}</p>
  }

  return (
    <div>
      {/*
        Mobile bleed: the page's <main> wrapper sits at `px-6`, but on a
        phone the rows want to feel like an inbox — backgrounds, dividers,
        and swipe reveals running edge-to-edge so the gesture surface is
        the full width of the screen and the row's red/chip reveal isn't
        framed by an awkward 24px gutter. We negate the parent padding
        with `-mx-6` and snap back at `sm:` where the viewport is wide
        enough that an inset list reads as composed rather than cramped.
        Row interior padding (`px-5` on each row link) keeps the title
        text 20px from the screen edge — an intentional, readable inset
        per the spacious / readable-first principle in .impeccable.md.
      */}
      <ul className="-mx-6 sm:mx-0 divide-y divide-border-subtle">
        {sessions.map(s => (
          <SwipeableSessionItem
            key={s.id}
            session={s}
            onDelete={deleteSession}
            onToggleRead={toggleReadSession}
            removeOnRead={removeOnRead}
          />
        ))}
      </ul>

      {toastMessage && <Toast message={toastMessage} />}
    </div>
  )
}
