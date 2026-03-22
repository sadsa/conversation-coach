// app/api/sessions/[id]/speaker/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json() as { speaker_labels?: ('A' | 'B')[] }
  const speaker_labels = body.speaker_labels

  if (!Array.isArray(speaker_labels) || speaker_labels.length === 0 ||
      !speaker_labels.every(l => l === 'A' || l === 'B')) {
    return NextResponse.json({ error: 'speaker_labels must be a non-empty array of A or B' }, { status: 400 })
  }
  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('status')
    .eq('id', params.id)
    .single()

  if (session?.status !== 'identifying') {
    return NextResponse.json({ error: 'Session is not awaiting speaker identification' }, { status: 409 })
  }

  await db.from('sessions').update({
    user_speaker_labels: speaker_labels,
    status: 'analysing',
  }).eq('id', params.id)

  log.info('Analysis triggered after speaker identification', { sessionId: params.id, speaker_labels })

  runClaudeAnalysis(params.id).catch(err =>
    log.error('Claude analysis failed (fire-and-forget)', { sessionId: params.id, err })
  )

  return NextResponse.json({ status: 'analysing' })
}
