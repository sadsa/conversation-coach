// app/api/practice-items/leitner-review/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { leitnerPass, leitnerFail, formatDateISO } from '@/lib/leitner'

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { results?: Array<{ id: string; passed: boolean }> }
  if (!Array.isArray(body.results) || body.results.length === 0) {
    return NextResponse.json({ error: 'results must be a non-empty array' }, { status: 400 })
  }

  const db = createServerClient()
  const ids = body.results.map(r => r.id)

  // Ownership check
  const { data: userSessions } = await db
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)
  const sessionIds = (userSessions ?? []).map((s: { id: string }) => s.id)

  const { data: items } = await db
    .from('practice_items')
    .select('id, leitner_box, session_id')
    .in('id', ids)

  if (!items || items.some((item: { session_id: string }) => !sessionIds.includes(item.session_id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const boxMap = Object.fromEntries(
    (items as Array<{ id: string; leitner_box: number }>).map(i => [i.id, i.leitner_box ?? 1])
  )

  const today = new Date()

  await Promise.all(
    body.results.map(({ id, passed }) => {
      const { box, dueDate } = passed
        ? leitnerPass(boxMap[id], today)
        : leitnerFail(today)
      return db
        .from('practice_items')
        .update({ leitner_box: box, leitner_due_date: formatDateISO(dueDate) })
        .eq('id', id)
    })
  )

  return NextResponse.json({ ok: true })
}
