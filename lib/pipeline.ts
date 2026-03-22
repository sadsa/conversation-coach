// lib/pipeline.ts
import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import type { TranscriptSegment } from '@/lib/types'
import { SUB_CATEGORIES, SUB_CATEGORY_TYPE_MAP } from '@/lib/types'
import type { ClaudeAnnotation } from '@/lib/claude'

export async function runClaudeAnalysis(sessionId: string): Promise<void> {
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('user_speaker_labels, audio_r2_key, original_filename')
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

  let annotations: ClaudeAnnotation[] = []
  let title = 'Untitled'
  try {
    const result = await analyseUserTurns(userTurns, session.original_filename ?? null)
    annotations = result.annotations
    title = result.title
  } catch (err) {
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
        sub_category: a.sub_category,
      }))
    )

    if (annotationError) {
      throw new Error(`Failed to insert annotations: ${annotationError.message}`)
    }
  }

  // Delete audio from R2
  if (session.audio_r2_key) {
    await deleteObject(session.audio_r2_key)
    await db.from('sessions').update({ audio_r2_key: null }).eq('id', sessionId)
  }

  await db.from('sessions').update({ status: 'ready', title }).eq('id', sessionId)
}
