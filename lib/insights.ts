import { createServerClient } from '@/lib/supabase-server'
import { SUB_CATEGORY_DISPLAY } from '@/lib/types'
import type { SubCategory } from '@/lib/types'

export type TrendResult = 'making-progress' | 'keep-practicing' | 'needs-attention'

/**
 * Compute trend for a single sub-category (errors — lower is better).
 * @param recentErrors   error count in recent sessions
 * @param recentTurns    user turn count in recent sessions
 * @param olderErrors    error count in older sessions
 * @param olderTurns     user turn count in older sessions
 */
export function computeTrend(
  recentErrors: number,
  recentTurns: number,
  olderErrors: number,
  olderTurns: number,
): TrendResult {
  const recentRate = recentTurns === 0 ? 0 : recentErrors / recentTurns
  const olderRate = olderTurns === 0 ? 0 : olderErrors / olderTurns

  if (recentRate === 0 && olderRate === 0) return 'keep-practicing'
  if (olderRate === 0 && recentRate > 0) return 'needs-attention'
  if (recentRate < olderRate * 0.8) return 'making-progress'
  if (recentRate > olderRate * 1.2) return 'needs-attention'
  return 'keep-practicing'
}

export interface FocusCard {
  subCategory: SubCategory
  type: 'grammar' | 'naturalness'
  displayName: string
  totalCount: number
  sessionCount: number
  trend: TrendResult | null  // null when < 4 sessions
  examples: ExampleAnnotation[]
}

export interface ExampleAnnotation {
  original: string
  correction: string | null
  startChar: number
  endChar: number
  segmentText: string
  sessionTitle: string
  sessionCreatedAt: string
}

export interface InsightsData {
  totalReadySessions: number
  focusCards: FocusCard[]
}

export async function fetchInsightsData(): Promise<InsightsData> {
  const db = createServerClient()

  // Total ready sessions
  const { count: totalReadySessions } = await db
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ready')

  const total = totalReadySessions ?? 0

  // Query 1: error counts
  const { data: errorCounts } = await db.rpc('get_subcategory_error_counts')

  // Query 2: per-session counts (for trend)
  const showTrends = total >= 4
  const trendMap: Map<string, TrendResult> = new Map()

  if (showTrends) {
    const { data: sessionCounts } = await db.rpc('get_subcategory_session_counts')

    if (sessionCounts && sessionCounts.length > 0) {
      // Identify the 3 most recent session IDs
      const allSessionIds = Array.from(new Set<string>((sessionCounts as { session_id: string }[]).map(r => r.session_id)))
      // Sessions are returned ordered by created_at DESC from the RPC
      const recentSessionIds = new Set(allSessionIds.slice(0, 3))

      // Group by sub_category
      const bySubCat = new Map<string, { recent: { errors: number; turns: number }; older: { errors: number; turns: number } }>()
      for (const row of sessionCounts as { sub_category: string; session_id: string; error_count: number; user_turn_count: number }[]) {
        if (!bySubCat.has(row.sub_category)) {
          bySubCat.set(row.sub_category, { recent: { errors: 0, turns: 0 }, older: { errors: 0, turns: 0 } })
        }
        const entry = bySubCat.get(row.sub_category)!
        const group = recentSessionIds.has(row.session_id) ? entry.recent : entry.older
        group.errors += Number(row.error_count)
        group.turns += Number(row.user_turn_count)
      }

      for (const [subCat, { recent, older }] of Array.from(bySubCat)) {
        trendMap.set(subCat, computeTrend(recent.errors, recent.turns, older.errors, older.turns))
      }
    }
  }

  // Query 3: examples
  const { data: examplesRaw } = await db.rpc('get_subcategory_examples')
  const examplesBySubCat = new Map<string, ExampleAnnotation[]>()
  for (const row of (examplesRaw ?? []) as {
    sub_category: string; original: string; correction: string | null;
    start_char: number; end_char: number; segment_text: string;
    session_title: string; session_created_at: string
  }[]) {
    if (!examplesBySubCat.has(row.sub_category)) examplesBySubCat.set(row.sub_category, [])
    examplesBySubCat.get(row.sub_category)!.push({
      original: row.original,
      correction: row.correction,
      startChar: row.start_char,
      endChar: row.end_char,
      segmentText: row.segment_text,
      sessionTitle: row.session_title,
      sessionCreatedAt: row.session_created_at,
    })
  }

  // Build focus cards
  const focusCards: FocusCard[] = (errorCounts ?? []).map((row: { sub_category: string; type: string; total_count: number; session_count: number }) => ({
    subCategory: row.sub_category as SubCategory,
    type: row.type as 'grammar' | 'naturalness',
    displayName: SUB_CATEGORY_DISPLAY[row.sub_category as SubCategory] ?? row.sub_category,
    totalCount: Number(row.total_count),
    sessionCount: Number(row.session_count),
    trend: showTrends ? (trendMap.get(row.sub_category) ?? 'keep-practicing') : null,
    examples: examplesBySubCat.get(row.sub_category) ?? [],
  }))

  return { totalReadySessions: total, focusCards }
}
