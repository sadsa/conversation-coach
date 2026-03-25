import { createServerClient } from '@/lib/supabase-server'
import { SUB_CATEGORY_DISPLAY } from '@/lib/types'
import type { SubCategory } from '@/lib/types'

export interface FocusCard {
  subCategory: SubCategory
  type: 'grammar' | 'naturalness'
  displayName: string
  totalCount: number
  sessionCount: number
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

  const { count: totalReadySessions } = await db
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ready')

  const total = totalReadySessions ?? 0

  const { data: errorCounts } = await db.rpc('get_subcategory_error_counts')

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

  const focusCards: FocusCard[] = (errorCounts ?? []).map((row: {
    sub_category: string; type: string; total_count: number; session_count: number
  }) => ({
    subCategory: row.sub_category as SubCategory,
    type: row.type as 'grammar' | 'naturalness',
    displayName: SUB_CATEGORY_DISPLAY[row.sub_category as SubCategory] ?? row.sub_category,
    totalCount: Number(row.total_count),
    sessionCount: Number(row.session_count),
    examples: examplesBySubCat.get(row.sub_category) ?? [],
  }))

  return { totalReadySessions: total, focusCards }
}
