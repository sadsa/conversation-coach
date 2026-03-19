// components/AnnotationCard.tsx
'use client'
import { useState } from 'react'
import type { Annotation, AnnotationType } from '@/lib/types'

export const TYPE_LABEL: Record<AnnotationType, string> = {
  grammar: '🔴 Grammar',
  naturalness: '🟡 Naturalness',
  strength: '🟢 Strength',
}

interface Props {
  annotation: Annotation
  sessionId: string
  isAdded: boolean
  onAnnotationAdded: (annotationId: string) => void
}

export function AnnotationCard({ annotation, sessionId, isAdded, onAnnotationAdded }: Props) {
  const [added, setAdded] = useState(isAdded)

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
      }),
    })
    if (res.ok) {
      setAdded(true)
      onAnnotationAdded(annotation.id)
    } else {
      console.error('Failed to add practice item')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-base">
        {annotation.correction ? (
          <>
            <span className="line-through text-gray-500">{annotation.original}</span>
            {' → '}
            <span className="font-semibold text-lg">{annotation.correction}</span>
          </>
        ) : (
          <span className="text-green-300">Keep this! &ldquo;{annotation.original}&rdquo;</span>
        )}
      </p>
      <p className="text-sm text-gray-400 leading-relaxed">{annotation.explanation}</p>
      {added ? (
        <button disabled className="w-full py-3 rounded-xl bg-gray-700 text-sm text-gray-500 cursor-not-allowed">
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
