// components/AnnotatedText.tsx
'use client'
import type { Annotation } from '@/lib/types'

interface Props {
  text: string
  annotations: Annotation[]
  onAnnotationClick: (annotation: Annotation) => void
  savedAnnotationIds?: Set<string>
  unhelpfulAnnotationIds?: Set<string>
  /** Annotation id currently anchored to the open AnnotationSheet, if any. */
  activeAnnotationId?: string | null
  /** Accessible label for the mark button (defaults to "Open correction"). */
  openLabel?: string
  /**
   * Localised state suffixes appended to the mark's aria-label.
   * Defaults are English fallbacks; callers should supply localised strings
   * via `t('transcript.markState.*')` so screen-reader output matches the UI
   * language.
   */
  stateLabels?: { saved: string; unreviewed: string }
  /**
   * Subtract this from each annotation's start_char/end_char before indexing
   * into `text`. Used when rendering a paragraph slice of a larger segment;
   * the parent has already filtered annotations to those that fall within
   * the slice. Defaults to 0 (legacy whole-segment rendering).
   */
  offsetBase?: number
}

const DEFAULT_STATE_LABELS = {
  saved: 'saved',
  unreviewed: 'needs review',
}

interface Span {
  start: number
  end: number
  annotation?: Annotation
}

function buildSpans(text: string, annotations: Annotation[], offsetBase: number): Span[] {
  const sorted = [...annotations].sort((a, b) => a.start_char - b.start_char)
  const spans: Span[] = []
  let cursor = 0
  for (const ann of sorted) {
    const localStart = ann.start_char - offsetBase
    const localEnd = ann.end_char - offsetBase
    if (localStart > cursor) spans.push({ start: cursor, end: localStart })
    spans.push({ start: localStart, end: localEnd, annotation: ann })
    cursor = localEnd
  }
  if (cursor < text.length) spans.push({ start: cursor, end: text.length })
  return spans
}

function annotationClass(id: string, saved: Set<string>): string {
  if (saved.has(id)) return 'annotation-saved'
  return 'annotation-unreviewed'
}

/**
 * State indicator that supplements the colour-only encoding for accessibility.
 * Shows ★ for saved items; empty for unreviewed.
 */
function StateGlyph({ id, saved }: { id: string; saved: Set<string> }) {
  if (saved.has(id)) {
    return (
      <span aria-hidden="true" className="ml-0.5 text-[0.7em] align-middle opacity-80 select-none">
        ★
      </span>
    )
  }
  return null
}

export function AnnotatedText({
  text,
  annotations,
  onAnnotationClick,
  savedAnnotationIds = new Set(),
  unhelpfulAnnotationIds = new Set(),
  activeAnnotationId = null,
  openLabel = 'Open correction',
  stateLabels = DEFAULT_STATE_LABELS,
  offsetBase = 0,
}: Props) {
  const spans = buildSpans(text, annotations, offsetBase)

  return (
    <span>
      {spans.map((span, i) => {
        const slice = text.slice(span.start, span.end)
        if (span.annotation) {
          const ann = span.annotation
          const isUnhelpful = unhelpfulAnnotationIds.has(ann.id)
          const stateClass = annotationClass(ann.id, savedAnnotationIds)
          const isActive = ann.id === activeAnnotationId
          const stateText = savedAnnotationIds.has(ann.id)
            ? stateLabels.saved
            : stateLabels.unreviewed
          const visualClass = isUnhelpful
            ? 'bg-transparent underline decoration-dotted decoration-1 underline-offset-2 text-text-tertiary cursor-pointer rounded-sm px-1 transition-shadow focus-visible:outline-none'
            : `underline decoration-2 underline-offset-2 cursor-pointer rounded-sm px-1 transition-shadow focus-visible:outline-none ${stateClass} ${isActive ? 'annotation-active' : ''}`
          return (
            <mark
              key={i}
              data-annotation-id={ann.id}
              data-unhelpful={isUnhelpful || undefined}
              role="button"
              tabIndex={0}
              aria-label={`${openLabel}: "${slice}", ${stateText}`}
              aria-pressed={isActive}
              className={visualClass}
              onClick={() => onAnnotationClick(ann)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onAnnotationClick(ann)
                }
              }}
            >
              {slice}
              {!isUnhelpful && (
                <StateGlyph id={ann.id} saved={savedAnnotationIds} />
              )}
            </mark>
          )
        }
        return <span key={i}>{slice}</span>
      })}
    </span>
  )
}
