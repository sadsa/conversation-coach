// lib/dashboard-summary.ts
import { createServerClient } from '@/lib/supabase-server'

export interface DashboardSummary {
  writeDownCount: number
}

export async function computeDashboardSummary(
  db: ReturnType<typeof createServerClient>,
  sessionIds: string[],
): Promise<DashboardSummary> {
  const { data: notWritten } = await db
    .from('practice_items')
    .select('id')
    .in('session_id', sessionIds)
    .eq('written_down', false)
    .limit(1000)

  const writeDownCount = notWritten?.length ?? 0

  return { writeDownCount }
}
