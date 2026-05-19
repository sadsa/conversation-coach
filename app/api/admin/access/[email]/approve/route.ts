import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
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

  const { error } = await db
    .from('allowed_users')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: OWNER_EMAIL })
    .eq('email', email)

  if (error) {
    log.error('admin/approve: db update failed', { email, error: error.message })
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Send approval magic-link email (shouldCreateUser: false — user already exists)
  const { error: otpError } = await db.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.APP_URL}/auth/callback`,
      shouldCreateUser: false,
    },
  })

  if (otpError) {
    // Non-fatal — the user is approved; email is best-effort
    log.error('admin/approve: otp send failed', { email, error: otpError.message })
  }

  return NextResponse.json({ ok: true, status: 'approved' })
}
