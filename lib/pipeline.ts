// lib/pipeline.ts
import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import { log } from '@/lib/logger'
import type { TranscriptSegment } from '@/lib/types'
import type { ClaudeAnnotation } from '@/lib/claude'

export async function runClaudeAnalysis(sessionId: string): Promise<void> {
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('user_speaker_labels, audio_r2_key, original_filename')
    .eq('id', sessionId)
    .single()

  if (!session) {
    log.error('Session not found', { sessionId })
    throw new Error(`Session ${sessionId} not found`)
  }

  const { data: segments } = await db
    .from('transcript_segments')
    .select('*')
    .eq('session_id', sessionId)
    .order('position')

  const userTurns = (segments ?? [])
    .filter((s: TranscriptSegment) => (session.user_speaker_labels ?? []).includes(s.speaker))
    .map((s: TranscriptSegment) => ({ id: s.id, text: s.text }))

  log.info('Claude analysis started', { sessionId, turnCount: userTurns.length })

  let annotations: ClaudeAnnotation[] = []
  let title = 'Untitled'
  try {
    const result = await analyseUserTurns(userTurns, session.original_filename ?? null)
    annotations = result.annotations
    title = result.title
  } catch (err) {
    log.error('Claude analysis failed', { sessionId, err })
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'analysing',
    }).eq('id', sessionId)
    throw err
  }

  // Build a map so we can validate/correct character offsets from Claude
  const segmentTextById = new Map(userTurns.map(t => [t.id, t.text]))

  const correctedAnnotations = annotations.map(a => {
    const segText = segmentTextById.get(a.segment_id)
    if (!segText) return a
    if (segText.slice(a.start_char, a.end_char) !== a.original) {
      const idx = segText.indexOf(a.original)
      if (idx !== -1) {
        return { ...a, start_char: idx, end_char: idx + a.original.length }
      }
    }
    return a
  })

  if (correctedAnnotations.length > 0) {
    const { error: annotationError } = await db.from('annotations').insert(
      correctedAnnotations.map(a => ({
        session_id: sessionId,
        segment_id: a.segment_id,
        type: a.type,
        original: a.original,
        start_char: a.start_char,
        end_char: a.end_char,
        correction: a.correction,
        explanation: a.explanation,
      }))
    )

    if (annotationError) {
      log.error('Annotation insert failed', {
        sessionId,
        error: annotationError.message,
        code: annotationError.code,
        details: annotationError.details,
        hint: annotationError.hint,
      })
      throw new Error(`Failed to insert annotations: ${annotationError.message}`)
    }
  }

  // Delete audio from R2
  if (session.audio_r2_key) {
    await deleteObject(session.audio_r2_key)
    await db.from('sessions').update({ audio_r2_key: null }).eq('id', sessionId)
  }

  log.info('Claude analysis complete', { sessionId, annotationCount: correctedAnnotations.length })
  await db.from('sessions').update({ status: 'ready', title }).eq('id', sessionId)
}
