// app/api/sessions/[id]/speaker/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { log } from '@/lib/logger'
import type { TargetLanguage } from '@/lib/types'

export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    .eq('user_id', user.id)
    .single()

  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (session.status !== 'identifying') {
    return NextResponse.json({ error: 'Session is not awaiting speaker identification' }, { status: 409 })
  }

  await db.from('sessions').update({
    user_speaker_labels: speaker_labels,
    status: 'analysing',
  }).eq('id', params.id).eq('user_id', user.id)

  const targetLanguage = (user.user_metadata?.target_language as TargetLanguage) ?? 'es-AR'
  log.info('Analysis triggered after speaker identification', { sessionId: params.id, speaker_labels, targetLanguage })

  waitUntil(runClaudeAnalysis(params.id, targetLanguage).catch(err =>
    log.error('Claude analysis failed (fire-and-forget)', { sessionId: params.id, err })
  ))

  return NextResponse.json({ status: 'analysing' })
}
