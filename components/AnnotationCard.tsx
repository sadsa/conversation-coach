// components/AnnotationCard.tsx
'use client'
import { useState } from 'react'
import type { Annotation } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'
import { WriteItDownSheet } from '@/components/WriteItDownSheet'

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
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  async function handleSave() {
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
      throw new Error('Failed to add practice item')
    }
  }

  async function handleRemove() {
    const res = await fetch(`/api/practice-items/${practiceItemId}`, { method: 'DELETE' })
    if (res.ok) {
      setPracticeItemId(null)
      onAnnotationRemoved(annotation.id)
    } else {
      console.error('Failed to remove practice item')
    }
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
      <p className="text-sm text-gray-400 leading-relaxed">{annotation.explanation}</p>
      <span className="border border-indigo-800 text-indigo-400 bg-indigo-950 rounded-full px-2 py-0.5 text-xs">
        {t(`subCat.${annotation.sub_category}`)}
      </span>
      {practiceItemId ? (
        <button
          onClick={handleRemove}
          className="w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm text-gray-400 transition-colors"
        >
          {t('annotation.addedToPractice')}
        </button>
      ) : (
        <button
          onClick={() => setIsSheetOpen(true)}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-base font-semibold text-white transition-colors"
        >
          {t('annotation.addToPractice')}
        </button>
      )}
      <WriteItDownSheet
        isOpen={isSheetOpen}
        annotation={annotation}
        onConfirm={handleSave}
        onClose={() => setIsSheetOpen(false)}
      />
    </div>
  )
}
