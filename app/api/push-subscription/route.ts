import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { endpoint, keys } = body ?? {}

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
