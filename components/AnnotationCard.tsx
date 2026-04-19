// components/AnnotationCard.tsx
//
// One annotation rendered in the docked AnnotationSheet. The card carries
// exactly two user actions:
//   1. 👍 Helpful — saves this correction as a practice item; it then shows
//      up on the /write page (Write tab) for paper review, replacing the
//      old "save with star" button.
//   2. 👎 Unhelpful — flags the correction for prompt iteration. The data is
//      the point, not a behaviour change for the user.
//
// Helpful and unhelpful are mutually exclusive: tapping the opposite signal
// undoes the previous one (and removes the practice item if it existed).
// "Mark as written down" is no longer on this card — once a correction is
// saved it lives on /write, where the Write/Written segmented control is
// the right place to flip its written_down state.
//
// Footer state hint mirrors which signal is active so the user always knows
// where this card stands without having to inspect the icons.
'use client'
import { useEffect, useState } from 'react'
import type { Annotation } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'

function importanceStars(score: number | null): string | null {
  if (score === 3) return '★★★'
  if (score === 2) return '★★☆'
  if (score === 1) return '★☆☆'
  return null
}

interface Props {
  annotation: Annotation
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
  annotation, sessionId,
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

  useEffect(() => {
    setPracticeItemId(initialPracticeItemId)
    setIsUnhelpful(annotation.is_unhelpful)
    setImportanceExpanded(false)
    setErrorMessage(null)
  }, [annotation.id, annotation.is_unhelpful, initialPracticeItemId])

  useEffect(() => {
    if (!errorMessage) return
    const timer = setTimeout(() => setErrorMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [errorMessage])

  // Both handlers are idempotent toggles. They also enforce mutual exclusion:
  // marking helpful clears unhelpful (and vice versa) so the card can never
  // claim "Saved" and "Marked unhelpful" at the same time.

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
    return true
  }

  async function deletePracticeItem(id: string): Promise<boolean> {
    const res = await fetch(`/api/practice-items/${id}`, { method: 'DELETE' })
    if (!res.ok) return false
    setPracticeItemId(null)
    onAnnotationRemoved(annotation.id)
    return true
  }

  async function handleHelpful() {
    if (busy) return
    setErrorMessage(null)
    setBusy('helpful')
    try {
      if (practiceItemId) {
        // Already saved — tap toggles off.
        const ok = await deletePracticeItem(practiceItemId)
        if (!ok) setErrorMessage(t('annotation.saveError'))
      } else {
        // Save. Clear unhelpful first so the two signals stay mutually
        // exclusive (a save is a vote of confidence; the dismissal is gone).
        if (isUnhelpful) {
          const ok = await setUnhelpful(false)
          if (!ok) {
            setErrorMessage(t('annotation.unhelpfulError'))
            return
          }
        }
        const saved = await savePracticeItem()
        if (!saved) setErrorMessage(t('annotation.saveError'))
      }
    } finally {
      setBusy(null)
    }
  }

  async function handleUnhelpful() {
    if (busy) return
    setErrorMessage(null)
    setBusy('unhelpful')
    try {
      if (isUnhelpful) {
        const ok = await setUnhelpful(false)
        if (!ok) setErrorMessage(t('annotation.unhelpfulError'))
      } else {
        // Marking unhelpful — drop any saved practice item first so the user
        // doesn't end up reviewing a card they just dismissed.
        if (practiceItemId) {
          const ok = await deletePracticeItem(practiceItemId)
          if (!ok) {
            setErrorMessage(t('annotation.saveError'))
            return
          }
        }
        const ok = await setUnhelpful(true)
        if (!ok) setErrorMessage(t('annotation.unhelpfulError'))
      }
    } finally {
      setBusy(null)
    }
  }

  const stateHint = isUnhelpful
    ? t('annotation.stateUnhelpful')
    : practiceItemId
    ? t('annotation.stateSaved')
    : t('annotation.stateNeutral')

  const helpfulAriaLabel = practiceItemId
    ? t('annotation.helpfulUndoAria')
    : t('annotation.helpfulAria')

  const unhelpfulAriaLabel = isUnhelpful
    ? t('annotation.unmarkUnhelpfulAria')
    : t('annotation.markUnhelpfulAria')

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

      <div className="flex flex-wrap items-center gap-2">
        <span className="border border-accent-chip-border text-on-accent-chip bg-accent-chip rounded-full px-3 py-1 text-sm">
          {t(`subCat.${annotation.sub_category}`)}
        </span>

        {importanceStars(annotation.importance_score) && (
          annotation.importance_note ? (
            <button
              onClick={() => setImportanceExpanded(e => !e)}
              className="text-pill-amber text-base leading-none focus:outline-none rounded px-1"
              aria-label={t('writeList.importanceToggleAria')}
              aria-expanded={importanceExpanded}
            >
              {importanceStars(annotation.importance_score)}
            </button>
          ) : (
            <span className="text-pill-amber text-base leading-none">
              {importanceStars(annotation.importance_score)}
            </span>
          )
        )}
      </div>

      {importanceExpanded && annotation.importance_note && (
        <p className="text-text-secondary text-sm leading-relaxed -mt-3">
          {annotation.importance_note}
        </p>
      )}

      {/* Action row — always two buttons. State hint on the left tells the
          user where this card sits; the buttons themselves carry the
          interaction. Both are 44px-tall so they're comfortable on mobile. */}
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <span className="text-sm text-text-tertiary mr-auto">{stateHint}</span>

        <button
          onClick={handleUnhelpful}
          disabled={busy !== null}
          aria-label={unhelpfulAriaLabel}
          aria-pressed={isUnhelpful}
          title={unhelpfulAriaLabel}
          className={`w-11 h-11 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-50 ${
            isUnhelpful
              ? 'border-text-secondary bg-surface-elevated text-text-secondary'
              : 'border-border bg-surface text-text-tertiary hover:border-text-secondary hover:text-text-secondary'
          }`}
        >
          <Icon name="thumbs-down" className="w-5 h-5" />
        </button>

        <button
          onClick={handleHelpful}
          disabled={busy !== null}
          aria-label={helpfulAriaLabel}
          aria-pressed={!!practiceItemId}
          title={helpfulAriaLabel}
          className={`w-11 h-11 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-50 ${
            practiceItemId
              ? 'border-[var(--annotation-saved-border)] bg-[var(--annotation-saved-bg)] text-[var(--annotation-saved-text)]'
              : 'border-border bg-surface text-text-tertiary hover:border-text-secondary hover:text-text-secondary'
          }`}
        >
          <Icon name="thumbs-up" className="w-5 h-5" />
        </button>
      </div>

      <div role="status" aria-live="polite" className="min-h-[1rem]">
        {errorMessage && (
          <p className="text-status-error text-sm">{errorMessage}</p>
        )}
      </div>
    </div>
  )
}
