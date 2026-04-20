// components/AnnotationSheet.tsx
//
// Docked review panel that replaces the centered modal for annotation review.
// All sheet chrome (layout, animation, gestures, focus / keyboard / outside-
// click handling) lives in `DockedSheet`. This file focuses on the annotation-
// specific header and the `AnnotationCard` body. The first-open navigation
// hint lives in the shared `<NavHint>` component so the sister `WriteSheet`
// surface inherits the same onboarding cue and dismiss flag.
//
// The header used to surface the correction's type (grammar vs naturalness)
// and a coloured dot, but the user reads through the same sheet for both
// kinds of correction and never acted on the distinction — so the dot and
// the type heading were distilled out. Position (`3 of 12`) stays because
// it's pure navigation context.
//
// `preserveOutsideSelector="[data-annotation-id]"` keeps the sheet open when
// the user taps a different annotation mark in the transcript — TranscriptView
// swaps the active id and the sheet's `contentKey` change replays the body
// fade.

'use client'
import { useTranslation } from '@/components/LanguageProvider'
import { AnnotationCard } from '@/components/AnnotationCard'
import { DockedSheet } from '@/components/DockedSheet'
import { NavHint } from '@/components/NavHint'
import type { Annotation } from '@/lib/types'

interface Props {
  annotation: Annotation | null
  /** 1-indexed position of this annotation among the user's annotations. */
  position: { current: number; total: number } | null
  hasPrev: boolean
  hasNext: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void

  // Forwarded to AnnotationCard
  sessionId: string
  practiceItemId: string | null
  isWrittenDown: boolean
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
  onAnnotationWritten: (annotationId: string) => void
  onAnnotationUnwritten: (annotationId: string) => void
  onAnnotationUnhelpfulChanged?: (annotationId: string, isUnhelpful: boolean) => void
}

export function AnnotationSheet({
  annotation,
  position,
  hasPrev,
  hasNext,
  onClose,
  onPrev,
  onNext,
  ...cardProps
}: Props) {
  const { t } = useTranslation()
  const isOpen = annotation !== null

  if (!isOpen || !annotation) return null

  return (
    <DockedSheet
      isOpen={isOpen}
      ariaLabel={t('transcript.openCorrection')}
      onClose={onClose}
      onPrev={onPrev}
      onNext={onNext}
      hasPrev={hasPrev}
      hasNext={hasNext}
      preserveOutsideSelector="[data-annotation-id]"
      contentKey={annotation.id}
      headerLead={
        position && (
          <span className="text-xs text-text-tertiary tabular-nums">
            {t('sheet.position', { n: position.current, total: position.total })}
          </span>
        )
      }
    >
      <NavHint />
      <AnnotationCard annotation={annotation} {...cardProps} />
    </DockedSheet>
  )
}
