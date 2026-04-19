// components/AnnotatedText.tsx
'use client'
import type { Annotation } from '@/lib/types'

interface Props {
  text: string
  annotations: Annotation[]
  onAnnotationClick: (annotation: Annotation) => void
  savedAnnotationIds?: Set<string>
  writtenAnnotationIds?: Set<string>
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
  stateLabels?: { written: string; saved: string; unreviewed: string }
}

const DEFAULT_STATE_LABELS = {
  written: 'written down',
  saved: 'saved',
  unreviewed: 'needs review',
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
  unhelpfulAnnotationIds = new Set(),
  activeAnnotationId = null,
  openLabel = 'Open correction',
  stateLabels = DEFAULT_STATE_LABELS,
}: Props) {
  const spans = buildSpans(text, annotations)

  return (
    <span>
      {spans.map((span, i) => {
        const slice = text.slice(span.start, span.end)
        if (span.annotation) {
          const ann = span.annotation
          const isUnhelpful = unhelpfulAnnotationIds.has(ann.id)
          const stateClass = annotationClass(ann.id, savedAnnotationIds, writtenAnnotationIds)
          const isActive = ann.id === activeAnnotationId
          const stateText = writtenAnnotationIds.has(ann.id)
            ? stateLabels.written
            : savedAnnotationIds.has(ann.id)
              ? stateLabels.saved
              : stateLabels.unreviewed
          // Unhelpful marks are still tappable (so the user can undo via the
          // sheet) but lose their state colour entirely — they read as plain
          // body text with a faint dotted underline so they don't compete
          // with active corrections during a scan. `bg-transparent` is load-
          // bearing: <mark> ships with a user-agent default of solid yellow
          // and we'd otherwise inherit it (worse: brighter than every other
          // state). We also skip annotation-active here so the dismissed
          // mark doesn't pulse with a ring while the sheet is still open
          // for it.
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
                <StateGlyph id={ann.id} saved={savedAnnotationIds} written={writtenAnnotationIds} />
              )}
            </mark>
          )
        }
        return <span key={i}>{slice}</span>
      })}
    </span>
  )
}
