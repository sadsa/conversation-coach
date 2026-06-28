// app/api/practice-items/[id]/enrich/route.ts
//
// POST — enriches a manual Wild Capture item by calling Claude to generate
// flashcard_front, flashcard_back, and flashcard_note from the stored phrase
// (original) and context (explanation). Safe to call multiple times; subsequent
// calls overwrite the previous enrichment.
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { enrichWildCapture } from '@/lib/wild-capture'
import type { TargetLanguage } from '@/lib/types'

type RouteParams = { id: string } | Promise<{ id: string }>

export async function POST(req: NextRequest, { params }: { params: RouteParams }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: itemId } = await params
  const db = createServerClient()

  // Fetch the item — must be a manual item owned by this user
  const { data: row } = await db
    .from('practice_items')
    .select('original, explanation, user_id, source')
    .eq('id', itemId)
    .single()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = row as {
    original: string
    explanation: string
    user_id: string | null
    source: string
  }

  if (item.source !== 'manual' || item.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(req.url)
  const lang = (url.searchParams.get('lang') ?? 'es-AR') as TargetLanguage

  const fields = await enrichWildCapture(item.original, item.explanation, lang)

  const { error } = await db
    .from('practice_items')
    .update(fields)
    .eq('id', itemId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, ...fields })
}
