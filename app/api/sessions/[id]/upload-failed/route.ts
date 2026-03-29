// app/api/sessions/[id]/upload-failed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  await db.from('sessions').update({
    status: 'error',
    error_stage: 'uploading',
  }).eq('id', params.id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
