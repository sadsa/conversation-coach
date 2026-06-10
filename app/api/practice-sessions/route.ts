// app/api/practice-sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyseUserTurns } from '@/lib/claude'
import { log } from '@/lib/logger'
import type { TranscriptTurn, TargetLanguage } from '@/lib/types'
import { persistAnnotations } from '@/lib/annotation-persistence'
import { transitionToReady, transitionToAnalysisError } from '@/lib/session-pipeline'

function formatSessionTitle(date: Date): string {
  return `Practice — ${date.getDate()} ${date.toLocaleString('en', { month: 'short' })}`
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { turns, targetLanguage, session_type, lesson_phrase } = await req.json() as {
    turns: TranscriptTurn[]
    targetLanguage: TargetLanguage
    session_type?: string
    lesson_phrase?: {
      correction: string
      explanation: string
      flashcard_front: string | null
      practice_item_id: string
    }
  }

  const validSessionTypes = ['voice_practice', 'lesson'] as const
  type ValidSessionType = typeof validSessionTypes[number]

  // Validate session_type — only 'voice_practice' and 'lesson' are accepted here.
  // 'upload' sessions go through a different route; fall back to 'voice_practice'
  // if an invalid value is sent.
  const resolvedSessionType: ValidSessionType =
    validSessionTypes.includes(session_type as ValidSessionType)
      ? (session_type as ValidSessionType)
      : 'voice_practice'

  const userTurns = turns.filter(t => t.role === 'user')
  if (userTurns.length === 0) {
    return NextResponse.json({ error: 'No user speech detected' }, { status: 400 })
  }

  const db = createServerClient()

  // Derive duration from wall-clock turn timestamps so the row carries the
  // same "5m 30s" affordance in SessionList that uploaded recordings do.
  // First → last turn span, plus a 3s tail to match how we extend the final
  // segment's end_ms below. Floor to whole seconds (the formatter expects int).
  const firstTurnMs = turns[0].wallMs
  const lastTurnMs = turns[turns.length - 1].wallMs
  const durationSeconds = Math.max(1, Math.floor((lastTurnMs - firstTurnMs + 3000) / 1000))

  // Create session row
  const { data: session, error: sessionError } = await db
    .from('sessions')
    .insert({
      title: formatSessionTitle(new Date()),
      status: 'analysing',
      session_type: resolvedSessionType,
      ...(lesson_phrase ? { lesson_phrase } : {}),
      user_id: user.id,
      user_speaker_labels: ['A'],
      duration_seconds: durationSeconds,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    log.error('Failed to create practice session', { error: sessionError?.message })
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  const sessionId = (session as { id: string }).id

  try {
    // Build segments from turns with wall-clock timestamps
    const sessionStartMs = turns[0].wallMs
    const segmentRows = turns.map((turn, i) => ({
      session_id: sessionId,
      speaker: turn.role === 'user' ? 'A' : 'B',
      text: turn.text,
      start_ms: turn.wallMs - sessionStartMs,
      end_ms: turns[i + 1]
        ? turns[i + 1].wallMs - sessionStartMs
        : (turn.wallMs - sessionStartMs) + 3000,
      position: i,
      paragraph_breaks: [],
    }))

    const { data: insertedSegments, error: segError } = await db
      .from('transcript_segments')
      .insert(segmentRows)
      .select('id, speaker, position')

    if (segError || !insertedSegments) {
      throw new Error(`Segment insert failed: ${segError?.message}`)
    }

    // Map user-speaker segment IDs for Claude
    const userSegments = (insertedSegments as Array<{ id: string; speaker: string; position: number }>)
      .filter(s => s.speaker === 'A')
    const userSegmentIdByPosition = new Map(
      userSegments.map(s => [s.position, s.id])
    )

    const claudeTurns = turns
      .map((turn, i) => ({ role: turn.role, text: turn.text, position: i }))
      .filter(t => t.role === 'user')
      .map(t => ({ id: userSegmentIdByPosition.get(t.position)!, text: t.text }))

    log.info('Practice session Claude analysis started', { sessionId, turnCount: claudeTurns.length })

    const { title, annotations } = await analyseUserTurns(claudeTurns, null, sessionId, targetLanguage)

    const annotationCount = await persistAnnotations(db, sessionId, annotations, claudeTurns)

    await transitionToReady(sessionId, { title })
    log.info('Practice session analysis complete', { sessionId, annotationCount })

    return NextResponse.json({ session_id: sessionId }, { status: 201 })

  } catch (err) {
    log.error('Practice session analysis failed', { sessionId, err })
    await transitionToAnalysisError(sessionId)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
