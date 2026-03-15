// components/AnnotationCard.tsx
'use client'
import type { Annotation } from '@/lib/types'

const TYPE_LABEL = { grammar: '🔴 Grammar', naturalness: '🟡 Naturalness', strength: '🟢 Strength' }

interface Props {
  annotation: Annotation
  onAddToPractice: (annotation: Annotation) => void
}

export function AnnotationCard({ annotation, onAddToPractice }: Props) {
  return (
    <div className="mt-2 ml-6 border border-gray-700 rounded-lg p-4 text-sm space-y-2 bg-gray-900">
      <p className="font-semibold text-xs uppercase tracking-wide text-gray-400">
        {TYPE_LABEL[annotation.type]}
      </p>
      <p>
        {annotation.correction ? (
          <span className="font-medium">{annotation.correction}</span>
        ) : (
          <span className="text-green-300">Keep this! &ldquo;{annotation.original}&rdquo;</span>
        )}
      </p>
      <p className="text-gray-400">{annotation.explanation}</p>
      <button
        onClick={() => onAddToPractice(annotation)}
        className="text-xs text-violet-400 hover:text-violet-300 underline"
      >
        Add to practice list
      </button>
    </div>
  )
}
