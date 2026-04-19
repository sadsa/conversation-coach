// app/sessions/[id]/page.tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TranscriptView } from '@/components/TranscriptView'
import { InlineEdit } from '@/components/InlineEdit'
import { Modal } from '@/components/Modal'
import { Toast } from '@/components/Toast'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/IconButton'
import { useTranslation } from '@/components/LanguageProvider'
import { stashAutoRead } from '@/lib/auto-read-toast'
import type { SessionDetail } from '@/lib/types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; detail: SessionDetail }

export default function TranscriptPage({ params }: { params: { id: string } }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [title, setTitle] = useState('')
  const [addedAnnotations, setAddedAnnotations] = useState<Map<string, string>>(new Map())
  const [writtenAnnotations, setWrittenAnnotations] = useState<Set<string>>(new Set())
  const [unhelpfulAnnotations, setUnhelpfulAnnotations] = useState<Set<string>>(new Set())
  const [confirmReanalyse, setConfirmReanalyse] = useState(false)
  const [reanalyseError, setReanalyseError] = useState<string | null>(null)
  const [reanalysing, setReanalysing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const loadSession = useCallback(() => {
    setState({ kind: 'loading' })
    fetch(`/api/sessions/${params.id}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<SessionDetail>
      })
      .then(d => {
        setState({ kind: 'ready', detail: d })
        setTitle(d.session.title)
        setAddedAnnotations(new Map(Object.entries(d.addedAnnotations)))
        setWrittenAnnotations(new Set(d.writtenAnnotations))
        setUnhelpfulAnnotations(
          new Set(d.annotations.filter(a => a.is_unhelpful).map(a => a.id))
        )
      })
      .catch(() => setState({ kind: 'error', message: t('transcript.loadError') }))
  }, [params.id, t])

  useEffect(() => { loadSession() }, [loadSession])

  // Auto-mark this session as read on first visit. Idempotent on the server —
  // once `last_viewed_at` is populated, the endpoint is a no-op (it returns
  // `alreadyViewed: true`). When the call genuinely flipped the row from
  // unread to read for the first time, we stash a "Marked as read · Undo"
  // payload for the home page to surface on the next return — so a stray tap
  // is recoverable in one tap. We only stash AFTER the session detail has
  // loaded so the toast can include the conversation title.
  //
  // Gated by a ref so React Strict Mode's double-invoked effects in dev
  // don't double-fire the POST (and the second call's `alreadyViewed: true`
  // would suppress the stash incorrectly).
  const autoReadFiredRef = useRef(false)
  useEffect(() => {
    if (state.kind !== 'ready' || autoReadFiredRef.current) return
    autoReadFiredRef.current = true
    const title = state.detail.session.title
    fetch(`/api/sessions/${params.id}/view`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { ok?: boolean; alreadyViewed?: boolean } | null) => {
        if (data && data.alreadyViewed === false) {
          stashAutoRead(params.id, title)
        }
      })
      .catch(() => { /* non-critical — inbox just won't update on this device */ })
  }, [state, params.id])

  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(timer)
  }, [toastMessage])

  // Close the overflow menu when clicking outside or pressing Escape.
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

  async function handleRename(newTitle: string) {
    await fetch(`/api/sessions/${params.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    })
    setTitle(newTitle)
  }

  function handleAnnotationAdded(annotationId: string, practiceItemId: string) {
    setAddedAnnotations(prev => { const next = new Map(prev); next.set(annotationId, practiceItemId); return next })
  }

  function handleAnnotationRemoved(annotationId: string) {
    setAddedAnnotations(prev => { const next = new Map(prev); next.delete(annotationId); return next })
    setWrittenAnnotations(prev => { const next = new Set(prev); next.delete(annotationId); return next })
  }

  function handleAnnotationWritten(annotationId: string) {
    setWrittenAnnotations(prev => { const next = new Set(prev); next.add(annotationId); return next })
  }

  function handleAnnotationUnwritten(annotationId: string) {
    setWrittenAnnotations(prev => { const next = new Set(prev); next.delete(annotationId); return next })
  }

  function handleAnnotationUnhelpfulChanged(annotationId: string, isUnhelpful: boolean) {
    setUnhelpfulAnnotations(prev => {
      const next = new Set(prev)
      if (isUnhelpful) next.add(annotationId)
      else next.delete(annotationId)
      return next
    })
  }

  async function handleMarkUnread() {
    setMenuOpen(false)
    const res = await fetch(`/api/sessions/${params.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read: false }),
    })
    if (res.ok) {
      setToastMessage(t('transcript.markedUnreadToast'))
    } else {
      setToastMessage(t('transcript.markUnreadError'))
    }
  }

  async function handleReanalyse() {
    setReanalyseError(null)
    setReanalysing(true)
    try {
      const res = await fetch(`/api/sessions/${params.id}/analyse`, { method: 'POST' })
      if (res.ok) {
        setConfirmReanalyse(false)
        router.push(`/sessions/${params.id}/status`)
      } else {
        setReanalyseError(t('reanalyse.error'))
      }
    } catch {
      // Network failure (offline, DNS, abort) — keep the dialog open with an
      // inline error so the user can retry or cancel instead of being trapped
      // by `disabled={reanalysing}` on the buttons.
      setReanalyseError(t('reanalyse.error'))
    } finally {
      setReanalysing(false)
    }
  }

  if (state.kind === 'loading') {
    return <TranscriptSkeleton message={t('transcript.loading')} />
  }
  if (state.kind === 'error') {
    return <ErrorState message={state.message} retryLabel={t('transcript.retry')} onRetry={loadSession} />
  }

  const { session, segments, annotations } = state.detail
  const counts = { grammar: 0, naturalness: 0 }
  annotations.forEach(a => counts[a.type as keyof typeof counts]++)
  // Reviewed = saved OR dismissed. We split the count so the user can see
  // the shape of their decisions (not just "you've touched 7 of 11"). Saved
  // and dismissed are mutually exclusive on the card, so summing them is
  // safe — no double-counting.
  const savedCount = addedAnnotations.size
  const dismissedCount = unhelpfulAnnotations.size
  const reviewedCount = savedCount + dismissedCount
  const totalCount = annotations.length
  const remainingCount = Math.max(0, totalCount - reviewedCount)

  const durationLabel = session.duration_seconds
    ? `${Math.floor(session.duration_seconds / 60)} ${t('transcript.min')}`
    : ''

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <InlineEdit
              value={title}
              onSave={handleRename}
              ariaLabel={t('transcript.editTitle')}
              className="text-xl md:text-2xl font-bold break-words text-text-primary"
            />
          </div>

          {/* Overflow menu — destructive actions live here so they can't be
              tapped by accident. The transcript page only has one secondary
              action right now (Re-analyse), but this scales when more land. */}
          <div className="relative shrink-0" ref={menuRef}>
            <IconButton
              icon="more"
              size="lg"
              onClick={() => setMenuOpen(o => !o)}
              aria-label={t('transcript.moreActions')}
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
                  onClick={handleMarkUnread}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-text-primary hover:bg-bg transition-colors"
                >
                  <Icon name="rotate-ccw" className="w-4 h-4 text-text-tertiary" />
                  {t('transcript.markUnread')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setConfirmReanalyse(true); setReanalyseError(null) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-text-primary hover:bg-bg transition-colors"
                >
                  <Icon name="refresh" className="w-4 h-4 text-text-tertiary" />
                  {t('transcript.reanalyse')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Metadata row — duration + counts. Smaller and quieter; the title
            is the hero, not the stats. */}
        <p className="text-sm text-text-secondary">
          {durationLabel && <span>{durationLabel}</span>}
          {durationLabel && totalCount > 0 && <span className="mx-2 text-text-tertiary">·</span>}
          {counts.grammar > 0 && (
            <span>{counts.grammar} {t('transcript.grammar')}</span>
          )}
          {counts.grammar > 0 && counts.naturalness > 0 && <span className="mx-2 text-text-tertiary">·</span>}
          {counts.naturalness > 0 && (
            <span>{counts.naturalness} {t('transcript.naturalness')}</span>
          )}
        </p>

        {/* Progress strip — broken into saved / dismissed / to-go so the
            user sees the *shape* of their review, not just an opaque counter.
            When everything's reviewed we collapse to a single calm line so
            the strip doesn't keep nagging at zero remaining. */}
        {totalCount > 0 && (
          <div className="space-y-1.5" aria-live="polite">
            <p className="text-xs text-text-tertiary tabular-nums">
              {remainingCount === 0
                ? t('transcript.progressAllReviewed', { total: totalCount })
                : t('transcript.progress', {
                    saved: savedCount,
                    dismissed: dismissedCount,
                    remaining: remainingCount,
                  })}
            </p>
            <div
              className="h-1 rounded-full bg-border-subtle overflow-hidden"
              role="progressbar"
              aria-valuenow={reviewedCount}
              aria-valuemin={0}
              aria-valuemax={totalCount}
              aria-valuetext={t('transcript.progressAria', { n: reviewedCount, total: totalCount })}
            >
              <div
                className="h-full bg-accent-primary transition-[width] duration-300 ease-out"
                style={{ width: `${(reviewedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        )}
      </header>

      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={session.user_speaker_labels ?? null}
        sessionId={params.id}
        addedAnnotations={addedAnnotations}
        writtenAnnotations={writtenAnnotations}
        unhelpfulAnnotations={unhelpfulAnnotations}
        onAnnotationAdded={handleAnnotationAdded}
        onAnnotationRemoved={handleAnnotationRemoved}
        onAnnotationWritten={handleAnnotationWritten}
        onAnnotationUnwritten={handleAnnotationUnwritten}
        onAnnotationUnhelpfulChanged={handleAnnotationUnhelpfulChanged}
      />

      {/* Re-analyse confirmation. Two-step gate on a destructive action that
          wipes practice items derived from this session's annotations. */}
      <Modal
        isOpen={confirmReanalyse}
        title={
          <div className="flex items-center gap-2 text-status-error">
            <Icon name="alert" className="w-5 h-5" />
            <span>{t('reanalyse.title')}</span>
          </div>
        }
        onClose={() => { if (!reanalysing) setConfirmReanalyse(false) }}
      >
        <div className="space-y-5">
          <p className="text-text-secondary leading-relaxed">{t('reanalyse.body')}</p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmReanalyse(false)}
              disabled={reanalysing}
              className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg disabled:opacity-50 transition-colors"
            >
              {t('reanalyse.cancel')}
            </button>
            <button
              type="button"
              onClick={handleReanalyse}
              disabled={reanalysing}
              className="px-4 py-2 rounded-lg bg-status-error text-white hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
            >
              {reanalysing && <Icon name="spinner" className="w-4 h-4" />}
              {t('reanalyse.confirm')}
            </button>
          </div>
          {reanalyseError && (
            <p role="alert" className="text-status-error text-sm">{reanalyseError}</p>
          )}
        </div>
      </Modal>

      {toastMessage && <Toast message={toastMessage} />}
    </div>
  )
}

function TranscriptSkeleton({ message }: { message: string }) {
  return (
    <div className="space-y-8 animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">{message}</span>
      <header className="space-y-3">
        <div className="h-7 w-2/3 bg-surface-elevated rounded" />
        <div className="h-4 w-1/3 bg-surface-elevated rounded" />
        <div className="h-1 w-full bg-surface-elevated rounded-full" />
      </header>
      <div className="space-y-6 max-w-prose">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-12 bg-surface-elevated rounded" />
            <div className="h-5 w-full bg-surface-elevated rounded" />
            <div className="h-5 w-11/12 bg-surface-elevated rounded" />
            <div className="h-5 w-3/4 bg-surface-elevated rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorState({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div role="alert" className="space-y-4 max-w-prose">
      <div className="flex items-start gap-3 text-text-primary">
        <Icon name="alert" className="w-5 h-5 mt-0.5 shrink-0 text-status-error" />
        <p className="text-base leading-relaxed">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-text-primary hover:bg-surface-elevated transition-colors"
      >
        <Icon name="refresh" className="w-4 h-4" />
        {retryLabel}
      </button>
    </div>
  )
}
