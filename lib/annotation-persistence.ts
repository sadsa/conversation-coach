// lib/annotation-persistence.ts
//
// The single deep module both analysis paths cross to write Claude's
// annotations to the DB. Before this existed, the upload/webhook path
// (`lib/pipeline.ts`) and the voice-practice path
// (`app/api/practice-sessions/route.ts`) each rebuilt the same ceremony
// verbatim: build a segment-text map, normalise offsets/sub_categories,
// map the 14 annotation fields, insert. The 14-field map was duplicated
// byte-for-byte. Collapsing it here keeps the two callers honest — they
// can't drift apart.
//
// Kept pure-ish: takes the caller's already-created `db` (don't open a
// second client — `practice-sessions` runs other inserts in the same try
// block, `pipeline` owns its own). `normaliseAnnotations` stays a pure
// module in `lib/annotations.ts`.

import { createServerClient } from '@/lib/supabase-server'
import { normaliseAnnotations } from '@/lib/annotations'
import { log } from '@/lib/logger'
import type { ClaudeAnnotation } from '@/lib/claude'

/**
 * Normalise, filter, and insert Claude annotations for a session.
 *
 * Builds the `segmentTextById` map internally from `segments`, runs
 * `normaliseAnnotations` (offset correction, sub_category coercion,
 * importance_score === 1 drop), maps the 14 DB columns, and inserts.
 *
 * Throws on insert error — both callers already wrap this in a try/catch
 * that transitions the session to its analysis-error state.
 *
 * @returns the number of annotations kept (post-filter, the count written)
 */
export async function persistAnnotations(
  db: ReturnType<typeof createServerClient>,
  sessionId: string,
  annotations: ClaudeAnnotation[],
  segments: { id: string; text: string }[],
): Promise<number> {
  const segmentTextById = new Map(segments.map(s => [s.id, s.text]))

  const preNormalise = annotations.length
  const kept = normaliseAnnotations(annotations, segmentTextById)

  if (kept.length < preNormalise) {
    log.info('Dropped low-importance annotations', {
      sessionId,
      dropped: preNormalise - kept.length,
      kept: kept.length,
    })
  }

  if (kept.length > 0) {
    const { error } = await db.from('annotations').insert(
      kept.map(a => ({
        session_id: sessionId,
        segment_id: a.segment_id,
        type: a.type,
        original: a.original,
        start_char: a.start_char,
        end_char: a.end_char,
        correction: a.correction,
        explanation: a.explanation,
        sub_category: a.sub_category,
        flashcard_front: a.flashcard_front ?? null,
        flashcard_back: a.flashcard_back ?? null,
        flashcard_note: a.flashcard_note ?? null,
        importance_score: a.importance_score ?? null,
        importance_note: a.importance_note ?? null,
      }))
    )

    if (error) {
      log.error('Annotation insert failed', {
        sessionId,
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      })
      throw new Error(`Failed to insert annotations: ${error.message}`)
    }
  }

  return kept.length
}
