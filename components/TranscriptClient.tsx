'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TranscriptView } from '@/components/TranscriptView'
import { ReviewCompletionScreen, type SavedPhrase } from '@/components/ReviewCompletionScreen'
import { LessonClient } from '@/components/LessonClient'
import { Modal } from '@/components/Modal'
import { Toast } from '@/components/Toast'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/IconButton'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionDetail } from '@/lib/types'

interface Props {
  sessionId: string
  initialDetail: SessionDetail
}

export function TranscriptClient({ sessionId, initialDetail }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  // Server already gave us the full detail payload; nothing to load.
  // We still keep `detail` in state so optimistic mutations (annotation
  // toggles, dismissals) re-render without a full server round-trip.
  const [detail] = useState<SessionDetail>(initialDetail)
  const title = initialDetail.session.title
  const [addedAnnotations, setAddedAnnotations] = useState<Map<string, string>>(
    new Map(Object.entries(initialDetail.addedAnnotations))
  )
  const [unhelpfulAnnotations, setUnhelpfulAnnotations] = useState<Set<string>>(
    new Set(initialDetail.annotations.filter(a => a.is_unhelpful).map(a => a.id))
  )
  const [confirmReanalyse, setConfirmReanalyse] = useState(false)
  const [reanalyseError, setReanalyseError] = useState<string | null>(null)
  const [reanalysing, setReanalysing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [isRead, setIsRead] = useState(initialDetail.session.last_viewed_at !== null)
  const [showCompletion, _setShowCompletion] = useState(false)
  const [studyMode, setStudyMode] = useState(false)

  // Auto-mark this session as read on first visit. Idempotent on the server
  // (only stamps last_viewed_at when NULL), so repeat visits are no-ops and
  // the "Mark as unread" action stays the only way to flip it back. The ref
  // guards against the effect double-firing under React 18 StrictMode.
  const autoReadFiredRef = useRef(false)
  useEffect(() => {
    if (autoReadFiredRef.current) return
    autoReadFiredRef.current = true
    fetch(`/api/sessions/${sessionId}/view`, { method: 'POST' })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { alreadyViewed?: boolean } | null) => {
        // /review is a server component served from Next's Router Cache, so a
        // bare DB write leaves the cached inbox stale until a hard refresh.
        // When we actually flipped unread→read, bust the cache so back-nav
        // refetches and the row shows as read. Skip on repeat visits
        // (alreadyViewed) to avoid a needless server round-trip.
        if (data?.alreadyViewed === false) router.refresh()
      })
      .catch(() => { /* non-critical */ })
  }, [sessionId, router])

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

  function handleAnnotationAdded(annotationId: string, practiceItemId: string) {
    setAddedAnnotations(prev => { const next = new Map(prev); next.set(annotationId, practiceItemId); return next })
  }

  function handleAnnotationRemoved(annotationId: string) {
    setAddedAnnotations(prev => { const next = new Map(prev); next.delete(annotationId); return next })
  }

  function handleAnnotationUnhelpfulChanged(annotationId: string, isUnhelpful: boolean) {
    setUnhelpfulAnnotations(prev => {
      const next = new Set(prev)
      if (isUnhelpful) next.add(annotationId)
      else next.delete(annotationId)
      return next
    })
  }

  function handleToggleRead() {
    setMenuOpen(false)
    const next = !isRead
    setIsRead(next)
    fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read: next }),
    }).catch(() => { /* non-critical — read state is optimistic */ })
  }

  async function handleDelete() {
    setDeleteError(null)
    setDeleting(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/')
        return
      }
      setDeleteError(t('session.deleteError'))
    } catch {
      setDeleteError(t('session.deleteError'))
    }
    setDeleting(false)
  }

  async function handleReanalyse() {
    setReanalyseError(null)
    setReanalysing(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/analyse`, { method: 'POST' })
      if (res.ok) {
        setConfirmReanalyse(false)
        router.push(`/sessions/${sessionId}/status`)
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

  const { session, segments, annotations } = detail

  const durationLabel = session.duration_seconds
    ? `${Math.floor(session.duration_seconds / 60)} ${t('transcript.min')}`
    : ''

  // Saved phrases for the completion screen: join addedAnnotations with annotations
  const savedPhrases: SavedPhrase[] = Array.from(addedAnnotations.entries())
    .map(([annotationId, practiceItemId]) => {
      const annotation = annotations.find(a => a.id === annotationId)
      if (!annotation) return null
      return { practiceItemId, annotation }
    })
    .filter((x): x is SavedPhrase => x !== null)

  // When Study session active, mount LessonClient in-place over the transcript
  if (studyMode) {
    return (
      <LessonClient
        phrases={savedPhrases.map(p => ({
          correction: p.annotation.correction ?? p.annotation.original,
          explanation: p.annotation.explanation,
          flashcard_front: p.annotation.flashcard_front,
          flashcard_back: p.annotation.flashcard_back,
        }))}
        onExit={() => setStudyMode(false)}
      />
    )
  }

  // When all corrections reviewed — show completion screen
  if (showCompletion) {
    return (
      <div className="space-y-6">
        {/* Session context is demoted to a quiet breadcrumb here — the user
            just left this transcript, so the title no longer needs to lead.
            ReviewCompletionScreen's "Review done" h1 owns the page outline. */}
        <p className="text-sm text-text-tertiary break-words">
          {title}
          {durationLabel && <span className="text-text-tertiary/70"> · {durationLabel}</span>}
        </p>
        <ReviewCompletionScreen
          savedPhrases={savedPhrases}
        />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-detail-title leading-tight tracking-[-0.01em] break-words">{title}</p>
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
                  onClick={handleToggleRead}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-text-primary hover:bg-bg transition-colors"
                >
                  <Icon name="rotate-ccw" className="w-4 h-4 text-text-tertiary" />
                  {isRead ? t('session.markUnread') : t('session.markRead')}
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
                <div className="border-t border-border mx-3" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); setConfirmDelete(true); setDeleteError(null) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm text-status-error hover:bg-error-surface transition-colors"
                >
                  <Icon name="trash" className="w-4 h-4" />
                  {t('session.delete')}
                </button>
              </div>
            )}
          </div>
        </div>

        {durationLabel && (
          <p className="text-sm text-text-secondary">{durationLabel}</p>
        )}
      </header>

      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={session.user_speaker_labels ?? null}
        sessionId={sessionId}
        addedAnnotations={addedAnnotations}
        unhelpfulAnnotations={unhelpfulAnnotations}
        onAnnotationAdded={handleAnnotationAdded}
        onAnnotationRemoved={handleAnnotationRemoved}
        onAnnotationUnhelpfulChanged={handleAnnotationUnhelpfulChanged}
        onLaunchStudy={() => setStudyMode(true)}
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

      <Modal
        isOpen={confirmDelete}
        title={
          <div className="flex items-center gap-2 text-status-error">
            <Icon name="alert" className="w-5 h-5" />
            <span>{t('session.deleteTitle')}</span>
          </div>
        }
        onClose={() => { if (!deleting) setConfirmDelete(false) }}
      >
        <div className="space-y-5">
          <p className="text-text-secondary leading-relaxed">
            <strong className="text-text-primary">{title}</strong>{' '}
            {t('session.deleteWarning')}
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg disabled:opacity-50 transition-colors"
            >
              {t('session.cancelButton')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-status-error text-white hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
            >
              {deleting && <Icon name="spinner" className="w-4 h-4" />}
              {t('session.deleteButton')}
            </button>
          </div>
          {deleteError && (
            <p role="alert" className="text-status-error text-sm">{deleteError}</p>
          )}
        </div>
      </Modal>

      {toastMessage && <Toast message={toastMessage} />}
    </div>
  )
}
