// components/SessionList.tsx
//
// Inbox row with two opposing swipe gestures:
//   • Swipe LEFT  → optimistic delete with 5s Undo (Gmail/WriteList parity)
//   • Swipe RIGHT → toggle read/unread in place (reversible, no confirm)
//
// Both gestures live on the same row using `react-swipeable`. The translateX
// during a drag has its sign sniff which side's background to reveal: negative
// = red delete background on the right; positive = neutral toggle background
// on the left. Past the 80px threshold the gesture commits on release; below
// it we snap back.
//
// Delete used to open a confirmation Modal — the swipe was already a
// commit gesture, so the modal added a forced second decision and broke
// pattern parity with /write (which uses an optimistic-hide + 5s Undo
// toast). We now mirror /write: hide the row immediately, schedule the
// network DELETE for UNDO_TIMEOUT_MS later, surface a toast with Undo
// that cancels the pending request entirely if the user grabs it in time.
//
// Read state is signalled by *weight + tone only* — no dot, no border stripe
// (banned per impeccable rules). Read rows recede to `font-normal` +
// `text-text-secondary`; unread rows hold the assertive default
// `font-semibold` + `text-text-primary`. There's no Unread/All filter on top
// of the list — the weight/tone difference is enough at-a-glance signal, and
// removing the filter means a read-toggle never causes the row to leave the
// visible array mid-animation.

'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useSwipeable } from 'react-swipeable'
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

// How long the row stays optimistically hidden before the actual DELETE
// fires. Same window WriteList uses, so the two destructive surfaces feel
// like one pattern. Tap Undo inside this window and the request never
// hits the network.
const UNDO_TIMEOUT_MS = 5000

