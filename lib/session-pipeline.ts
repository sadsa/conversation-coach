// lib/session-pipeline.ts
import { createServerClient } from '@/lib/supabase-server'
import type { ErrorStage } from '@/lib/types'

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'invalid_transition'; detail: string }

async function writeError(sessionId: string, errorStage: ErrorStage): Promise<TransitionResult> {
  const db = createServerClient()
  await db.from('sessions').update({ status: 'error', error_stage: errorStage }).eq('id', sessionId)
  return { ok: true }
}

export async function transitionToReady(
  sessionId: string,
  opts: { title: string },
): Promise<TransitionResult> {
  const db = createServerClient()
  const { data } = await db.from('sessions').select('id').eq('id', sessionId).single()
  if (!data) return { ok: false, reason: 'not_found', detail: `Session ${sessionId} not found` }

  await db.from('sessions').update({
    status: 'ready',
    title: opts.title,
    processing_completed_at: new Date().toISOString(),
  }).eq('id', sessionId)

  return { ok: true }
}

export async function transitionToTranscribing(
  sessionId: string,
  opts: { jobId: string; durationSeconds?: number },
): Promise<TransitionResult> {
  const db = createServerClient()
  await db.from('sessions').update({
    status: 'transcribing',
    assemblyai_job_id: opts.jobId,
    ...(opts.durationSeconds != null ? { duration_seconds: opts.durationSeconds } : {}),
  }).eq('id', sessionId)
  return { ok: true }
}

export async function transitionToTranscribingError(sessionId: string): Promise<TransitionResult> {
  return writeError(sessionId, 'transcribing')
}

export async function transitionToAnalysing(sessionId: string): Promise<TransitionResult> {
  const db = createServerClient()
  await db.from('sessions').update({
    status: 'analysing',
    detected_speaker_count: 1,
    user_speaker_labels: ['A'],
  }).eq('id', sessionId)
  return { ok: true }
}

export async function transitionToIdentifying(
  sessionId: string,
  opts: { speakerCount: number },
): Promise<TransitionResult> {
  const db = createServerClient()
  await db.from('sessions').update({
    status: 'identifying',
    detected_speaker_count: opts.speakerCount,
  }).eq('id', sessionId)
  return { ok: true }
}

export async function transitionFromIdentifyingToAnalysing(
  sessionId: string,
  opts: { userSpeakerLabels: ('A' | 'B')[] },
): Promise<TransitionResult> {
  const db = createServerClient()
  const { data } = await db.from('sessions').select('status').eq('id', sessionId).single()
  if (!data) return { ok: false, reason: 'not_found', detail: `Session ${sessionId} not found` }
  if (data.status !== 'identifying') {
    return { ok: false, reason: 'invalid_transition', detail: `Expected status identifying, got ${data.status}` }
  }
  await db.from('sessions').update({
    status: 'analysing',
    user_speaker_labels: opts.userSpeakerLabels,
  }).eq('id', sessionId)
  return { ok: true }
}

export async function transitionToReanalysing(sessionId: string): Promise<TransitionResult> {
  const db = createServerClient()
  const { data } = await db.from('sessions').select('status, error_stage').eq('id', sessionId).single()
  if (!data) return { ok: false, reason: 'not_found', detail: `Session ${sessionId} not found` }

  if (data.status === 'analysing') {
    return { ok: false, reason: 'invalid_transition', detail: 'Analysis already in progress' }
  }
  if (data.error_stage === 'uploading' || data.error_stage === 'transcribing') {
    return { ok: false, reason: 'invalid_transition', detail: 'No transcript available to analyse' }
  }
  if (data.status !== 'ready' && data.error_stage !== 'analysing') {
    return { ok: false, reason: 'invalid_transition', detail: `Session not in analysable state (status: ${data.status})` }
  }

  await db.from('sessions').update({ status: 'analysing', error_stage: null }).eq('id', sessionId)
  return { ok: true }
}

export async function transitionToAnalysisError(sessionId: string): Promise<TransitionResult> {
  return writeError(sessionId, 'analysing')
}

export async function transitionRetryToUploading(
  sessionId: string,
  opts: { audioR2Key: string },
): Promise<TransitionResult> {
  const db = createServerClient()
  await db.from('sessions').update({
    status: 'uploading',
    error_stage: null,
    audio_r2_key: opts.audioR2Key,
  }).eq('id', sessionId)
  return { ok: true }
}

export async function transitionRetryToTranscribing(
  sessionId: string,
  opts: { jobId: string },
): Promise<TransitionResult> {
  const db = createServerClient()
  await db.from('sessions').update({
    status: 'transcribing',
    error_stage: null,
    assemblyai_job_id: opts.jobId,
  }).eq('id', sessionId)
  return { ok: true }
}
