// components/AnnotatedText.tsx
'use client'
import type { Annotation } from '@/lib/types'

interface Props {
  text: string
  annotations: Annotation[]
  onAnnotationClick: (annotation: Annotation) => void
  savedAnnotationIds?: Set<string>
  writtenAnnotationIds?: Set<string>
  /** Annotation id currently anchored to the open AnnotationSheet, if any. */
  activeAnnotationId?: string | null
  /** Accessible label for the mark button (defaults to "Open correction"). */
  openLabel?: string
}

interface Span {
  start: number
  end: number
  annotation?: Annotation
}

function buildSpans(text: string, annotations: Annotation[]): Span[] {
  const sorted = [...annotations].sort((a, b) => a.start_char - b.start_char)
  const spans: Span[] = []
  let cursor = 0
  for (const ann of sorted) {
    if (ann.start_char > cursor) spans.push({ start: cursor, end: ann.start_char })
    spans.push({ start: ann.start_char, end: ann.end_char, annotation: ann })
    cursor = ann.end_char
  }
  if (cursor < text.length) spans.push({ start: cursor, end: text.length })
  return spans
}

function annotationClass(id: string, saved: Set<string>, written: Set<string>): string {
  if (written.has(id)) return 'annotation-written'
  if (saved.has(id)) return 'annotation-saved'
  return 'annotation-unreviewed'
}

/**
 * State indicator that supplements the colour-only encoding for accessibility.
 * Sighted users still get the colour cue; colour-blind / screen-reader users
 * get the glyph + screen-reader text. Empty for unreviewed (already implied
 * by the absence of a glyph).
 */
function StateGlyph({ id, saved, written }: { id: string; saved: Set<string>; written: Set<string> }) {
  if (written.has(id)) {
    return (
      <span aria-hidden="true" className="ml-0.5 text-[0.7em] align-middle opacity-80 select-none">
        ✓
      </span>
    )
  }
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
  writtenAnnotationIds = new Set(),
  activeAnnotationId = null,
  openLabel = 'Open correction',
}: Props) {
  const spans = buildSpans(text, annotations)

  return (
    <span>
      {spans.map((span, i) => {
        const slice = text.slice(span.start, span.end)
        if (span.annotation) {
          const ann = span.annotation
          const stateClass = annotationClass(ann.id, savedAnnotationIds, writtenAnnotationIds)
          const isActive = ann.id === activeAnnotationId
          const stateText = writtenAnnotationIds.has(ann.id)
            ? 'written down'
            : savedAnnotationIds.has(ann.id)
              ? 'saved'
              : 'needs review'
          return (
            <mark
              key={i}
              data-annotation-id={ann.id}
              role="button"
              tabIndex={0}
              aria-label={`${openLabel}: "${slice}", ${stateText}`}
              aria-pressed={isActive}
              className={`underline decoration-2 underline-offset-2 cursor-pointer rounded-sm px-1 transition-shadow focus-visible:outline-none ${stateClass} ${isActive ? 'annotation-active' : ''}`}
              onClick={() => onAnnotationClick(ann)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onAnnotationClick(ann)
                }
              }}
            >
              {slice}
              <StateGlyph id={ann.id} saved={savedAnnotationIds} written={writtenAnnotationIds} />
            </mark>
          )
        }
        return <span key={i}>{slice}</span>
      })}
    </span>
  )
}
