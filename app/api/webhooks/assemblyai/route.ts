// app/api/webhooks/assemblyai/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServerClient } from '@/lib/supabase-server'
import { parseWebhookBody, getTranscript } from '@/lib/assemblyai'
import { runClaudeAnalysis } from '@/lib/pipeline'
import { log } from '@/lib/logger'

/** Verify webhook using the custom shared-secret header (set on the transcript job at submit time). */
function verifyCustomHeader(headerValue: string | null, secret: string): boolean {
  if (!headerValue || !secret) return false
  const a = Buffer.from(headerValue, 'utf8')
  const b = Buffer.from(secret, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const customHeader = req.headers.get('x-webhook-secret')
  const assemblyaiSig = req.headers.get('x-assemblyai-signature')
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET ?? ''

  const authorized = verifyCustomHeader(customHeader, secret) || !!assemblyaiSig
  if (!authorized) {
    log.warn('Webhook rejected: missing valid auth header')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = JSON.parse(raw) as Record<string, unknown>
  const jobId = body.transcript_id as string

  log.info('Webhook received', { jobId })

  const db = createServerClient()

  const { data: session, error } = await db
    .from('sessions')
    .select('id')
    .eq('assemblyai_job_id', jobId)
    .single()

  if (error || !session) {
    return NextResponse.json({ ok: true })
  }

  let fullTranscript: Record<string, unknown>
  try {
    fullTranscript = await getTranscript(jobId)
  } catch (err) {
    log.error('getTranscript failed', { sessionId: session.id, jobId, err })
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', session.id)
    return NextResponse.json({ ok: true })
  }

  let parsed
  try {
    parsed = parseWebhookBody(fullTranscript)
  } catch (err) {
    log.error('parseWebhookBody failed', { sessionId: session.id, jobId, err })
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', session.id)
    return NextResponse.json({ ok: true })
  }

  const { error: insertError } = await db.from('transcript_segments').insert(
    parsed.segments.map(s => ({
      session_id: session.id,
      speaker: s.speaker,
      text: s.text,
      start_ms: s.start_ms,
      end_ms: s.end_ms,
      position: s.position,
    }))
  )
  if (insertError) log.error('Segment insert failed', { sessionId: session.id, error: insertError.message })

  log.info('Speaker count determined', { sessionId: session.id, speakerCount: parsed.speakerCount })

  if (parsed.speakerCount === 1) {
    const { error: updateError } = await db.from('sessions').update({
      status: 'analysing',
      detected_speaker_count: 1,
      user_speaker_labels: ['A'],
    }).eq('id', session.id)
    if (updateError) log.error('Status update failed', { sessionId: session.id, error: updateError.message })

    runClaudeAnalysis(session.id).catch(err =>
      log.error('Claude analysis failed (fire-and-forget)', { sessionId: session.id, err })
    )
  } else {
    const { error: updateError } = await db.from('sessions').update({
      status: 'identifying',
      detected_speaker_count: parsed.speakerCount,
    }).eq('id', session.id)
    if (updateError) log.error('Status update failed', { sessionId: session.id, error: updateError.message })
  }

  return NextResponse.json({ ok: true })
}
