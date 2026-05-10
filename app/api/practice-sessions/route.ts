// app/api/practice-sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { analyseUserTurns } from '@/lib/claude'
import { log } from '@/lib/logger'
import { SUB_CATEGORIES, SUB_CATEGORY_TYPE_MAP } from '@/lib/types'
import type { TranscriptTurn, TargetLanguage } from '@/lib/types'

function formatSessionTitle(date: Date): string {
  return `Practice — ${date.getDate()} ${date.toLocaleString('en', { month: 'short' })}`
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { turns, targetLanguage } = await req.json() as {
    turns: TranscriptTurn[]
    targetLanguage: TargetLanguage
  }

  const userTurns = turns.filter(t => t.role === 'user')
  if (userTurns.length === 0) {
    return NextResponse.json({ error: 'No user speech detected' }, { status: 400 })
  }

  const db = createServerClient()

  // Create session row
  const { data: session, error: sessionError } = await db
    .from('sessions')
    .insert({
      title: formatSessionTitle(new Date()),
      status: 'analysing',
      session_type: 'voice_practice',
      user_id: user.id,
      user_speaker_labels: ['A'],
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

    // Offset validation + sub_category normalization (mirrors pipeline.ts)
    const segmentTextById = new Map(claudeTurns.map(t => [t.id, t.text]))

    const correctedAnnotations = annotations.map(a => {
      let corrected = { ...a }
      const segText = segmentTextById.get(a.segment_id)
      if (segText && segText.slice(corrected.start_char, corrected.end_char) !== corrected.original) {
        const idx = segText.indexOf(corrected.original)
        if (idx !== -1) {
          corrected = { ...corrected, start_char: idx, end_char: idx + corrected.original.length }
        }
      }
      const rawSubCat = corrected.sub_category
      const isValidKey = typeof rawSubCat === 'string' && (SUB_CATEGORIES as readonly string[]).includes(rawSubCat)
      const expectedType = isValidKey ? SUB_CATEGORY_TYPE_MAP[rawSubCat as keyof typeof SUB_CATEGORY_TYPE_MAP] : undefined
      const subCategory = (isValidKey && (expectedType === undefined || expectedType === corrected.type))
        ? rawSubCat
        : 'other'
      return { ...corrected, sub_category: subCategory }
    })

    if (correctedAnnotations.length > 0) {
      const { error: annError } = await db.from('annotations').insert(
        correctedAnnotations.map(a => ({
          session_id: sessionId,
          segment_id: a.segment_id,
          type: a.type,
          original: a.original,
          start_char: a.start_char,
          end_char: a.end_char,
          correction: a.correction,
          explanation: a.explanation,
          sub_category: a.sub_category,
          flashcard_front: a.flashcard_front ?? null,
          flashcard_back: a.flashcard_back ?? null,
          flashcard_note: a.flashcard_note ?? null,
          importance_score: a.importance_score ?? null,
          importance_note: a.importance_note ?? null,
        }))
      )
      if (annError) throw new Error(`Annotation insert failed: ${annError.message}`)
    }

    await db.from('sessions').update({ status: 'ready', title, processing_completed_at: new Date().toISOString() }).eq('id', sessionId)
    log.info('Practice session analysis complete', { sessionId, annotationCount: correctedAnnotations.length })

    return NextResponse.json({ session_id: sessionId }, { status: 201 })

  } catch (err) {
    log.error('Practice session analysis failed', { sessionId, err })
    await db.from('sessions').update({ status: 'error', error_stage: 'analysing' }).eq('id', sessionId)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
