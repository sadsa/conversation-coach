// components/AnnotatedText.tsx
import type { Annotation } from '@/lib/types'

const TYPE_CLASS: Record<string, string> = {
  grammar: 'bg-red-500/25 decoration-red-400',
  naturalness: 'bg-yellow-500/25 decoration-yellow-400',
  strength: 'bg-green-500/25 decoration-green-400',
}

interface Props {
  text: string
  annotations: Annotation[]
  onAnnotationClick: (annotation: Annotation) => void
}

interface Span {
  start: number
  end: number
  annotation?: Annotation
}

function buildSpans(text: string, annotations: Annotation[]): Span[] {
  // Sort annotations by start_char
  const sorted = [...annotations].sort((a, b) => a.start_char - b.start_char)
  const spans: Span[] = []
  let cursor = 0

  for (const ann of sorted) {
    if (ann.start_char > cursor) {
      spans.push({ start: cursor, end: ann.start_char })
    }
    spans.push({ start: ann.start_char, end: ann.end_char, annotation: ann })
    cursor = ann.end_char
  }

  if (cursor < text.length) {
    spans.push({ start: cursor, end: text.length })
  }

  return spans
}

export function AnnotatedText({ text, annotations, onAnnotationClick }: Props) {
  const spans = buildSpans(text, annotations)

  return (
    <span>
      {spans.map((span, i) => {
        const slice = text.slice(span.start, span.end)
        if (span.annotation) {
          const cls = TYPE_CLASS[span.annotation.type] ?? ''
          return (
            <mark
              key={i}
              className={`underline decoration-2 cursor-pointer rounded-sm px-0.5 ${cls}`}
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
