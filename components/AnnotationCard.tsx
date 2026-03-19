'use client'
import { useState } from 'react'
import type { Annotation } from '@/lib/types'

const TYPE_LABEL = { grammar: '🔴 Grammar', naturalness: '🟡 Naturalness', strength: '🟢 Strength' }

interface Props {
  annotation: Annotation
  sessionId: string
  isAdded: boolean
  onAnnotationAdded: (annotationId: string) => void
  onClose: () => void
}

export function AnnotationCard({ annotation, sessionId, isAdded, onAnnotationAdded, onClose }: Props) {
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
    <div className="mt-2 border border-gray-700 rounded-lg p-4 text-sm space-y-2 bg-gray-900">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-xs uppercase tracking-wide text-gray-400">
          {TYPE_LABEL[annotation.type]}
        </p>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <p>
        {annotation.correction ? (
          <>
            <span className="line-through text-gray-500">{annotation.original}</span>
            {' → '}
            <span className="font-medium">{annotation.correction}</span>
          </>
        ) : (
          <span className="text-green-300">Keep this! &ldquo;{annotation.original}&rdquo;</span>
        )}
      </p>
      <p className="text-gray-400">{annotation.explanation}</p>
      {added ? (
        <button
          disabled
          className="text-xs text-gray-500 cursor-not-allowed"
        >
          ✓ Added to practice list
        </button>
      ) : (
        <button
          onClick={handleAdd}
          className="text-xs text-violet-400 hover:text-violet-300 underline"
        >
          Add to practice list
        </button>
      )}
    </div>
  )
}
