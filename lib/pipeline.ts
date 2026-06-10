// lib/pipeline.ts
import { createServerClient } from '@/lib/supabase-server'
import { analyseUserTurns } from '@/lib/claude'
import { deleteObject } from '@/lib/r2'
import { sendPushNotification } from '@/lib/push'
import { log } from '@/lib/logger'
import type { TranscriptSegment, TargetLanguage } from '@/lib/types'
import { persistAnnotations } from '@/lib/annotation-persistence'
import type { ClaudeAnnotation } from '@/lib/claude'
import { transitionToReady, transitionToAnalysisError } from '@/lib/session-pipeline'

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
    await transitionToAnalysisError(sessionId)
    throw err
  }

  const annotationCount = await persistAnnotations(db, sessionId, annotations, userTurns)

  // Delete audio from R2
  if (session.audio_r2_key) {
    await deleteObject(session.audio_r2_key)
    await db.from('sessions').update({ audio_r2_key: null }).eq('id', sessionId)
  }

  log.info('Claude analysis complete', { sessionId, annotationCount })
  await transitionToReady(sessionId, { title })

  await sendPushNotification(sessionId, title)
}
