// components/AnnotationCard.tsx
'use client'
import { useState } from 'react'
import type { Annotation, AnnotationType } from '@/lib/types'
import { SUB_CATEGORY_DISPLAY } from '@/lib/types'

export const TYPE_LABEL: Record<AnnotationType, string> = {
  grammar: '🔴 Grammar',
  naturalness: '🟡 Naturalness',
}

interface Props {
  annotation: Annotation
  sessionId: string
  practiceItemId: string | null
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
}

export function AnnotationCard({ annotation, sessionId, practiceItemId: initialPracticeItemId, onAnnotationAdded, onAnnotationRemoved }: Props) {
  const [practiceItemId, setPracticeItemId] = useState<string | null>(initialPracticeItemId)

  async function handleAdd() {
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
        {SUB_CATEGORY_DISPLAY[annotation.sub_category]}
      </span>
      {practiceItemId ? (
        <button
          onClick={handleRemove}
          className="w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm text-gray-400 transition-colors"
        >
          ✓ Added to practice list
        </button>
      ) : (
        <button
          onClick={handleAdd}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-base font-semibold text-white transition-colors"
        >
          Add to practice list
        </button>
      )}
    </div>
  )
}
