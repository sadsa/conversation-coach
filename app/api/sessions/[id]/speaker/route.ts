// app/api/sessions/[id]/speaker/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { runClaudeAnalysis } from '@/lib/pipeline'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { speaker_label } = await req.json() as { speaker_label?: 'A' | 'B' }

  if (speaker_label !== 'A' && speaker_label !== 'B') {
    return NextResponse.json({ error: 'speaker_label must be A or B' }, { status: 400 })
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
    user_speaker_label: speaker_label,
    status: 'analysing',
  }).eq('id', params.id)

  // Fire-and-forget: run Claude analysis in background
  runClaudeAnalysis(params.id).catch(err =>
    console.error(`Claude analysis failed for session ${params.id}:`, err)
  )

  return NextResponse.json({ status: 'analysing' })
}
