// components/AnnotatedText.tsx
import type { Annotation } from '@/lib/types'

interface Props {
  text: string
  annotations: Annotation[]
  onAnnotationClick: (annotation: Annotation) => void
  savedAnnotationIds?: Set<string>
  writtenAnnotationIds?: Set<string>
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

export function AnnotatedText({
  text,
  annotations,
  onAnnotationClick,
  savedAnnotationIds = new Set(),
  writtenAnnotationIds = new Set(),
}: Props) {
  const spans = buildSpans(text, annotations)

  return (
    <span>
      {spans.map((span, i) => {
        const slice = text.slice(span.start, span.end)
        if (span.annotation) {
          const stateClass = annotationClass(span.annotation.id, savedAnnotationIds, writtenAnnotationIds)
          return (
            <mark
              key={i}
              className={`underline decoration-2 cursor-pointer rounded-sm px-1 ${stateClass}`}
              onClick={() => onAnnotationClick(span.annotation!)}
            >
              {slice}
            </mark>
          )
        }
        return <span key={i}>{slice}</span>
      })}
    </span>
  )
}
