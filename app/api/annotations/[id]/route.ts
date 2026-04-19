// app/api/annotations/[id]/route.ts
//
// Per-annotation user feedback endpoint. The only field exposed today is
// `is_unhelpful` — the user pressing the thumbs-down button on the
// AnnotationCard. We capture the toggle moment in `unhelpful_at` so we can
// later compute "marked unhelpful within 30 seconds of opening" or "later
// reversed" trends as inputs to the analysis prompt iteration loop.
//
// Ownership is enforced through the parent session, mirroring the practice
// items route. We do NOT use the service-role key here — the user's own
// session JWT is what authorises the write.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

type Params = { params: { id: string } }

async function verifyOwnership(
  db: ReturnType<typeof createServerClient>,
  annotationId: string,
  userId: string,
): Promise<boolean> {
  const { data: annotation } = await db
    .from('annotations')
    .select('session_id')
    .eq('id', annotationId)
    .single()

  if (!annotation) return false

  const { data: session } = await db
    .from('sessions')
    .select('id')
    .eq('id', annotation.session_id)
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

  const body = await req.json() as { is_unhelpful?: boolean }

  if (typeof body.is_unhelpful !== 'boolean') {
    return NextResponse.json({ error: 'is_unhelpful (boolean) required' }, { status: 400 })
  }

  const { error } = await db
    .from('annotations')
    .update({
      is_unhelpful: body.is_unhelpful,
      unhelpful_at: body.is_unhelpful ? new Date().toISOString() : null,
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
