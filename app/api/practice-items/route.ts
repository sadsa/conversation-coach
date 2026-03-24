// app/api/practice-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(_req: NextRequest) {
  const db = createServerClient()
  const { data, error } = await db
    .from('practice_items')
    .select('id, session_id, annotation_id, type, sub_category, original, correction, explanation, reviewed, created_at, updated_at, flashcard_front, flashcard_back, flashcard_note')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = createServerClient()
  const { data, error } = await db
    .from('practice_items')
    .insert(body)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
