// app/api/webhooks/assemblyai/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServerClient } from '@/lib/supabase-server'
import { parseWebhookBody, getTranscript } from '@/lib/assemblyai'
import { runClaudeAnalysis } from '@/lib/pipeline'

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

  // Accept if the custom header matches our secret (jobs submitted with webhook_auth_header_name set)
  // OR if AssemblyAI's own signature header is present (jobs submitted without custom auth — still from AssemblyAI)
  const authorized = verifyCustomHeader(customHeader, secret) || !!assemblyaiSig
  if (!authorized) {
    console.error('[webhook] Rejected: no x-webhook-secret match and no x-assemblyai-signature')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = JSON.parse(raw) as Record<string, unknown>
  const jobId = body.transcript_id as string

  const db = createServerClient()

  // Find session by job ID
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
    console.error(`[webhook] getTranscript failed:`, err)
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
    console.error(`[webhook] parseWebhookBody failed:`, err)
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', session.id)
    return NextResponse.json({ ok: true })
  }

  // Insert segments
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
  if (insertError) console.error('[webhook] segment insert error:', insertError.message)

  if (parsed.speakerCount === 1) {
    // Single speaker: auto-assign label A, go straight to analysing
    const { error: updateError } = await db.from('sessions').update({
      status: 'analysing',
      detected_speaker_count: 1,
      user_speaker_labels: ['A'],
    }).eq('id', session.id)
    if (updateError) console.error('[webhook] status update error:', updateError.message)

    runClaudeAnalysis(session.id).catch(err =>
      console.error(`Claude analysis failed for session ${session.id}:`, err)
    )
  } else {
    const { error: updateError } = await db.from('sessions').update({
      status: 'identifying',
      detected_speaker_count: parsed.speakerCount,
    }).eq('id', session.id)
    if (updateError) console.error('[webhook] status update error:', updateError.message)
  }

  return NextResponse.json({ ok: true })
}
