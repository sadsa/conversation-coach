// components/AnnotationCard.tsx
//
// One annotation rendered in the docked AnnotationSheet. After the design
// rework the card carries a deliberate hierarchy:
//
//   1. A primary "Save to my Write list" button (shared `<Button>`) — the
//      one action the user is here for. Verb-first, full-width on mobile,
//      gets initial focus when the sheet opens (`data-initial-focus`), and
//      flips to an "Added to write list" confirmation after a save. The
//      saved-state label carries the destination itself so we don't need a
//      separate hint paragraph below — the button IS the receipt.
//   2. A quiet text "Not useful — hide it" affordance underneath. Same
//      idempotent toggle the old 👎 carried, but visually demoted so it can
//      never compete with Save for attention.
//
// The hidden-state caption ("Hidden from your transcript.") stays — without
// it the only signal is the opacity fade on the whole card, which on its own
// reads as "loading" more than "dismissed".
//
// Type and sub-category indicators (the coloured grammar/naturalness dot in
// the sheet header and the sub-category pill that used to sit above the
// importance pill) were both removed. The user reads through the same sheet
// for both kinds of correction and never acted on either signal.
//
// Errors no longer auto-dismiss. They surface a Retry button that re-runs
// the failed action, and (when applicable) an offline note so the user
// understands why retrying is unlikely to help right now.
//
// Importance is rendered as a single soft pill ("Worth remembering" or, at
// score 3, "High priority") rather than three ASCII stars. Score === 1 is
// hidden entirely — by definition a 1-of-3 importance signal isn't earning
// its visual weight on every card.

'use client'
import { useEffect, useRef, useState } from 'react'
import type { Annotation } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'
import { buttonStyles } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { ImportancePill } from '@/components/ImportancePill'

interface Props {
  annotation: Annotation
  segment: {
    start_ms: number
    end_ms: number
    text: string
  } | null
  audioUrl: string | null
  sessionId: string
  practiceItemId: string | null
  /** Retained on the interface so transcript-side state plumbing (the green
   *  written-down highlight in AnnotatedText) is unaffected. The card no
   *  longer surfaces a UI for it — written-down lives on /write now. */
  isWrittenDown: boolean
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
  /** Kept for prop-shape compatibility with TranscriptView; unused here. */
  onAnnotationWritten: (annotationId: string) => void
  onAnnotationUnwritten: (annotationId: string) => void
  onAnnotationUnhelpfulChanged?: (annotationId: string, isUnhelpful: boolean) => void
}

