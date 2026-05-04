// lib/voice-context.ts
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
  _session: { title: string; user_speaker_labels: string[] | null },
  _segments: TranscriptSegment[],
  _annotations: Annotation[]
): VoicePageContext | null {
  throw new Error('not implemented')
}

export function buildWriteContext(
  _items: PracticeItem[]
): VoicePageContext | null {
  throw new Error('not implemented')
}

// Re-export cap so tests can assert against the same value.
export { CAP_CHARS }
