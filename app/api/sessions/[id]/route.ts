// app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()

  const { data: session, error: sessionError } = await db
    .from('sessions')
    .select('id, title, status, error_stage, duration_seconds, detected_speaker_count, user_speaker_labels, created_at')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (sessionError) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: segments } = await db
    .from('transcript_segments')
    .select('*')
    .eq('session_id', params.id)
    .order('position')

  const { data: annotations } = await db
    .from('annotations')
    .select('*')
    .eq('session_id', params.id)

  const { data: practiceItems } = await db
    .from('practice_items')
    .select('id, annotation_id, written_down')
    .eq('session_id', params.id)

  const addedAnnotations = (practiceItems ?? []).reduce<Record<string, string>>(
    (acc, p: { id: string; annotation_id: string | null }) => {
      if (p.annotation_id) acc[p.annotation_id] = p.id
      return acc
    },
    {}
  )

  const writtenAnnotations = (practiceItems ?? [])
    .filter((p: { annotation_id: string | null; written_down: boolean }) => p.annotation_id && p.written_down)
    .map((p: { annotation_id: string }) => p.annotation_id)

  return NextResponse.json({
    session,
    segments: segments ?? [],
    annotations: annotations ?? [],
    addedAnnotations,
    writtenAnnotations,
  })
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
  const db = createServerClient()
  const { error } = await db
    .from('sessions')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
