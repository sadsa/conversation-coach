import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sendAdminPush } from '@/lib/push'
import { log } from '@/lib/logger'

// 60-second window: defends against double-fire on page reloads
const FRESH_WINDOW_MS = 60_000

export async function POST(request: NextRequest) {
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  const email = body.email?.toLowerCase()
  if (!email) return new NextResponse(null, { status: 204 })

  const db = createServerClient()
  const { data: row } = await db
    .from('allowed_users')
    .select('status, requested_at, source')
    .eq('email', email)
    .single()

  if (!row || row.status !== 'pending') {
    return new NextResponse(null, { status: 204 })
  }

  const age = Date.now() - new Date(row.requested_at).getTime()
  if (age > FRESH_WINDOW_MS) {
    return new NextResponse(null, { status: 204 })
  }

  const provider = row.source === 'google' ? 'Google' : 'email link'
  try {
    await sendAdminPush({
      title: 'New access request',
      body: `${email} signed in via ${provider}. Tap to review.`,
      url: '/admin',
    })
  } catch (err) {
    log.error('access-request/notify: push failed', { email, error: err })
  }

  // Always 204 — never reveal pending vs approved status to the caller
  return new NextResponse(null, { status: 204 })
}
