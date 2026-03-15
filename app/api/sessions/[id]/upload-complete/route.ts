// app/api/sessions/[id]/upload-complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { createJob } from '@/lib/assemblyai'
import { publicUrl } from '@/lib/r2'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { duration_seconds } = await req.json() as { duration_seconds?: number }
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('audio_r2_key')
    .eq('id', params.id)
    .single()

  if (!session?.audio_r2_key) {
    return NextResponse.json({ error: 'No audio key found' }, { status: 400 })
  }

  const audioUrl = publicUrl(session.audio_r2_key)

  let jobId: string
  try {
    jobId = await createJob(audioUrl)
  } catch (err) {
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', params.id)
    return NextResponse.json({ error: 'AssemblyAI job creation failed' }, { status: 500 })
  }

  await db.from('sessions').update({
    status: 'transcribing',
    assemblyai_job_id: jobId,
    ...(duration_seconds != null ? { duration_seconds } : {}),
  }).eq('id', params.id)

  return NextResponse.json({ ok: true })
}
