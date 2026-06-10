// app/api/sessions/[id]/retry/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { getOwnedSession } from '@/lib/ownership'
import { createJob, cancelJob } from '@/lib/assemblyai'
import { presignedUploadUrl, publicUrl, deleteObject } from '@/lib/r2'
import { log } from '@/lib/logger'
import { transitionRetryToUploading, transitionRetryToTranscribing } from '@/lib/session-pipeline'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const session = await getOwnedSession<{
    error_stage: string | null
    audio_r2_key: string | null
    assemblyai_job_id: string | null
  }>(db, params.id, user.id, 'error_stage, audio_r2_key, assemblyai_job_id')

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  log.info('Retry attempted', { sessionId: params.id, stage: session.error_stage })

  if (session.error_stage === 'uploading') {
    if (session.audio_r2_key) await deleteObject(session.audio_r2_key)

    const ext = session.audio_r2_key?.split('.').pop() ?? 'mp3'
    const { key, url } = await presignedUploadUrl(ext)

    await transitionRetryToUploading(params.id, { audioR2Key: key })

    return NextResponse.json({ upload_url: url })
  }

  if (session.error_stage === 'transcribing') {
    if (session.assemblyai_job_id) {
      try { await cancelJob(session.assemblyai_job_id) } catch (err) {
        log.error('Failed to cancel stale job', { sessionId: params.id, jobId: session.assemblyai_job_id, err })
      }
    }

    if (!session.audio_r2_key) {
      return NextResponse.json({ error: 'No audio to retry' }, { status: 400 })
    }
    const audioUrl = publicUrl(session.audio_r2_key)
    const jobId = await createJob(audioUrl)

    await transitionRetryToTranscribing(params.id, { jobId })

    return NextResponse.json({ status: 'transcribing' })
  }

  return NextResponse.json(
    { error: 'Use /analyse to retry Claude analysis' },
    { status: 400 }
  )
}
