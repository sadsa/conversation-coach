// app/api/access-request/notify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sendAdminNotification } from '@/lib/email'
import { log } from '@/lib/logger'

// 5-minute window: defends against double-fire on page reloads while
// giving OAuth flows enough time to complete
const FRESH_WINDOW_MS = 5 * 60_000

interface IpApiResponse {
  status: 'success' | 'fail'
  country?: string
  city?: string
}

async function resolveGeo(ip: string): Promise<{ country: string | null; city: string | null }> {
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city`, {
      signal: AbortSignal.timeout(3000),
    })
    const data: IpApiResponse = await res.json()
    if (data.status !== 'success') return { country: null, city: null }
    return { country: data.country ?? null, city: data.city ?? null }
  } catch {
    return { country: null, city: null }
  }
}

function extractIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return null
}

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

  const ip = extractIp(request)
  const geo = ip ? await resolveGeo(ip) : { country: null, city: null }

  if (ip) {
    await db
      .from('allowed_users')
      .update({ ip_address: ip, geo_country: geo.country, geo_city: geo.city })
      .eq('email', email)
  }

  const requestedAt = new Date(row.requested_at).toLocaleString('en-AU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const location = [geo.city, geo.country].filter(Boolean).join(', ') || null

  try {
    await sendAdminNotification({
      name: row.name ?? '',
      email,
      requestedAt,
      location,
    })
  } catch (err) {
    log.error('access-request/notify: email failed', { email, error: err })
  }

  // Always 204 — never reveal pending vs approved status to the caller
  return new NextResponse(null, { status: 204 })
}
