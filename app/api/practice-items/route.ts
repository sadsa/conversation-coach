// app/api/practice-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import type { PracticeItem, BoxSummary, LeitnerResponse } from '@/lib/types'

const PRACTICE_ITEMS_COLUMNS = [
  'id', 'session_id', 'annotation_id', 'type', 'sub_category', 'original',
  'correction', 'explanation', 'reviewed', 'written_down', 'created_at',
  'updated_at', 'flashcard_front', 'flashcard_back', 'flashcard_note',
  'leitner_box', 'leitner_due_date', 'importance_score', 'importance_note',
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
  if (url.searchParams.get('flashcards') === 'due') {
    return getDueFlashcards(db, sessionIds)
  }

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

async function getDueFlashcards(
  db: ReturnType<typeof createServerClient>,
  sessionIds: string[]
) {
  const today = new Date().toISOString().split('T')[0]

  // All eligible cards
  const { data: allCards, error } = await db
    .from('practice_items')
    .select(PRACTICE_ITEMS_COLUMNS)
    .in('session_id', sessionIds)
    .not('flashcard_front', 'is', null)
    .not('flashcard_back', 'is', null)
    .eq('written_down', true)
    .not('leitner_due_date', 'is', null)
    .order('leitner_box', { ascending: true })
    .order('leitner_due_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const cards = (allCards ?? []) as unknown as Array<PracticeItem>

  // Box overview
  const boxCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const card of cards) {
    if (card.leitner_box !== null) boxCounts[card.leitner_box] = (boxCounts[card.leitner_box] ?? 0) + 1
  }

  const dueCards = cards.filter(c => c.leitner_due_date !== null && c.leitner_due_date <= today)
  const activeBox = dueCards.length > 0 ? dueCards[0].leitner_box : null

  const boxes: BoxSummary[] = [1, 2, 3, 4, 5].map(box => ({
    box,
    count: boxCounts[box] ?? 0,
    due: dueCards.some(c => c.leitner_box === box),
  }))

  const activeCards = activeBox !== null ? dueCards.filter(c => c.leitner_box === activeBox) : []

  return NextResponse.json({ boxes, cards: activeCards, activeBox } satisfies LeitnerResponse)
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
