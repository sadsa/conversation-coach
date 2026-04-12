// app/api/dashboard-summary/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { computeDashboardSummary } from '@/lib/dashboard-summary'

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
