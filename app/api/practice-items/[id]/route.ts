// app/api/practice-items/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

type Params = { params: { id: string } }

async function verifyOwnership(db: ReturnType<typeof createServerClient>, itemId: string, userId: string) {
  const { data: item } = await db
    .from('practice_items')
    .select('session_id')
    .eq('id', itemId)
    .single()

  if (!item) return false

  const { data: session } = await db
    .from('sessions')
    .select('id')
    .eq('id', item.session_id)
    .eq('user_id', userId)
    .single()

  return !!session
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const owned = await verifyOwnership(db, params.id, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as { reviewed?: boolean; written_down?: boolean }
  const update: Record<string, boolean> = {}
  if (body.reviewed !== undefined) update.reviewed = body.reviewed
  if (body.written_down !== undefined) update.written_down = body.written_down

  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const { error } = await db
    .from('practice_items')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const owned = await verifyOwnership(db, params.id, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await db
    .from('practice_items')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