// Commit-animation choreography. The previous version slid the row off in
// 220ms, then snapped to collapsing the now-empty space in another 220ms
// — felt like two separate events ("row left → wait → list rearranged").
//
// New version reads as one continuous gesture by overlapping the two phases:
//
//   t=0     row starts sliding out + fading
//   t=160   collapse starts (neighbour begins rising while row is still leaving)
//   t=240   opacity has reached 0 — row is visually gone
//   t=360   slide is fully complete
//   t=520   collapse is fully complete, list at rest
//
// Total perceived motion: ~520ms. Sits in the upper layout-change band per
// the impeccable timing scale, which matches the "patient, spacious" brand
// (Gmail's swipe-archive runs at a similar tempo). The snap-back from a
// cancelled drag stays at 220ms — a cancel should feel immediate; only the
// commit wants to feel deliberate.
const SLIDE_DURATION_MS = 360
const FADE_DURATION_MS = 240
const COLLAPSE_OVERLAP_MS = 160
const COLLAPSE_DURATION_MS = 360
const CANCEL_DURATION_MS = 220
// ease-out-quart per impeccable motion rules — natural deceleration, no
// bounce/elastic.
const EASING = 'cubic-bezier(0.25, 1, 0.5, 1)'

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
}: {
  session: SessionListItem
  onDelete: (id: string) => Promise<boolean>
  onToggleRead: (id: string, makeRead: boolean) => Promise<boolean>
}) {
  const { t, uiLanguage } = useTranslation()
  // translateX is signed: negative = dragging left (delete reveal), positive
  // = dragging right (toggle reveal). Zero = at rest.
  const [translateX, setTranslateX] = useState(0)
  const [rowHeight, setRowHeight] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  // Optimistic, undoable delete. The row slides off + collapses immediately
  // (perceived as "done") and the parent surfaces an Undo toast for
  // UNDO_TIMEOUT_MS. The actual network DELETE is scheduled by the parent
  // and cancelled if Undo fires. We hand control to the parent through
  // `onDelete`, which returns true once the user has either confirmed (by
  // not undoing) or undone the action.
  async function triggerDelete() {
    if (isAnimating || !rowRef.current) return
    setIsAnimating(true)

    // Slide + fade start now; collapse starts mid-slide so the list rearranges
    // as part of one continuous motion (see SLIDE/COLLAPSE_OVERLAP comments).
    setTranslateX(-window.innerWidth)
    const deletePromise = onDelete(session.id)

    await new Promise(r => setTimeout(r, COLLAPSE_OVERLAP_MS))
    if (!mountedRef.current) return

    setRowHeight(0)

    // Wait for whichever finishes last — the late half of the slide or the
    // full collapse — before resolving so a failed delete (or an Undo)
    // can roll the row back from a stable resting state.
    const remainingMs = Math.max(
      SLIDE_DURATION_MS - COLLAPSE_OVERLAP_MS,
      COLLAPSE_DURATION_MS,
    )
    const [, deleteResult] = await Promise.allSettled([
      new Promise(r => setTimeout(r, remainingMs)),
      deletePromise,
    ])
    if (!mountedRef.current) return

    const succeeded = deleteResult.status === 'fulfilled' && deleteResult.value === true

    if (!succeeded) {
      // Undo or DELETE failure — restore the row to its pre-swipe state
      // so it reads as "still here, ready to act on again". The parent
      // is responsible for re-emitting the row through the `sessions`
      // prop on Undo so this restore stays purely visual.
      setRowHeight(null)
      setTranslateX(0)
      setIsAnimating(false)
    }
    // On success: parent already called onDeleted inside onDelete
  }

  // Toggling read/unread is non-destructive and stays in-place — the row's
  // bold/normal weight flip is the only visible change. Optimistic update
  // happens at the page level via onToggleRead; we just hand off the
  // request and let the toast surface (in SessionList) handle errors.
  async function triggerToggleRead() {
    if (isAnimating || !rowRef.current) return
    await onToggleRead(session.id, isUnread)
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
        // Direct commit — no Modal. The user already swiped to delete;
        // forcing a second confirm broke pattern parity with /write
        // and added friction for an action we can fully undo.
        triggerDelete()
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
        // the drag offset.
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
          ? {
              gridTemplateRows: rowHeight === 0 ? '0fr' : '1fr',
              transition: `grid-template-rows ${COLLAPSE_DURATION_MS}ms ${EASING}`,
            }
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
          // Opacity fades only on commit — disguises the moment the row
          // crosses the screen edge, so by the time the neighbour rises into
          // its slot the departing row has visually dissolved. No fade
          // during interactive drag (would mask the cancel affordance) and
          // no fade on snap-back (the card belongs back at full strength).
          opacity: isAnimating ? 0 : 1,
          transition: isAnimating
            ? `transform ${SLIDE_DURATION_MS}ms ${EASING}, opacity ${FADE_DURATION_MS}ms ${EASING}`
            : translateX === 0
            ? `transform ${CANCEL_DURATION_MS}ms ${EASING}`
            : 'none',
          userSelect: 'none',
          touchAction: 'pan-y',
        }}
        className={`relative${isProcessing ? ' bg-accent-chip' : ' bg-surface'}`}
      >
        {/* Hidden test seam for triggering delete in tests. Kicks off the
            same optimistic-undo flow the swipe gesture uses, since simulating
            touch swipes in JSDOM is brittle. */}
        <button
          data-testid={`delete-session-${session.id}`}
          className="sr-only"
          onClick={e => { e.stopPropagation(); triggerDelete() }}
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
}

interface ToastState {
  message: string
  onUndo?: () => void
  key: number
}

