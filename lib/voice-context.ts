// lib/voice-context.ts
import { log } from '@/lib/logger'
import type { TranscriptSegment, Annotation, PracticeItem } from '@/lib/types'

export interface SessionExcerpt {
  position: number
  /** Resolved from session.user_speaker_labels at build time. */
  speaker: 'user' | 'other'
  text: string
  /** True iff at least one annotation references this segment. */
  isAnnotated: boolean
}

export interface SessionAnnotation {
  /** Links to SessionExcerpt.position. */
  segmentPosition: number
  type: 'grammar' | 'naturalness'
  original: string
  correction: string | null
  explanation: string
}

export interface WriteContextItem {
  original: string
  correction: string | null
  explanation: string
  /** The full sentence the error appeared in; null for legacy items without annotation_id. */
  segmentText: string | null
  /** Source session title; null only if the session was deleted. */
  sessionTitle: string | null
}

export type VoicePageContext =
  | {
      kind: 'session'
      sessionTitle: string
      excerpts: SessionExcerpt[]
      annotations: SessionAnnotation[]
    }
  | {
      kind: 'write'
      items: WriteContextItem[]
    }

const CAP_CHARS = 8000

export function buildSessionContext(
  session: { title: string; user_speaker_labels: string[] | null },
  segments: TranscriptSegment[],
  annotations: Annotation[]
): VoicePageContext | null {
  if (segments.length === 0) return null

  const segById = new Map(segments.map(s => [s.id, s]))
  const segByPos = new Map(segments.map(s => [s.position, s]))

  // Resolve which positions have at least one annotation.
  const annotatedPositions = new Set<number>()
  for (const a of annotations) {
    const s = segById.get(a.segment_id)
    if (s) annotatedPositions.add(s.position)
  }

  // Expand each annotated position ±1, bounded to segments that exist.
  const expandedPositions = new Set<number>()
  for (const pos of annotatedPositions) {
    if (segByPos.has(pos - 1)) expandedPositions.add(pos - 1)
    expandedPositions.add(pos)
    if (segByPos.has(pos + 1)) expandedPositions.add(pos + 1)
  }

  const userLabels = session.user_speaker_labels

  function makeExcerpts(positions: Set<number>, annotated: Set<number>): SessionExcerpt[] {
    return [...positions]
      .sort((a, b) => a - b)
      .map(pos => {
        const s = segByPos.get(pos)!
        return {
          position: pos,
          speaker: userLabels === null || userLabels.includes(s.speaker) ? 'user' : 'other',
          text: s.text,
          isAnnotated: annotated.has(pos),
        }
      })
  }

  // Build the full annotation list sorted by segment position.
  const allAnnotations: SessionAnnotation[] = annotations
    .map(a => {
      const s = segById.get(a.segment_id)
      return {
        segmentPosition: s?.position ?? 0,
        type: a.type as 'grammar' | 'naturalness',
        original: a.original,
        correction: a.correction,
        explanation: a.explanation,
      }
    })
    .sort((a, b) => a.segmentPosition - b.segmentPosition)

  // Apply the 8000-char cap: drop annotations from the end until under cap.
  function renderBlock(excerpts: SessionExcerpt[], anns: SessionAnnotation[]): string {
    if (excerpts.length === 0) return `The user is reviewing the conversation titled '${session.title}'.`
    const excerptLines = excerpts
      .map(e => `[${e.speaker}, position ${e.position}]: ${e.text}${e.isAnnotated ? '  ← annotated' : ''}`)
      .join('\n')
    const annotationLines = anns
      .map((a, i) => {
        const corrPart = a.correction ? ` → "${a.correction}"` : ''
        return `${i + 1}. On the ${a.type} at position ${a.segmentPosition}: "${a.original}"${corrPart} — ${a.explanation}`
      })
      .join('\n')
    return `The user is reviewing this conversation excerpt:\n${excerptLines}\n\nAnnotations on this excerpt:\n${annotationLines}`
  }

  let kept = allAnnotations
  let keptExcerpts = makeExcerpts(expandedPositions, annotatedPositions)

  while (kept.length > 0 && renderBlock(keptExcerpts, kept).length > CAP_CHARS) {
    kept = kept.slice(0, -1)
    // Recompute expanded positions from remaining annotations.
    const remainingPositions = new Set(kept.map(a => a.segmentPosition))
    const reExpanded = new Set<number>()
    for (const pos of remainingPositions) {
      if (segByPos.has(pos - 1)) reExpanded.add(pos - 1)
      reExpanded.add(pos)
      if (segByPos.has(pos + 1)) reExpanded.add(pos + 1)
    }
    const remainingAnnotated = new Set(kept.map(a => a.segmentPosition))
    keptExcerpts = makeExcerpts(reExpanded, remainingAnnotated)
  }

  if (kept.length < allAnnotations.length) {
    log.warn('voice-context cap hit', {
      kind: 'session',
      originalCount: allAnnotations.length,
      keptCount: kept.length,
    })
  }

  return {
    kind: 'session',
    sessionTitle: session.title,
    excerpts: keptExcerpts,
    annotations: kept,
  }
}

export function buildWriteContext(
  items: PracticeItem[]
): VoicePageContext | null {
  const pending = items.filter(i => !i.written_down)
  if (pending.length === 0) return null

  const contextItems: WriteContextItem[] = pending.map(i => ({
    original: i.original,
    correction: i.correction,
    explanation: i.explanation,
    segmentText: i.segment_text,
    sessionTitle: i.session_title,
  }))

  function renderWriteBlock(list: WriteContextItem[]): string {
    return `Pending corrections the user has saved:\n${list
      .map((ci, idx) => {
        const corrPart = ci.correction ? ` → "${ci.correction}"` : ''
        const fromPart = ci.sessionTitle ? ` (from "${ci.sessionTitle}")` : ''
        return `${idx + 1}. "${ci.original}"${corrPart} — ${ci.explanation}${fromPart}`
      })
      .join('\n')}`
  }

  let kept = contextItems
  while (kept.length > 1 && renderWriteBlock(kept).length > CAP_CHARS) {
    kept = kept.slice(0, -1)
  }

  if (kept.length < contextItems.length) {
    log.warn('voice-context cap hit', {
      kind: 'write',
      originalCount: contextItems.length,
      keptCount: kept.length,
    })
  }

  return { kind: 'write', items: kept }
}

// Re-export cap so tests can assert against the same value.
export { CAP_CHARS }
