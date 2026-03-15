// app/api/sessions/[id]/retry/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createJob, cancelJob } from '@/lib/assemblyai'
import { presignedUploadUrl, publicUrl, deleteObject } from '@/lib/r2'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('error_stage, audio_r2_key, assemblyai_job_id')
    .eq('id', params.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.error_stage === 'uploading') {
    // Delete old R2 object if exists
    if (session.audio_r2_key) await deleteObject(session.audio_r2_key)

    // Generate new presigned URL
    const ext = session.audio_r2_key?.split('.').pop() ?? 'mp3'
    const { key, url } = await presignedUploadUrl(ext)

    await db.from('sessions').update({
      status: 'uploading',
      error_stage: null,
      audio_r2_key: key,
    }).eq('id', params.id)

    return NextResponse.json({ upload_url: url })
  }

  if (session.error_stage === 'transcribing') {
    // Cancel stale job if exists (best-effort)
    if (session.assemblyai_job_id) {
      try { await cancelJob(session.assemblyai_job_id) } catch {
        console.error(`Failed to cancel stale job ${session.assemblyai_job_id}`)
      }
    }

    // Re-trigger AssemblyAI with existing audio
    if (!session.audio_r2_key) {
      return NextResponse.json({ error: 'No audio to retry' }, { status: 400 })
    }
    const audioUrl = publicUrl(session.audio_r2_key)
    const jobId = await createJob(audioUrl)

    await db.from('sessions').update({
      status: 'transcribing',
      error_stage: null,
      assemblyai_job_id: jobId,
    }).eq('id', params.id)

    return NextResponse.json({ status: 'transcribing' })
  }

  return NextResponse.json(
    { error: 'Use /analyse to retry Claude analysis' },
    { status: 400 }
  )
}
