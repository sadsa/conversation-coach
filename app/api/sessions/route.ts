// app/api/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { presignedUploadUrl } from '@/lib/r2'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .select('id, title, status, duration_seconds, created_at, processing_completed_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, extension, original_filename } = body as {
    title?: string
    extension?: string
    original_filename?: string
  }

  const ext = (extension ?? 'mp3').replace(/^\./, '')
  const { key, url } = await presignedUploadUrl(ext)

  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .insert({
      title: (title ?? 'Untitled').trim() || 'Untitled',
      audio_r2_key: key,
      original_filename: original_filename ?? null,
      user_id: user.id,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session_id: data.id, upload_url: url }, { status: 201 })
}
