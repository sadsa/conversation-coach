// components/AnnotationCard.tsx
'use client'
import { useState } from 'react'
import type { Annotation } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'

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
  annotation, sessionId, practiceItemId: initialPracticeItemId, isWrittenDown: initialIsWrittenDown,
  onAnnotationAdded, onAnnotationRemoved, onAnnotationWritten, onAnnotationUnwritten,
}: Props) {
  const { t } = useTranslation()
  const [practiceItemId, setPracticeItemId] = useState<string | null>(initialPracticeItemId)
  const [isWrittenDown, setIsWrittenDown] = useState(initialIsWrittenDown)
  const [loadingStar, setLoadingStar] = useState(false)
  const [loadingCheck, setLoadingCheck] = useState(false)
  const [importanceExpanded, setImportanceExpanded] = useState(false)

  async function handleStar() {
    if (practiceItemId) {
      setLoadingStar(true)
      const res = await fetch(`/api/practice-items/${practiceItemId}`, { method: 'DELETE' })
      if (res.ok) {
        setPracticeItemId(null)
        setIsWrittenDown(false)
        onAnnotationRemoved(annotation.id)
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
      }
      setLoadingStar(false)
    }
  }

  async function handleCheck() {
    if (!practiceItemId) return
    setLoadingCheck(true)
    const newValue = !isWrittenDown
    const res = await fetch(`/api/practice-items/${practiceItemId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ written_down: newValue }),
    })
    if (res.ok) {
      setIsWrittenDown(newValue)
      if (newValue) onAnnotationWritten(annotation.id)
      else onAnnotationUnwritten(annotation.id)
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
    <div className="space-y-3">
      <p className="text-base">
        <span className="bg-error-surface text-on-error-surface px-1.5 py-0.5 rounded">
          {annotation.original}
        </span>
        {' → '}
        <span className="font-semibold text-lg text-correction">
          {annotation.correction}
        </span>
      </p>
      <p className="text-sm text-text-secondary leading-relaxed">{annotation.explanation}</p>
      <span className="border border-accent-chip-border text-on-accent-chip bg-accent-chip rounded-full px-2 py-0.5 text-xs">
        {t(`subCat.${annotation.sub_category}`)}
      </span>
      {importanceStars(annotation.importance_score) && (
        <div>
          {annotation.importance_note ? (
            <>
              <button
                onClick={() => setImportanceExpanded(e => !e)}
                className="text-amber-400 text-base leading-none focus:outline-none"
                aria-label={t('practiceList.importanceToggleAria')}
              >
                {importanceStars(annotation.importance_score)}
              </button>
              {importanceExpanded && (
                <p className="mt-1.5 text-text-secondary text-xs leading-relaxed">
                  {annotation.importance_note}
                </p>
              )}
            </>
          ) : (
            <span className="text-amber-400 text-base leading-none">
              {importanceStars(annotation.importance_score)}
            </span>
          )}
        </div>
      )}
      {/* Action row */}
      <div className="flex items-center gap-2 pt-4 border-t border-border">
        <span className="text-xs text-text-tertiary mr-auto">{stateHint}</span>
        <button
          onClick={handleStar}
          disabled={loadingStar}
          aria-label={starAriaLabel}
          className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base transition-colors disabled:opacity-40 ${
            practiceItemId
              ? 'border-[var(--annotation-saved-border)] bg-[var(--annotation-saved-bg)] text-[var(--annotation-saved-text)]'
              : 'border-border bg-surface text-text-tertiary hover:border-border-hover'
          }`}
        >
          {practiceItemId ? '★' : '☆'}
        </button>
        <button
          onClick={handleCheck}
          disabled={!practiceItemId || loadingCheck}
          aria-label={checkAriaLabel}
          className={`w-9 h-9 rounded-lg border flex items-center justify-center text-base transition-colors disabled:opacity-30 ${
            isWrittenDown
              ? 'border-[var(--annotation-written-border)] bg-[var(--annotation-written-bg)] text-[var(--annotation-written-text)]'
              : 'border-border bg-surface text-text-tertiary hover:border-border-hover'
          }`}
        >
          ✓
        </button>
      </div>
    </div>
  )
}
