// app/api/practice-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

const PRACTICE_ITEMS_COLUMNS = [
  'id', 'session_id', 'annotation_id', 'type', 'sub_category', 'original',
  'correction', 'explanation', 'reviewed', 'written_down', 'created_at',
  'updated_at', 'flashcard_front', 'flashcard_back', 'flashcard_note',
  'fsrs_state', 'due', 'stability', 'difficulty', 'elapsed_days',
  'scheduled_days', 'reps', 'lapses', 'last_review',
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

  const { data, error } = await db
    .from('practice_items')
    .select(PRACTICE_ITEMS_COLUMNS)
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

async function getDueFlashcards(
  db: ReturnType<typeof createServerClient>,
  sessionIds: string[]
) {
  // Fetch all practice_items sub_category to compute weakness score
  const { data: allItems, error: allError } = await db
    .from('practice_items')
    .select('sub_category')
    .in('session_id', sessionIds)

  if (allError) return NextResponse.json({ error: allError.message }, { status: 500 })

  const weaknessScore: Record<string, number> = {}
  for (const item of allItems ?? []) {
    weaknessScore[item.sub_category] = (weaknessScore[item.sub_category] ?? 0) + 1
  }

  const now = new Date().toISOString()

  // New cards: eligible + never reviewed
  const { data: newCards, error: newError } = await db
    .from('practice_items')
    .select(PRACTICE_ITEMS_COLUMNS)
    .in('session_id', sessionIds)
    .not('flashcard_front', 'is', null)
    .not('flashcard_back', 'is', null)
    .eq('written_down', true)
    .is('fsrs_state', null)

  if (newError) return NextResponse.json({ error: newError.message }, { status: 500 })

  // Due reviews: eligible + previously reviewed + due now or overdue
  const { data: dueReviews, error: dueError } = await db
    .from('practice_items')
    .select(PRACTICE_ITEMS_COLUMNS)
    .in('session_id', sessionIds)
    .not('flashcard_front', 'is', null)
    .not('flashcard_back', 'is', null)
    .eq('written_down', true)
    .not('fsrs_state', 'is', null)
    .lte('due', now)

  if (dueError) return NextResponse.json({ error: dueError.message }, { status: 500 })

  const byWeakness = (a: { sub_category: string }, b: { sub_category: string }) =>
    (weaknessScore[b.sub_category] ?? 0) - (weaknessScore[a.sub_category] ?? 0)

  const sortedNew = (newCards ?? []).sort(byWeakness)
  const sortedDue = (dueReviews ?? []).sort((a, b) => {
    const w = byWeakness(a, b)
    return w !== 0 ? w : new Date(a.due).getTime() - new Date(b.due).getTime()
  })

  return NextResponse.json([...sortedNew, ...sortedDue])
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
