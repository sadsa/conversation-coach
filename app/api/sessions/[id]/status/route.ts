// app/api/sessions/[id]/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { getOwnedSession } from '@/lib/ownership'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const data = await getOwnedSession<{ status: string; error_stage: string | null }>(
    db, params.id, user.id, 'status, error_stage',
  )

  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ status: data.status, error_stage: data.error_stage ?? null })
}
