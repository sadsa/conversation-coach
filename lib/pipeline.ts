// lib/pipeline.ts
import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import type { TranscriptSegment } from '@/lib/types'

export async function runClaudeAnalysis(sessionId: string): Promise<void> {
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('user_speaker_labels, audio_r2_key')
    .eq('id', sessionId)
    .single()

  if (!session) throw new Error(`Session ${sessionId} not found`)

  const { data: segments } = await db
    .from('transcript_segments')
    .select('*')
    .eq('session_id', sessionId)
    .order('position')

  const userTurns = (segments ?? [])
    .filter((s: TranscriptSegment) => (session.user_speaker_labels ?? []).includes(s.speaker))
    .map((s: TranscriptSegment) => ({ id: s.id, text: s.text }))

  let annotations
  try {
    annotations = await analyseUserTurns(userTurns)
  } catch (err) {
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'analysing',
    }).eq('id', sessionId)
    throw err
  }

  // Write annotations and retrieve their IDs
  if (annotations.length > 0) {
    const { data: insertedAnnotations, error: annotationError } = await db.from('annotations').insert(
      annotations.map(a => ({
        session_id: sessionId,
        segment_id: a.segment_id,
        type: a.type,
        original: a.original,
        start_char: a.start_char,
        end_char: a.end_char,
        correction: a.correction,
        explanation: a.explanation,
      }))
    ).select('id')

    if (annotationError || !insertedAnnotations) {
      throw new Error(`Failed to insert annotations: ${annotationError?.message ?? 'no data returned'}`)
    }

    // Write practice items (denormalised copy) with annotation_id so re-analysis can delete them
    await db.from('practice_items').insert(
      annotations.map((a, i) => ({
        session_id: sessionId,
        annotation_id: insertedAnnotations[i]?.id ?? null,
        type: a.type,
        original: a.original,
        correction: a.correction,
        explanation: a.explanation,
      }))
    )
  }

  // Delete audio from R2
  if (session.audio_r2_key) {
    await deleteObject(session.audio_r2_key)
    await db.from('sessions').update({ audio_r2_key: null }).eq('id', sessionId)
  }

  await db.from('sessions').update({ status: 'ready' }).eq('id', sessionId)
}
