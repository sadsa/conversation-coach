// components/AnnotationCard.tsx
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
  isWrittenDown: boolean
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
  onAnnotationWritten: (annotationId: string) => void
  onAnnotationUnwritten: (annotationId: string) => void
}

export function AnnotationCard({
  annotation, sessionId,
  practiceItemId: initialPracticeItemId,
  isWrittenDown: initialIsWrittenDown,
  onAnnotationAdded, onAnnotationRemoved, onAnnotationWritten, onAnnotationUnwritten,
}: Props) {
  const { t } = useTranslation()
  const [practiceItemId, setPracticeItemId] = useState<string | null>(initialPracticeItemId)
  const [isWrittenDown, setIsWrittenDown] = useState(initialIsWrittenDown)
  const [loadingStar, setLoadingStar] = useState(false)
  const [loadingCheck, setLoadingCheck] = useState(false)
  const [importanceExpanded, setImportanceExpanded] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Reset local state when the annotation prop changes (e.g. user navigates
  // prev/next in the AnnotationSheet — same component instance, new annotation).
  useEffect(() => {
    setPracticeItemId(initialPracticeItemId)
    setIsWrittenDown(initialIsWrittenDown)
    setImportanceExpanded(false)
    setErrorMessage(null)
  }, [annotation.id, initialPracticeItemId, initialIsWrittenDown])

  // Auto-clear inline errors so they don't linger.
  useEffect(() => {
    if (!errorMessage) return
    const timer = setTimeout(() => setErrorMessage(null), 3500)
    return () => clearTimeout(timer)
  }, [errorMessage])

  async function handleStar() {
    if (loadingStar) return
    setErrorMessage(null)
    if (practiceItemId) {
      setLoadingStar(true)
      const res = await fetch(`/api/practice-items/${practiceItemId}`, { method: 'DELETE' })
      if (res.ok) {
        setPracticeItemId(null)
        setIsWrittenDown(false)
        onAnnotationRemoved(annotation.id)
      } else {
        setErrorMessage(t('annotation.saveError'))
      }
      setLoadingStar(false)
    } else {
      setLoadingStar(true)
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
      if (res.ok) {
        const { id } = await res.json() as { id: string }
        setPracticeItemId(id)
        onAnnotationAdded(annotation.id, id)
      } else {
        setErrorMessage(t('annotation.saveError'))
      }
      setLoadingStar(false)
    }
  }

  async function handleCheck() {
    if (!practiceItemId || loadingCheck) return
    setErrorMessage(null)
    const newValue = !isWrittenDown
    // Optimistic update — flip immediately, revert on error.
    setIsWrittenDown(newValue)
    if (newValue) onAnnotationWritten(annotation.id)
    else onAnnotationUnwritten(annotation.id)

    setLoadingCheck(true)
    const res = await fetch(`/api/practice-items/${practiceItemId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ written_down: newValue }),
    })
    if (!res.ok) {
      setIsWrittenDown(!newValue)
      if (newValue) onAnnotationUnwritten(annotation.id)
      else onAnnotationWritten(annotation.id)
      setErrorMessage(t('annotation.writtenError'))
    }
    setLoadingCheck(false)
  }

  const stateHint = isWrittenDown
    ? t('annotation.stateWritten')
    : practiceItemId
    ? t('annotation.stateSaved')
    : t('annotation.stateUnsaved')

  const starAriaLabel = practiceItemId
    ? t('annotation.unstarAria')
    : t('annotation.starAria')

  const checkAriaLabel = isWrittenDown
    ? t('annotation.unmarkWrittenAria')
    : t('annotation.markWrittenAria')

  return (
    <div className="space-y-5">
      {/* Original → Correction. Bigger and more readable than before; this is
          what the user is here to study. */}
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

      {/* Action row. Bigger touch targets (44×44 min), real SVG icons, and
          a state hint with screen-reader live region for feedback. */}
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <span className="text-sm text-text-tertiary mr-auto">{stateHint}</span>

        <button
          onClick={handleStar}
          disabled={loadingStar}
          aria-label={starAriaLabel}
          aria-pressed={!!practiceItemId}
          className={`w-11 h-11 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-50 ${
            practiceItemId
              ? 'border-[var(--annotation-saved-border)] bg-[var(--annotation-saved-bg)] text-[var(--annotation-saved-text)]'
              : 'border-border bg-surface text-text-tertiary hover:border-text-secondary hover:text-text-secondary'
          }`}
        >
          <Icon
            name="star"
            className={`w-5 h-5 ${practiceItemId ? 'fill-current' : ''}`}
          />
        </button>

        <button
          onClick={handleCheck}
          disabled={!practiceItemId || loadingCheck}
          aria-label={checkAriaLabel}
          aria-pressed={isWrittenDown}
          className={`w-11 h-11 rounded-lg border flex items-center justify-center transition-colors disabled:opacity-30 ${
            isWrittenDown
              ? 'border-[var(--annotation-written-border)] bg-[var(--annotation-written-bg)] text-[var(--annotation-written-text)]'
              : 'border-border bg-surface text-text-tertiary hover:border-text-secondary hover:text-text-secondary'
          }`}
        >
          <Icon name="check" className="w-5 h-5" />
        </button>
      </div>

      {/* Live region for failure feedback. role=status so it's polite and
          doesn't interrupt the user mid-action. */}
      <div role="status" aria-live="polite" className="min-h-[1rem]">
        {errorMessage && (
          <p className="text-status-error text-sm">{errorMessage}</p>
        )}
      </div>
    </div>
  )
}
