// app/api/practice-items/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { verifyOwnedSession } from '@/lib/ownership'

type RouteParams = { id: string } | Promise<{ id: string }>
type Params = { params: RouteParams }

async function getItemId(params: RouteParams): Promise<string> {
  const resolved = await params
  return resolved.id
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const itemId = await getItemId(params)
  const db = createServerClient()

  const { data: row } = await db
    .from('practice_items')
    .select('session_id, user_id, reviewed, fsrs_state, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, last_review')
    .eq('id', itemId)
    .single()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const currentItem = row as {
    session_id: string | null
    user_id: string | null
    reviewed: boolean
    fsrs_state: number | null
    due: string | null
    stability: number | null
    difficulty: number | null
    elapsed_days: number | null
    scheduled_days: number | null
    reps: number | null
    lapses: number | null
    last_review: string | null
  }

  // Manual items are scoped by user_id directly; annotation items via session.
  const owned = currentItem.session_id
    ? await verifyOwnedSession(db, currentItem.session_id, user.id)
    : currentItem.user_id === user.id
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as { reviewed?: boolean }
  const update: Record<string, unknown> = {}
  if (body.reviewed !== undefined) update.reviewed = body.reviewed

  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  if (body.reviewed === true) {
    const { fsrs, createEmptyCard, Rating } = await import('ts-fsrs')
    const now = new Date()

    const isRestudy = currentItem.reviewed && currentItem.stability != null
    const card = isRestudy
      ? {
          due: new Date(currentItem.due!),
          stability: currentItem.stability!,
          difficulty: currentItem.difficulty ?? 0,
          elapsed_days: currentItem.elapsed_days ?? 0,
          scheduled_days: currentItem.scheduled_days ?? 0,
          learning_steps: 0,
          reps: currentItem.reps ?? 0,
          lapses: currentItem.lapses ?? 0,
          state: (currentItem.fsrs_state ?? 0) as number,
          last_review: currentItem.last_review ? new Date(currentItem.last_review) : undefined,
        }
      : createEmptyCard()

    const f = fsrs()
    const { card: newCard } = f.next(card, now, Rating.Good)

    update.due = newCard.due.toISOString()
    update.stability = newCard.stability
    update.difficulty = newCard.difficulty
    update.elapsed_days = newCard.elapsed_days
    update.scheduled_days = newCard.scheduled_days
    update.reps = newCard.reps
    update.lapses = newCard.lapses
    update.fsrs_state = newCard.state
    update.last_review = now.toISOString()
  }

  const { error } = await db
    .from('practice_items')
    .update(update)
    .eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const itemId = await getItemId(params)
  const db = createServerClient()
  const { data: delRow } = await db
    .from('practice_items')
    .select('session_id, user_id')
    .eq('id', itemId)
    .single()

  if (!delRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const dr = delRow as { session_id: string | null; user_id: string | null }
  const owned = dr.session_id
    ? await verifyOwnedSession(db, dr.session_id, user.id)
    : dr.user_id === user.id
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await db
    .from('practice_items')
    .delete()
    .eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
