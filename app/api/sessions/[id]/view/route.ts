// app/api/sessions/[id]/view/route.ts
//
// Idempotent "this session has been opened" pulse. Called by the transcript
// page on first mount so the user's recent-conversations list can mark the
// row as read (Gmail-style). We only stamp `last_viewed_at` when it's
// currently NULL — repeated visits don't churn the row's updated_at and the
// "Mark as unread" action stays the only way to flip it back.
//
// Returns 200 on success regardless of whether the column was actually
// updated (already-read sessions short-circuit with no write). The client
// doesn't need to distinguish.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

type Params = { params: { id: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()

  const { data: existing, error: readError } = await db
    .from('sessions')
    .select('id, last_viewed_at')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (readError || !existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (existing.last_viewed_at) {
    return NextResponse.json({ ok: true, alreadyViewed: true })
  }

  const { error: updateError } = await db
    .from('sessions')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, alreadyViewed: false })
}
