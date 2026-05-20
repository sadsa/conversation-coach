// app/api/access-request/notify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sendAdminNotification } from '@/lib/email'
import { log } from '@/lib/logger'

// 5-minute window: defends against double-fire on page reloads while
// giving OAuth flows enough time to complete
const FRESH_WINDOW_MS = 5 * 60_000

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
    .select('status, requested_at, source, name')
    .eq('email', email)
    .single()

  if (!row || row.status !== 'pending') {
    return new NextResponse(null, { status: 204 })
  }

  const age = Date.now() - new Date(row.requested_at).getTime()
  if (age > FRESH_WINDOW_MS) {
    return new NextResponse(null, { status: 204 })
  }

  const requestedAt = new Date(row.requested_at).toLocaleString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  try {
    await sendAdminNotification({
      name: row.name ?? '',
      email,
      requestedAt,
    })
  } catch (err) {
    log.error('access-request/notify: email failed', { email, error: err })
  }

  // Always 204 — never reveal pending vs approved status to the caller
  return new NextResponse(null, { status: 204 })
}
