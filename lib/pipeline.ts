// lib/pipeline.ts
import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import { sendPushNotification } from '@/lib/push'
import { log } from '@/lib/logger'
import type { TranscriptSegment, TargetLanguage } from '@/lib/types'
import { SUB_CATEGORIES, SUB_CATEGORY_TYPE_MAP } from '@/lib/types'
import type { ClaudeAnnotation } from '@/lib/claude'

export async function runClaudeAnalysis(sessionId: string, targetLanguage: TargetLanguage = 'es-AR'): Promise<void> {
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
    const result = await analyseUserTurns(userTurns, session.original_filename ?? null, sessionId, targetLanguage)
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
    let corrected = { ...a }

    // Correct character offsets if they don't match
    const segText = segmentTextById.get(a.segment_id)
    if (segText && segText.slice(corrected.start_char, corrected.end_char) !== corrected.original) {
      const idx = segText.indexOf(corrected.original)
      if (idx !== -1) {
        corrected = { ...corrected, start_char: idx, end_char: idx + corrected.original.length }
      }
    }

    // Validate sub_category: must be in taxonomy and match the annotation type
    const rawSubCat = corrected.sub_category
    const isValidKey = typeof rawSubCat === 'string' && (SUB_CATEGORIES as readonly string[]).includes(rawSubCat)
    const expectedType = isValidKey ? SUB_CATEGORY_TYPE_MAP[rawSubCat as keyof typeof SUB_CATEGORY_TYPE_MAP] : undefined
    const subCategory = (isValidKey && (expectedType === undefined || expectedType === corrected.type))
      ? rawSubCat
      : 'other'

    return { ...corrected, sub_category: subCategory }
  })

  // Safety net: drop any annotation Claude rated importance_score === 1.
  // The prompt forbids score=1 and the claude.ts validator now coerces it
  // to null, but enforce it here too so nothing slips through.
  // null scores are kept (no judgement available — rare case).
  const filteredAnnotations = correctedAnnotations.filter(a => a.importance_score !== 1)

  if (filteredAnnotations.length < correctedAnnotations.length) {
    log.info('Dropped low-importance annotations', {
      sessionId,
      dropped: correctedAnnotations.length - filteredAnnotations.length,
      kept: filteredAnnotations.length,
    })
  }

  if (filteredAnnotations.length > 0) {
    const { error: annotationError } = await db.from('annotations').insert(
      filteredAnnotations.map(a => ({
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
  await db.from('sessions').update({
    status: 'ready',
    title,
    processing_completed_at: new Date().toISOString(),
  }).eq('id', sessionId)

  await sendPushNotification(sessionId, title)
}
