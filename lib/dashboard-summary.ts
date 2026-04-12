// lib/dashboard-summary.ts
import { createServerClient } from '@/lib/supabase-server'

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

  const { data: notWritten } = await db
    .from('practice_items')
    .select('id')
    .in('session_id', sessionIds)
    .eq('written_down', false)
    .limit(1000)

  const writeDownCount = notWritten?.length ?? 0

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
