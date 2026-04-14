// lib/dashboard-summary.ts
import { createServerClient } from '@/lib/supabase-server'

export interface DashboardSummary {
  leitnerDue: boolean
  dueBoxes: number[]
  nextDueDate: string | null  // YYYY-MM-DD
  writeDownCount: number
}

export async function computeDashboardSummary(
  db: ReturnType<typeof createServerClient>,
  sessionIds: string[],
  today: string = new Date().toISOString().split('T')[0]
): Promise<DashboardSummary> {
  // Fetch all eligible leitner cards with their box + due date
  const { data: leitnerCards } = await db
    .from('practice_items')
    .select('leitner_box, leitner_due_date')
    .in('session_id', sessionIds)
    .not('flashcard_front', 'is', null)
    .not('flashcard_back', 'is', null)
    .eq('written_down', true)
    .not('leitner_due_date', 'is', null)
    .limit(1000)

  const cards = (leitnerCards ?? []) as Array<{ leitner_box: number; leitner_due_date: string }>

  const dueBoxes = [...new Set(
    cards
      .filter(c => c.leitner_due_date <= today)
      .map(c => c.leitner_box)
  )].sort((a, b) => a - b)

  const futureDates = cards
    .filter(c => c.leitner_due_date > today)
    .map(c => c.leitner_due_date)
    .sort()

  const nextDueDate = futureDates[0] ?? null

  const { data: notWritten } = await db
    .from('practice_items')
    .select('id')
    .in('session_id', sessionIds)
    .eq('written_down', false)
    .limit(1000)

  const writeDownCount = notWritten?.length ?? 0

  return {
    leitnerDue: dueBoxes.length > 0,
    dueBoxes,
    nextDueDate,
    writeDownCount,
  }
}
