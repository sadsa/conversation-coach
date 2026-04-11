// app/api/dashboard-summary/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

export interface DashboardSummary {
  dueCount: number
  writeDownCount: number
  nextReviewAt: string | null
}

export async function computeDashboardSummary(
  db: ReturnType<typeof createServerClient>,
  sessionIds: string[]
): Promise<DashboardSummary> {
  const now = new Date().toISOString()

  // dueCount: new cards (fsrs_state IS NULL) + due reviews (due <= now)
  // Both must have written_down=true and flashcard_front IS NOT NULL and flashcard_back IS NOT NULL
  const { data: newCards } = await db
    .from('practice_items')
    .select('id')
    .in('session_id', sessionIds)
    .not('flashcard_front', 'is', null)
    .not('flashcard_back', 'is', null)
    .eq('written_down', true)
    .is('fsrs_state', null)
    .limit(1000)

  const { data: dueCards } = await db
    .from('practice_items')
    .select('id')
    .in('session_id', sessionIds)
    .not('flashcard_front', 'is', null)
    .not('flashcard_back', 'is', null)
    .eq('written_down', true)
    .not('fsrs_state', 'is', null)
    .lte('due', now)
    .limit(1000)

  const dueCount = (newCards?.length ?? 0) + (dueCards?.length ?? 0)

  // writeDownCount: items not yet written down
  const { data: notWritten } = await db
    .from('practice_items')
    .select('id')
    .in('session_id', sessionIds)
    .eq('written_down', false)
    .limit(1000)

  const writeDownCount = notWritten?.length ?? 0

  // nextReviewAt: earliest future due date
  const { data: nextCards } = await db
    .from('practice_items')
    .select('due')
    .in('session_id', sessionIds)
    .not('flashcard_front', 'is', null)
    .eq('written_down', true)
    .not('fsrs_state', 'is', null)
    .gt('due', now)
    .order('due', { ascending: true })
    .limit(1)

  const nextReviewAt = nextCards?.[0]?.due ?? null

  return { dueCount, writeDownCount, nextReviewAt }
}

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()

  const { data: userSessions } = await db
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)

  const sessionIds = (userSessions ?? []).map((s: { id: string }) => s.id)
  if (sessionIds.length === 0) {
    return NextResponse.json({ dueCount: 0, writeDownCount: 0, nextReviewAt: null })
  }

  const summary = await computeDashboardSummary(db, sessionIds)
  return NextResponse.json(summary)
}
