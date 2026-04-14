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
    .select('id')
    .eq('user_id', user.id)

  const sessionIds = (userSessions ?? []).map((s: { id: string }) => s.id)
  if (sessionIds.length === 0) return NextResponse.json([])

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
  return NextResponse.json(data)
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
