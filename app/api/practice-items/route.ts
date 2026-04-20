// app/api/practice-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

const PRACTICE_ITEMS_COLUMNS = [
  'id', 'session_id', 'annotation_id', 'type', 'sub_category', 'original',
  'correction', 'explanation', 'reviewed', 'written_down', 'created_at',
  'updated_at', 'flashcard_front', 'flashcard_back', 'flashcard_note',
  'importance_score', 'importance_note',
].join(', ')

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()

  const { data: userSessions } = await db
    .from('sessions')
    .select('id, title')
    .eq('user_id', user.id)

  type UserSession = { id: string; title: string | null }
  const userSessionRows = (userSessions ?? []) as UserSession[]
  const sessionIds = userSessionRows.map(s => s.id)
  if (sessionIds.length === 0) return NextResponse.json([])
  // Title lookup table — used to surface the session name in the WriteSheet
  // header so the user can jump back to the originating transcript.
  const sessionTitleMap = new Map(userSessionRows.map(s => [s.id, s.title]))

  const url = new URL(req.url)
  const sortParam = url.searchParams.get('sort')
  const orderCol = sortParam === 'importance' ? 'importance_score' : 'created_at'
  const orderOpts = sortParam === 'importance'
    ? { ascending: false, nullsFirst: false }
    : { ascending: false }

  const { data, error } = await db
    .from('practice_items')
    .select(PRACTICE_ITEMS_COLUMNS)
    .in('session_id', sessionIds)
    .order(orderCol, orderOpts)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type ItemRow = { annotation_id: string | null }
  const rows = (data ?? []) as unknown as ItemRow[]
  const annotationIds = rows
    .map(i => i.annotation_id)
    .filter(Boolean) as string[]

  type AnnRow = { id: string; segment_id: string; start_char: number; end_char: number }
  type SegRow = { id: string; text: string }
  let annotationMap = new Map<string, AnnRow>()
  let segmentTextMap = new Map<string, string>()

  if (annotationIds.length > 0) {
    const { data: annRows } = await db
      .from('annotations')
      .select('id, segment_id, start_char, end_char')
      .in('id', annotationIds)

    annotationMap = new Map((annRows ?? []).map((a: AnnRow) => [a.id, a]))

    const segmentIds = Array.from(new Set((annRows ?? []).map((a: AnnRow) => a.segment_id)))
    if (segmentIds.length > 0) {
      const { data: segRows } = await db
        .from('transcript_segments')
        .select('id, text')
        .in('id', segmentIds)

      segmentTextMap = new Map((segRows ?? []).map((s: SegRow) => [s.id, s.text]))
    }
  }

  type RowWithSession = ItemRow & { session_id: string }
  const enriched = (rows as RowWithSession[]).map((item) => {
    const session_title = sessionTitleMap.get(item.session_id) ?? null
    if (!item.annotation_id) {
      return { ...item, segment_text: null, start_char: null, end_char: null, session_title }
    }
    const ann = annotationMap.get(item.annotation_id)
    if (!ann) return { ...item, segment_text: null, start_char: null, end_char: null, session_title }
    return {
      ...item,
      segment_text: segmentTextMap.get(ann.segment_id) ?? null,
      start_char: ann.start_char,
      end_char: ann.end_char,
      session_title,
    }
  })

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('id')
    .eq('id', body.session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const { data, error } = await db
    .from('practice_items')
    .insert(body)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
