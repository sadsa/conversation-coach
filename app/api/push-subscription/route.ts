import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { endpoint, keys } = body

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db.from('push_subscriptions').upsert({
    id: 1,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    log.error('Failed to upsert push subscription', { error: error.message })
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }

  log.info('Push subscription saved')
  return NextResponse.json({ ok: true })
}
