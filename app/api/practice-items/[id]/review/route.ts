// app/api/practice-items/[id]/review/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { createEmptyCard, fsrs, generatorParameters, Rating, State, Grade, type Card } from 'ts-fsrs'

type Params = { params: { id: string } }

const VALID_RATINGS = new Set([Rating.Again, Rating.Good]) // 1 and 3

const STATE_MAP: Record<string, State> = {
  New: State.New,
  Learning: State.Learning,
  Review: State.Review,
  Relearning: State.Relearning,
}

const STATE_NAMES: Record<State, string> = {
  [State.New]: 'New',
  [State.Learning]: 'Learning',
  [State.Review]: 'Review',
  [State.Relearning]: 'Relearning',
}

async function verifyOwnership(
  db: ReturnType<typeof createServerClient>,
  itemId: string,
  userId: string
) {
  const { data: item } = await db
    .from('practice_items')
    .select('session_id, fsrs_state, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review')
    .eq('id', itemId)
    .single()

  if (!item) return null

  const { data: session } = await db
    .from('sessions')
    .select('id')
    .eq('id', item.session_id)
    .eq('user_id', userId)
    .single()

  if (!session) return null
  return item
}

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { rating?: number }
  if (body.rating === undefined || !VALID_RATINGS.has(body.rating as Rating)) {
    return NextResponse.json({ error: 'rating must be 1 (Again) or 3 (Good)' }, { status: 400 })
  }

  const rating = body.rating as Grade
  const db = createServerClient()
  const item = await verifyOwnership(db, params.id, user.id)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Build FSRS card from stored state (or create empty for new cards)
  const card: Card = item.fsrs_state === null
    ? createEmptyCard()
    : {
        due: new Date(item.due),
        stability: item.stability,
        difficulty: item.difficulty,
        elapsed_days: item.elapsed_days,
        scheduled_days: item.scheduled_days,
        reps: item.reps,
        lapses: item.lapses,
        state: STATE_MAP[item.fsrs_state],
        last_review: item.last_review ? new Date(item.last_review) : undefined,
      } as Card

  // No intra-day learning steps — cards graduate immediately to Review state
  // with a 1-day interval. Suits a casual 15-min daily habit rather than
  // intensive Anki-style sessions where cards reappear every few minutes.
  const f = fsrs(generatorParameters({ enable_fuzz: false, learning_steps: [], relearning_steps: [] }))
  const now = new Date()
  const { card: next } = f.next(card, now, rating)

  const { error } = await db
    .from('practice_items')
    .update({
      fsrs_state: STATE_NAMES[next.state],
      due: next.due.toISOString(),
      stability: next.stability,
      difficulty: next.difficulty,
      elapsed_days: next.elapsed_days,
      scheduled_days: next.scheduled_days,
      reps: next.reps,
      lapses: next.lapses,
      last_review: next.last_review ? (next.last_review as Date).toISOString() : now.toISOString(),
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
