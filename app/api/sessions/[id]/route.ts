// app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadSessionDetail } from '@/lib/loaders'
import { deleteObject } from '@/lib/r2'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const detail = await loadSessionDetail(user.id, params.id)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(detail)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { title?: string; read?: boolean }

  // Build the update dict from whichever fields the caller supplied. Title and
  // read state are independent — title goes through the existing whitespace
  // guard; read toggles `last_viewed_at` (timestamp = read, null = unread).
  const update: Record<string, unknown> = {}

  if (body.title !== undefined) {
    if (!body.title.trim()) {
      return NextResponse.json({ error: 'title must not be empty' }, { status: 400 })
    }
    update.title = body.title.trim()
  }

  if (body.read !== undefined) {
    update.last_viewed_at = body.read ? new Date().toISOString() : null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db
    .from('sessions')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('audio_r2_key')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (session?.audio_r2_key) {
    await deleteObject(session.audio_r2_key)
  }

  const { error } = await db
    .from('sessions')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
