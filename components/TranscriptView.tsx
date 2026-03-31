// components/TranscriptView.tsx
'use client'
import { useState } from 'react'
import { AnnotatedText } from '@/components/AnnotatedText'
import { Modal } from '@/components/Modal'
import { AnnotationCard } from '@/components/AnnotationCard'
import { useTranslation } from '@/components/LanguageProvider'
import type { TranscriptSegment, Annotation } from '@/lib/types'

interface Props {
  segments: TranscriptSegment[]
  annotations: Annotation[]
  userSpeakerLabels: ('A' | 'B')[] | null
  sessionId: string
  addedAnnotations: Map<string, string>           // annotationId -> practiceItemId
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
}

export function TranscriptView({ segments, annotations, userSpeakerLabels, sessionId, addedAnnotations, onAnnotationAdded, onAnnotationRemoved }: Props) {
  const { t } = useTranslation()
  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null)

  const annotationsBySegment = annotations.reduce<Record<string, Annotation[]>>((acc, a) => {
    if (!acc[a.segment_id]) acc[a.segment_id] = []
    acc[a.segment_id].push(a)
    return acc
  }, {})

  const addedAnnotationIds = new Set(addedAnnotations.keys())

  return (
    <div className="space-y-4">
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
          title={<span>{t(`type.${activeAnnotation.type}`)}</span>}
          onClose={() => setActiveAnnotation(null)}
        >
          <AnnotationCard
            annotation={activeAnnotation}
            sessionId={sessionId}
            practiceItemId={addedAnnotations.get(activeAnnotation.id) ?? null}
            onAnnotationAdded={onAnnotationAdded}
            onAnnotationRemoved={onAnnotationRemoved}
          />
        </Modal>
      )}
    </div>
  )
}
