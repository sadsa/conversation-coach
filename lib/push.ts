import webpush from 'web-push'
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

export async function sendPushNotification(sessionId: string, title: string): Promise<void> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  if (!vapidPublicKey || !vapidPrivateKey) {
    log.error('VAPID keys not configured — skipping push notification', { sessionId })
    return
  }

  const vapidContact = process.env.VAPID_CONTACT ?? 'mailto:push@localhost'
  webpush.setVapidDetails(vapidContact, vapidPublicKey, vapidPrivateKey)

  const db = createServerClient()
  const { data: sub } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('id', 1)
    .single()

  if (!sub) return

  const payload = JSON.stringify({
    title,
    body: 'Your session is ready to review.',
    sessionId,
  })

  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    )
    log.info('Push notification sent', { sessionId })
  } catch (err) {
    log.error('Push notification failed', { sessionId, error: err })
  }
}