export function SessionList({ sessions, onDeleted, onToggleRead }: Props) {
  const { t } = useTranslation()
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Locally-hidden ids — rows that have been swiped to delete but whose
  // backing DELETE is still inside the Undo window. We hide them
  // visually here without removing them from the parent's `sessions`
  // array, so an Undo can simply drop the id from this set and the row
  // reappears in the right slot. Once the timer expires (or DELETE
  // succeeds) we notify the parent via `onDeleted` and the parent's
  // canonical array shrinks; at that point we can safely forget the id.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // If the parent's sessions array changes underneath us (e.g. a poll
  // refresh dropped a session that was already pending-delete here),
  // garbage-collect any hiddenIds that no longer correspond to a known
  // row so the set doesn't grow without bound.
  useEffect(() => {
    if (hiddenIds.size === 0) return
    const known = new Set(sessions.map(s => s.id))
    let changed = false
    const next = new Set<string>()
    hiddenIds.forEach(id => {
      if (known.has(id)) next.add(id)
      else changed = true
    })
    if (changed) setHiddenIds(next)
  }, [sessions, hiddenIds])

  /**
   * Optimistic, undoable session delete (mirror of WriteList's pattern):
   *
   *   1. Hide the row right away via local state. The row's own
   *      slide+collapse animation already plays before this resolves;
   *      adding the id to `hiddenIds` keeps the row gone from subsequent
   *      renders without round-tripping the parent.
   *   2. Show an Undo toast for UNDO_TIMEOUT_MS. The actual DELETE is
   *      scheduled inside the timer.
   *   3. If Undo fires, drop the id from `hiddenIds` and the row
   *      reappears in its original slot.
   *   4. After the timer the actual DELETE fires; on success we notify
   *      the parent via `onDeleted` so the row leaves its array too.
   *      On failure, we restore the row visually + surface an error toast.
   */
  async function deleteSession(id: string): Promise<boolean> {
    setHiddenIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })

    let cancelled = false
    let pendingDeleteTimer: ReturnType<typeof setTimeout> | null = null

    function restoreRow() {
      setHiddenIds(prev => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({
      key: Date.now(),
      message: t('session.movedToTrash'),
      onUndo: () => {
        cancelled = true
        if (pendingDeleteTimer) clearTimeout(pendingDeleteTimer)
        restoreRow()
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast(null)
      },
    })
    toastTimerRef.current = setTimeout(() => setToast(null), UNDO_TIMEOUT_MS)

    pendingDeleteTimer = setTimeout(async () => {
      if (cancelled) return
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        restoreRow()
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
        setToast({ key: Date.now(), message: t('session.deleteError') })
        toastTimerRef.current = setTimeout(() => setToast(null), 3000)
        return
      }
      // Success — promote the local hide into a parent-side removal so
      // both halves of state agree and the hiddenIds entry can be GC'd
      // by the cleanup effect above.
      onDeleted?.(id)
    }, UNDO_TIMEOUT_MS)

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
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      setToast({ key: Date.now(), message: t('session.toggleReadError') })
      toastTimerRef.current = setTimeout(() => setToast(null), 3000)
      return false
    }
    return true
  }

  // Hide rows currently inside an Undo window. They're still in the
  // parent's `sessions` array (we wait until the network DELETE actually
  // succeeds before notifying), but they should not render in the list.
  const visibleSessions = hiddenIds.size === 0
    ? sessions
    : sessions.filter(s => !hiddenIds.has(s.id))

  // Toast must always render — even when the list is empty (e.g. the user
  // just swiped away the only row, the row is hidden, the Undo toast is
  // up, and we need it to stay reachable so they can pull the row back).
  const renderedToast = toast && (
    <Toast
      toastKey={toast.key}
      message={toast.message}
      action={toast.onUndo ? { label: t('session.undo'), onClick: toast.onUndo } : undefined}
    />
  )

  if (visibleSessions.length === 0) {
    return (
      <>
        <p className="text-text-tertiary py-4">{t('session.noSessions')}</p>
        {renderedToast}
      </>
    )
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
        {visibleSessions.map(s => (
          <SwipeableSessionItem
            key={s.id}
            session={s}
            onDelete={deleteSession}
            onToggleRead={toggleReadSession}
          />
        ))}
      </ul>

      {renderedToast}
    </div>
  )
}
