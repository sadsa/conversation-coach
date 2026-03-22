// app/api/sessions/[id]/analyse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { log } from '@/lib/logger'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('status, error_stage')
    .eq('id', params.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.status === 'analysing') {
    return NextResponse.json({ error: 'Analysis already in progress' }, { status: 409 })
  }

  if (session.error_stage === 'uploading' || session.error_stage === 'transcribing') {
    return NextResponse.json({ error: 'No transcript available to analyse' }, { status: 400 })
  }

  if (session.status !== 'ready' && session.error_stage !== 'analysing') {
    return NextResponse.json({ error: 'Session not in analysable state' }, { status: 400 })
  }

  await db.from('annotations').delete().eq('session_id', params.id)

  await db.from('sessions').update({
    status: 'analysing',
    error_stage: null,
  }).eq('id', params.id)

  log.info('Re-analysis triggered', { sessionId: params.id })

  runClaudeAnalysis(params.id).catch(err =>
    log.error('Re-analysis failed (fire-and-forget)', { sessionId: params.id, err })
  )

  return NextResponse.json({ status: 'analysing' })
}
