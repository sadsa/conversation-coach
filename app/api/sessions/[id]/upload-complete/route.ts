// app/api/sessions/[id]/upload-complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { createJob } from '@/lib/assemblyai'
import { publicUrl } from '@/lib/r2'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { duration_seconds, speakers_expected } = await req.json() as {
    duration_seconds?: number
    speakers_expected?: number
  }
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('audio_r2_key')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!session?.audio_r2_key) {
    return NextResponse.json({ error: 'No audio key found' }, { status: 400 })
  }

  const audioUrl = publicUrl(session.audio_r2_key)

  let jobId: string
  try {
    jobId = await createJob(audioUrl, speakers_expected ?? 2)
  } catch (err) {
    log.error('AssemblyAI job creation failed', { sessionId: params.id, err })
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', params.id)
    return NextResponse.json({ error: 'AssemblyAI job creation failed' }, { status: 500 })
  }

  log.info('AssemblyAI job created', { sessionId: params.id, jobId })

  await db.from('sessions').update({
    status: 'transcribing',
    assemblyai_job_id: jobId,
    ...(duration_seconds != null ? { duration_seconds } : {}),
  }).eq('id', params.id)

  return NextResponse.json({ ok: true })
}
