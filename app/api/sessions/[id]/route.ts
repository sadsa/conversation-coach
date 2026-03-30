// app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const db = createServerClient()

  const { data: session, error: sessionError } = await db
    .from('sessions')
    .select('id, title, status, error_stage, duration_seconds, detected_speaker_count, user_speaker_labels, created_at')
    .eq('id', params.id)
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
    .select('id, annotation_id')
    .eq('session_id', params.id)

  const addedAnnotations = (practiceItems ?? []).reduce<Record<string, string>>(
    (acc, p: { id: string; annotation_id: string | null }) => {
      if (p.annotation_id) acc[p.annotation_id] = p.id
      return acc
    },
    {}
  )

  return NextResponse.json({
    session,
    segments: segments ?? [],
    annotations: annotations ?? [],
    addedAnnotations,
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json()
  const { title } = body as { title?: string }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title must not be empty' }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db
    .from('sessions')
    .update({ title: title.trim() })
    .eq('id', params.id)

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
