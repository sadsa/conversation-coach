// lib/dashboard-summary.ts
import { createServerClient } from '@/lib/supabase-server'

export interface DashboardSummary {
  /** Number of practice items the user has not yet marked as written down. */
  writeDownCount: number
}

export async function computeDashboardSummary(
  db: ReturnType<typeof createServerClient>,
  sessionIds: string[],
): Promise<DashboardSummary> {
  const { count } = await db
    .from('practice_items')
    .select('id', { count: 'exact', head: true })
    .in('session_id', sessionIds)
    .eq('written_down', false)

  return { writeDownCount: count ?? 0 }
}
