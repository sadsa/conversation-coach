// components/TranscriptView.tsx
'use client'
import { useState } from 'react'
import { AnnotatedText } from '@/components/AnnotatedText'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { TranscriptSegment, Annotation } from '@/lib/types'

type Filter = 'all' | 'grammar' | 'naturalness' | 'strength'

interface Props {
  segments: TranscriptSegment[]
  annotations: Annotation[]
  userSpeakerLabel: 'A' | 'B' | null
  onAddToPractice: (annotation: Annotation) => void
}

export function TranscriptView({ segments, annotations, userSpeakerLabel, onAddToPractice }: Props) {
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const annotationsBySegment = annotations.reduce<Record<string, Annotation[]>>((acc, a) => {
    if (!acc[a.segment_id]) acc[a.segment_id] = []
    acc[a.segment_id].push(a)
    return acc
  }, {})

  const counts = { grammar: 0, naturalness: 0, strength: 0 }
  annotations.forEach(a => counts[a.type]++)

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2 text-sm flex-wrap">
        {(['all', 'grammar', 'naturalness', 'strength'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full border transition-colors ${
              filter === f
                ? 'border-violet-500 text-violet-300 bg-violet-500/10'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {f === 'all' ? 'All' : f === 'grammar' ? `🔴 Grammar (${counts.grammar})` : f === 'naturalness' ? `🟡 Natural (${counts.naturalness})` : `🟢 Strengths (${counts.strength})`}
          </button>
        ))}
      </div>

      {/* Segments */}
      <div className="space-y-4">
        {segments.map(seg => {
          const isUser = userSpeakerLabel === null || seg.speaker === userSpeakerLabel

          return (
            <div key={seg.id}>
              <div className={`flex gap-4 ${!isUser ? 'opacity-40' : ''}`}>
                <span className="text-xs text-gray-500 w-14 text-right pt-0.5 shrink-0">
                  {isUser ? 'You' : 'Them'}
                </span>
                <span className="text-sm leading-relaxed">
                  {isUser && (annotationsBySegment[seg.id] ?? []).length > 0 ? (
                    <AnnotatedText
                      text={seg.text}
                      annotations={annotationsBySegment[seg.id] ?? []}
                      onAnnotationClick={a => {
                        // Only toggle card if annotation passes the current filter
                        if (filter === 'all' || a.type === filter) {
                          setActiveAnnotation(activeAnnotation?.id === a.id ? null : a)
                        }
                      }}
                    />
                  ) : (
                    seg.text
                  )}
                </span>
              </div>
              {activeAnnotation && annotationsBySegment[seg.id]?.find(a => a.id === activeAnnotation.id) && (
                <AnnotationCard annotation={activeAnnotation} onAddToPractice={onAddToPractice} onClose={() => setActiveAnnotation(null)} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
