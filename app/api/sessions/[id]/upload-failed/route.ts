// app/api/sessions/[id]/upload-failed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerClient()
  await db.from('sessions').update({
    status: 'error',
    error_stage: 'uploading',
  }).eq('id', params.id)
  return NextResponse.json({ ok: true })
}
