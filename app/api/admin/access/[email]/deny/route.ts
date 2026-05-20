import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { sendAccessDenied } from '@/lib/email'
import { log } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: { email: string } }
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL?.toLowerCase()
  if (!OWNER_EMAIL || user.email?.toLowerCase() !== OWNER_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const email = decodeURIComponent(params.email).toLowerCase()
  const db = createServerClient()

  const { error, count } = await db
    .from('allowed_users')
    .update({ status: 'denied' })
    .eq('email', email)
    .eq('status', 'pending')
    .select('*', { count: 'exact', head: true })

  if (error) {
    log.error('admin/deny: db update failed', { email, error: error.message })
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Only notify on actual pending → denied transition
  if (count && count > 0) {
    sendAccessDenied({ to: email }).catch((err) => {
      log.error('admin/deny: denial email failed', { email, err })
    })
  }

  return NextResponse.json({ ok: true, status: 'denied' })
}
