// app/api/webhooks/assemblyai/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServerClient } from '@/lib/supabase-server'
import { parseWebhookBody, WEBHOOK_AUTH_HEADER_NAME } from '@/lib/assemblyai'
import { runClaudeAnalysis } from '@/lib/pipeline'

function verifyWebhookSecret(headerValue: string | null, secret: string): boolean {
  if (!headerValue || !secret) return false
  const a = Buffer.from(headerValue, 'utf8')
  const b = Buffer.from(secret, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const headerValue = req.headers.get(WEBHOOK_AUTH_HEADER_NAME.toLowerCase())
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET ?? ''

  if (!verifyWebhookSecret(headerValue, secret)) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
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
    console.log(`Webhook: unknown job ID ${jobId} — discarding`)
    return NextResponse.json({ ok: true })
  }

  let parsed
  try {
    parsed = parseWebhookBody(body)
  } catch (_err) {
    await db.from('sessions').update({
      status: 'error',
      error_stage: 'transcribing',
    }).eq('id', session.id)
    return NextResponse.json({ ok: true })
  }

  // Insert segments
  await db.from('transcript_segments').insert(
    parsed.segments.map(s => ({
      session_id: session.id,
      speaker: s.speaker,
      text: s.text,
      start_ms: s.start_ms,
      end_ms: s.end_ms,
      position: s.position,
    }))
  )

  if (parsed.speakerCount === 1) {
    // Single speaker: auto-assign label A, go straight to analysing
    await db.from('sessions').update({
      status: 'analysing',
      detected_speaker_count: 1,
      user_speaker_label: 'A',
    }).eq('id', session.id)

    runClaudeAnalysis(session.id).catch(err =>
      console.error(`Claude analysis failed for session ${session.id}:`, err)
    )
  } else {
    await db.from('sessions').update({
      status: 'identifying',
      detected_speaker_count: parsed.speakerCount,
    }).eq('id', session.id)
  }

  return NextResponse.json({ ok: true })
}
