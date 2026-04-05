// components/AnnotationCard.tsx
'use client'
import { useState } from 'react'
import type { Annotation } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  annotation: Annotation
  sessionId: string
  practiceItemId: string | null
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
}

export function AnnotationCard({ annotation, sessionId, practiceItemId: initialPracticeItemId, onAnnotationAdded, onAnnotationRemoved }: Props) {
  const { t } = useTranslation()
  const [practiceItemId, setPracticeItemId] = useState<string | null>(initialPracticeItemId)
  const [loading, setLoading] = useState(false)

  async function handleAdd() {
    setLoading(true)
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
      }),
    })
    if (res.ok) {
      const { id } = await res.json() as { id: string }
      setPracticeItemId(id)
      onAnnotationAdded(annotation.id, id)
    } else {
      console.error('Failed to add practice item')
    }
    setLoading(false)
  }

  async function handleRemove() {
    setLoading(true)
    const res = await fetch(`/api/practice-items/${practiceItemId}`, { method: 'DELETE' })
    if (res.ok) {
      setPracticeItemId(null)
      onAnnotationRemoved(annotation.id)
    } else {
      console.error('Failed to remove practice item')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-3">
      <p className="text-base">
        <>
          <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
            {annotation.original}
          </span>
          {' → '}
          <span className="font-semibold text-lg text-[#86efac]">
            {annotation.correction}
          </span>
        </>
      </p>
      <p className="text-sm text-text-secondary leading-relaxed">{annotation.explanation}</p>
      <span className="border border-indigo-800 text-indigo-400 bg-indigo-950 rounded-full px-2 py-0.5 text-xs">
        {t(`subCat.${annotation.sub_category}`)}
      </span>
      {practiceItemId ? (
        <button
          onClick={handleRemove}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-surface-elevated hover:bg-border text-sm text-text-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading && <span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />}
          {t('annotation.addedToPractice')}
        </button>
      ) : (
        <button
          onClick={handleAdd}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-base font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading && <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {t('annotation.addToPractice')}
        </button>
      )}
    </div>
  )
}
