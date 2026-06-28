// app/api/practice-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { verifyOwnedSession } from '@/lib/ownership'
import { loadPracticeItems } from '@/lib/loaders'
import { trackEvent } from '@/lib/analytics'

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  trackEvent(user.id, 'study_queue_opened')

  const url = new URL(req.url)
  const sort = url.searchParams.get('sort') === 'importance' ? 'importance' : 'created'

  try {
    const { items } = await loadPracticeItems(user.id, { sort })
    return NextResponse.json(items)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()

  if (body.source === 'manual') {
    // Wild Capture: no session, scoped directly to user
    const { phrase, context } = body as { phrase?: string; context?: string }
    if (!phrase) return NextResponse.json({ error: 'phrase is required' }, { status: 400 })

    const { data, error } = await db
      .from('practice_items')
      .insert({
        source: 'manual',
        user_id: user.id,
        session_id: null,
        annotation_id: null,
        original: phrase,
        explanation: context ?? '',
        type: 'naturalness',
        sub_category: 'vocabulary-choice',
        correction: null,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    trackEvent(user.id, 'wild_capture_created', { item_id: data.id })
    return NextResponse.json(data, { status: 201 })
  }

  // Annotation-derived item: must belong to a session the user owns
  if (!(await verifyOwnedSession(db, body.session_id, user.id))) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data, error } = await db
    .from('practice_items')
    .insert(body)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  trackEvent(user.id, 'annotation_saved', { session_id: body.session_id, annotation_id: body.annotation_id })
  return NextResponse.json(data, { status: 201 })
}