export function AnnotationCard({
  annotation, segment, audioUrl, sessionId,
  practiceItemId: initialPracticeItemId,
  isWrittenDown: _isWrittenDown,
  onAnnotationAdded, onAnnotationRemoved,
  onAnnotationWritten: _onWritten, onAnnotationUnwritten: _onUnwritten,
  onAnnotationUnhelpfulChanged,
}: Props) {
  const { t } = useTranslation()
  const [practiceItemId, setPracticeItemId] = useState<string | null>(initialPracticeItemId)
  const [isUnhelpful, setIsUnhelpful] = useState<boolean>(annotation.is_unhelpful)
  const [busy, setBusy] = useState<'helpful' | 'unhelpful' | null>(null)
  const [importanceExpanded, setImportanceExpanded] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** Which action failed last — drives the Retry button so it knows which
   *  handler to re-run without the user having to find the original control. */
  const [lastFailedAction, setLastFailedAction] = useState<'helpful' | 'unhelpful' | null>(null)
  /** Becomes true for ~600ms after a successful save so the primary button
   *  can play the saved-pulse keyframe — a small reflexive "yes, that
   *  happened" without needing a toast. */
  const [justSaved, setJustSaved] = useState(false)
  const justSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [isPlayingSnippet, setIsPlayingSnippet] = useState(false)
  const clipEndMsRef = useRef<number | null>(null)

  useEffect(() => {
    setPracticeItemId(initialPracticeItemId)
    setIsUnhelpful(annotation.is_unhelpful)
    setImportanceExpanded(false)
    setErrorMessage(null)
    setLastFailedAction(null)
    setJustSaved(false)
    setAudioError(null)
    setIsPlayingSnippet(false)
    clipEndMsRef.current = null
    if (audioRef.current) audioRef.current.pause()
    if (justSavedTimer.current) {
      clearTimeout(justSavedTimer.current)
      justSavedTimer.current = null
    }
  }, [annotation.id, annotation.is_unhelpful, initialPracticeItemId])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (justSavedTimer.current) clearTimeout(justSavedTimer.current)
    }
  }, [])

  function triggerSavedPulse() {
    setJustSaved(true)
    if (justSavedTimer.current) clearTimeout(justSavedTimer.current)
    justSavedTimer.current = setTimeout(() => setJustSaved(false), 650)
  }

  // Both handlers are idempotent toggles. They also enforce mutual exclusion:
  // saving clears unhelpful (and vice versa) so the card can never claim
  // "Saved" and "Hidden" at the same time.

  async function setUnhelpful(value: boolean): Promise<boolean> {
    setIsUnhelpful(value)
    onAnnotationUnhelpfulChanged?.(annotation.id, value)
    const res = await fetch(`/api/annotations/${annotation.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_unhelpful: value }),
    })
    if (!res.ok) {
      setIsUnhelpful(!value)
      onAnnotationUnhelpfulChanged?.(annotation.id, !value)
      return false
    }
    return true
  }

  async function savePracticeItem(): Promise<boolean> {
    const res = await fetch('/api/practice-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        annotation_id: annotation.id,
        type: annotation.type,
        original: annotation.original,
        correction: annotation.correction,
        explanation: annotation.explanation,
        sub_category: annotation.sub_category,
        flashcard_front: annotation.flashcard_front ?? null,
        flashcard_back: annotation.flashcard_back ?? null,
        flashcard_note: annotation.flashcard_note ?? null,
        importance_score: annotation.importance_score ?? null,
        importance_note: annotation.importance_note ?? null,
      }),
    })
    if (!res.ok) return false
    const { id } = await res.json() as { id: string }
    setPracticeItemId(id)
    onAnnotationAdded(annotation.id, id)
    triggerSavedPulse()
    return true
  }

  async function deletePracticeItem(id: string): Promise<boolean> {
    const res = await fetch(`/api/practice-items/${id}`, { method: 'DELETE' })
    if (!res.ok) return false
    setPracticeItemId(null)
    onAnnotationRemoved(annotation.id)
    return true
  }

  function recordFailure(action: 'helpful' | 'unhelpful', message: string) {
    setErrorMessage(message)
    setLastFailedAction(action)
  }

  function clearError() {
    setErrorMessage(null)
    setLastFailedAction(null)
  }

  async function handleHelpful() {
    if (busy) return
    clearError()
    setBusy('helpful')
    try {
      if (practiceItemId) {
        const ok = await deletePracticeItem(practiceItemId)
        if (!ok) recordFailure('helpful', t('annotation.saveError'))
      } else {
        // Save. Clear unhelpful first so the two signals stay mutually
        // exclusive (a save is a vote of confidence; the dismissal is gone).
        if (isUnhelpful) {
          const ok = await setUnhelpful(false)
          if (!ok) {
            recordFailure('helpful', t('annotation.unhelpfulError'))
            return
          }
        }
        const saved = await savePracticeItem()
        if (!saved) recordFailure('helpful', t('annotation.saveError'))
      }
    } finally {
      setBusy(null)
    }
  }

  async function handleUnhelpful() {
    if (busy) return
    clearError()
    setBusy('unhelpful')
    try {
      if (isUnhelpful) {
        const ok = await setUnhelpful(false)
        if (!ok) recordFailure('unhelpful', t('annotation.unhelpfulError'))
      } else {
        // Marking unhelpful — drop any saved practice item first so the user
        // doesn't end up reviewing a card they just dismissed.
        if (practiceItemId) {
          const ok = await deletePracticeItem(practiceItemId)
          if (!ok) {
            recordFailure('unhelpful', t('annotation.saveError'))
            return
          }
        }
        const ok = await setUnhelpful(true)
        if (!ok) recordFailure('unhelpful', t('annotation.unhelpfulError'))
      }
    } finally {
      setBusy(null)
    }
  }

  function handleRetry() {
    if (lastFailedAction === 'helpful') void handleHelpful()
    else if (lastFailedAction === 'unhelpful') void handleUnhelpful()
  }

  function resolveSnippetBoundsMs() {
    if (!segment || !segment.text) return null
    const segDuration = Math.max(0, segment.end_ms - segment.start_ms)
    if (segDuration <= 0) return null
    const textLen = Math.max(1, segment.text.length)
    const clampedStart = Math.max(0, Math.min(annotation.start_char, textLen))
    const clampedEnd = Math.max(clampedStart, Math.min(annotation.end_char, textLen))
    const ratioStart = clampedStart / textLen
    const ratioEnd = clampedEnd / textLen
    const baseStartMs = segment.start_ms + ratioStart * segDuration
    const baseEndMs = segment.start_ms + ratioEnd * segDuration
    const leadInMs = 300
    const tailMs = 450
    return {
      startMs: Math.max(segment.start_ms, baseStartMs - leadInMs),
      endMs: Math.min(segment.end_ms, baseEndMs + tailMs),
    }
  }

  async function handlePlaySnippet() {
    if (!audioUrl || !segment) return
    if (isPlayingSnippet) {
      audioRef.current?.pause()
      setIsPlayingSnippet(false)
      return
    }
    const bounds = resolveSnippetBoundsMs()
    if (!bounds || bounds.endMs <= bounds.startMs) {
      setAudioError(t('annotation.audioUnavailable'))
      return
    }
    setAudioError(null)
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl)
      audioRef.current.preload = 'metadata'
      audioRef.current.addEventListener('ended', () => setIsPlayingSnippet(false))
      audioRef.current.addEventListener('pause', () => setIsPlayingSnippet(false))
    } else if (audioRef.current.src !== audioUrl) {
      audioRef.current.pause()
      audioRef.current.src = audioUrl
    }

    clipEndMsRef.current = bounds.endMs
    audioRef.current.currentTime = bounds.startMs / 1000

    audioRef.current.ontimeupdate = () => {
      if (!audioRef.current || clipEndMsRef.current == null) return
      if (audioRef.current.currentTime * 1000 >= clipEndMsRef.current) {
        audioRef.current.pause()
        setIsPlayingSnippet(false)
      }
    }

    try {
      await audioRef.current.play()
      setIsPlayingSnippet(true)
    } catch {
      setAudioError(t('annotation.audioPlayError'))
      setIsPlayingSnippet(false)
    }
  }

  const primaryLabel = practiceItemId ? t('annotation.savedPrimary') : t('annotation.savePrimary')
  const primaryAria = practiceItemId ? t('annotation.savedPrimaryAria') : t('annotation.savePrimaryAria')
  const secondaryLabel = isUnhelpful ? t('annotation.notUsefulRestore') : t('annotation.notUseful')
  const secondaryAria = isUnhelpful ? t('annotation.notUsefulRestoreAria') : t('annotation.notUsefulAria')

  // Best-effort offline detection. We only consult `navigator` when an error
  // is on screen — it's a hint, not load-bearing logic, so SSR gets the safe
  // default of "we don't know" (treated as online).
  const isOffline =
    errorMessage !== null &&
    typeof navigator !== 'undefined' &&
    'onLine' in navigator &&
    !navigator.onLine

  return (
    <div
      className={`space-y-5 transition-opacity duration-200 ${isUnhelpful ? 'opacity-60' : 'opacity-100'}`}
      data-unhelpful={isUnhelpful || undefined}
    >
      <p className="text-base md:text-lg leading-relaxed">
        <span className="bg-error-surface text-on-error-surface px-2 py-1 rounded">
          {annotation.original}
        </span>
        <span className="mx-2 text-text-tertiary" aria-hidden="true">→</span>
        <span className="font-semibold text-lg md:text-xl text-correction">
          {annotation.correction}
        </span>
      </p>

      <p className="text-text-secondary leading-relaxed text-base">
        {annotation.explanation}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePlaySnippet}
          disabled={!audioUrl || !segment}
          aria-label={isPlayingSnippet ? t('annotation.stopSnippetAria') : t('annotation.playSnippetAria')}
          className={buttonStyles({
            variant: 'secondary',
            size: 'sm',
            className: 'inline-flex items-center',
          })}
        >
          <Icon name={isPlayingSnippet ? 'pause' : 'play'} className="w-4 h-4 mr-2" />
          {isPlayingSnippet ? t('annotation.stopSnippet') : t('annotation.playSnippet')}
        </button>
        {!audioUrl && (
          <span className="text-xs text-text-tertiary">{t('annotation.audioUnavailable')}</span>
        )}
      </div>
      {audioError && (
        <p className="text-sm text-status-error">{audioError}</p>
      )}

      <ImportancePill
        score={annotation.importance_score}
        note={annotation.importance_note}
        expanded={importanceExpanded}
        onToggle={() => setImportanceExpanded(e => !e)}
      />

      {importanceExpanded && annotation.importance_note && (
        <p className="text-text-secondary text-sm leading-relaxed -mt-3">
          {annotation.importance_note}
        </p>
      )}

      {/* Action region — primary verb above, quiet secondary below. The
          primary carries `data-initial-focus` so DockedSheet's open lifecycle
          puts the cursor on the action the user is here for, not on Close.
          The post-save outcome hint that used to sit here was distilled
          into the button's own saved-state copy ("Added to write list").
          The hidden-state caption stays — without it the only feedback is
          the card-wide opacity fade, which reads as "loading" by itself. */}
      <div className="pt-4 border-t border-border space-y-3">
        {isUnhelpful && (
          <p className="text-sm text-text-tertiary leading-snug">
            {t('annotation.unhelpfulHint')}
          </p>
        )}

        <button
          type="button"
          data-initial-focus
          onClick={handleHelpful}
          disabled={busy !== null}
          aria-label={primaryAria}
          aria-pressed={!!practiceItemId}
          className={buttonStyles({
            variant: practiceItemId ? 'secondary' : 'primary',
            size: 'md',
            fullWidth: true,
            className: [
              practiceItemId
                ? 'border-[var(--annotation-saved-border)] bg-[var(--annotation-saved-bg)] text-[var(--annotation-saved-text)] hover:bg-[var(--annotation-saved-bg)]'
                : '',
              justSaved ? 'motion-safe:animate-[saved-pulse_650ms_ease-out_both]' : '',
            ].filter(Boolean).join(' '),
          })}
        >
          {practiceItemId && (
            <Icon name="check" className="w-4 h-4 mr-2" />
          )}
          {primaryLabel}
        </button>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleUnhelpful}
            disabled={busy !== null}
            aria-label={secondaryAria}
            aria-pressed={isUnhelpful}
            className="text-sm text-text-tertiary hover:text-text-secondary underline underline-offset-2 hover:no-underline disabled:opacity-50 px-1 py-0.5 rounded"
          >
            {secondaryLabel}
          </button>
        </div>
      </div>

      <div role="status" aria-live="polite" className="min-h-[1rem]">
        {errorMessage && (
          <div className="rounded-lg border border-status-error/30 bg-error-container px-3 py-2 space-y-1.5">
            <p className="text-status-error text-sm leading-snug">{errorMessage}</p>
            {isOffline && (
              <p className="text-text-tertiary text-xs leading-snug">{t('annotation.offlineNote')}</p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRetry}
                disabled={busy !== null}
                className="text-status-error text-sm font-medium hover:underline disabled:opacity-50 px-1 py-0.5 rounded"
              >
                {t('annotation.retry')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
