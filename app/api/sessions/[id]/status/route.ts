// app/api/sessions/[id]/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createServerClient()
  const { data, error } = await db
    .from('sessions')
    .select('status, error_stage')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ status: data.status, error_stage: data.error_stage ?? null })
}
