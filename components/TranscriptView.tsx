// components/TranscriptView.tsx
'use client'
import { useState } from 'react'
import { AnnotatedText } from '@/components/AnnotatedText'
import { Modal } from '@/components/Modal'
import { AnnotationCard, TYPE_LABEL } from '@/components/AnnotationCard'
import type { TranscriptSegment, Annotation } from '@/lib/types'

interface Props {
  segments: TranscriptSegment[]
  annotations: Annotation[]
  userSpeakerLabels: ('A' | 'B')[] | null
  sessionId: string
  addedAnnotationIds: Set<string>
  onAnnotationAdded: (annotationId: string) => void
}

export function TranscriptView({ segments, annotations, userSpeakerLabels, sessionId, addedAnnotationIds, onAnnotationAdded }: Props) {
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null)

  const annotationsBySegment = annotations.reduce<Record<string, Annotation[]>>((acc, a) => {
    if (!acc[a.segment_id]) acc[a.segment_id] = []
    acc[a.segment_id].push(a)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Segments */}
      <div className="space-y-4">
        {segments.map(seg => {
          const isUser = userSpeakerLabels === null || userSpeakerLabels.includes(seg.speaker)

          return (
            <div key={seg.id}>
              <div className={!isUser ? 'opacity-40' : ''}>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                  {isUser ? 'You' : 'Them'}
                </p>
                <span className="text-sm leading-relaxed break-words">
                  {isUser && (annotationsBySegment[seg.id] ?? []).length > 0 ? (
                    <AnnotatedText
                      text={seg.text}
                      annotations={annotationsBySegment[seg.id] ?? []}
                      onAnnotationClick={a => {
                        setActiveAnnotation(activeAnnotation?.id === a.id ? null : a)
                      }}
                      addedAnnotationIds={addedAnnotationIds}
                    />
                  ) : (
                    seg.text
                  )}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      {activeAnnotation && (
        <Modal
          title={<span>{TYPE_LABEL[activeAnnotation.type]}</span>}
          onClose={() => setActiveAnnotation(null)}
        >
          <AnnotationCard
            annotation={activeAnnotation}
            sessionId={sessionId}
            isAdded={addedAnnotationIds.has(activeAnnotation.id)}
            onAnnotationAdded={onAnnotationAdded}
          />
        </Modal>
      )}
    </div>
  )
}
