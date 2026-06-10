// app/api/practice-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { verifyOwnedSession } from '@/lib/ownership'
import { loadPracticeItems } from '@/lib/loaders'

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const sort = url.searchParams.get('sort') === 'importance' ? 'importance' : 'created'

  try {
    return NextResponse.json(await loadPracticeItems(user.id, { sort }))
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()

  // The user can only attach a practice item to a session they own.
  if (!(await verifyOwnedSession(db, body.session_id, user.id))) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data, error } = await db
    .from('practice_items')
    .insert(body)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
