import webpush from 'web-push'
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

function vapidReady(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const contact = process.env.VAPID_CONTACT
  if (!pub || !priv || !contact) return false
  webpush.setVapidDetails(contact, pub, priv)
  return true
}

async function getOwnerSubscription() {
  const db = createServerClient()
  const { data } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('id', 1)
    .single()
  return data
}

async function sendToOwnerDevice(payload: string): Promise<void> {
  if (!vapidReady()) return
  const sub = await getOwnerSubscription()
  if (!sub) {
    log.warn('push: no owner subscription found (id=1)')
    return
  }
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    )
  } catch (err) {
    log.error('push: send failed', { error: err })
  }
}

/** Session-analysis-complete push (existing, renamed for clarity). */
export async function sendSessionReadyPush(sessionId: string, title: string): Promise<void> {
  const payload = JSON.stringify({
    title,
    body: 'Your session is ready to review.',
    sessionId,
    url: `/sessions/${sessionId}`,
  })
  await sendToOwnerDevice(payload)
  log.info('push: session-ready sent', { sessionId })
}

/** Admin notification when a new pending access request arrives. */
export async function sendAdminPush(args: { title: string; body: string; url: string }): Promise<void> {
  const payload = JSON.stringify(args)
  await sendToOwnerDevice(payload)
  log.info('push: admin notification sent', { url: args.url })
}

/** @deprecated Use sendSessionReadyPush. Kept for call-site backwards compat. */
export async function sendPushNotification(sessionId: string, title: string): Promise<void> {
  await sendSessionReadyPush(sessionId, title)
}

