// app/api/practice-items/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { verifyOwnedViaSession } from '@/lib/ownership'
import { trackEvent } from '@/lib/analytics'

type RouteParams = { id: string } | Promise<{ id: string }>
type Params = { params: RouteParams }

async function getItemId(params: RouteParams): Promise<string> {
  const resolved = await params
  return resolved.id
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const itemId = await getItemId(params)
  const db = createServerClient()
  const owned = await verifyOwnedViaSession(db, 'practice_items', itemId, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as { reviewed?: boolean; written_down?: boolean }
  const update: Record<string, unknown> = {}
  if (body.reviewed !== undefined) update.reviewed = body.reviewed
  if (body.written_down !== undefined) update.written_down = body.written_down

  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const { error } = await db
    .from('practice_items')
    .update(update)
    .eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.written_down === true)
    trackEvent(user.id, 'practice_item_studied', { practice_item_id: itemId, method: 'manual' })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const itemId = await getItemId(params)
  const db = createServerClient()
  const owned = await verifyOwnedViaSession(db, 'practice_items', itemId, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await db
    .from('practice_items')
    .delete()
    .eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
