'use client'
import { useEffect, useState, useCallback } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array(Array.from(rawData).map(c => c.charCodeAt(0)))
}

export type NotificationStatus =
  | 'unsupported' // No PushManager / Notification API in this browser
  | 'unconfigured' // Server has no VAPID key (dev or feature off)
  | 'default' // User hasn't decided yet — we can ask
  | 'granted'
  | 'denied'

interface UsePushNotificationsResult {
  status: NotificationStatus
  /** True once we've actually POSTed a subscription this session. */
  subscribed: boolean
  /** Prompts the browser permission dialog and subscribes if accepted. */
  requestAndSubscribe: () => Promise<boolean>
}

/**
 * Manages the Web Push subscription lifecycle for the current device.
 *
 * Behaviour:
 *  - If permission is already `granted`, silently re-syncs the subscription
 *    on mount (so the DB row stays fresh after browser restarts).
 *  - If permission is `default`, exposes a `requestAndSubscribe()` callback
 *    so the UI can ask in a contextual moment (rather than a cold prompt
 *    the moment the user lands on a page).
 *  - If permission is `denied`, does nothing — `status` reflects the state
 *    so callers can hide the prompt.
 */
export function usePushNotifications(): UsePushNotificationsResult {
  const [status, setStatus] = useState<NotificationStatus>('unsupported')
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) { setStatus('unconfigured'); return }
    if (typeof window === 'undefined') return
    if (!('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported')
      return
    }
    setStatus(Notification.permission as NotificationStatus)
    if (Notification.permission === 'granted') {
      void subscribeAndPost().then(ok => setSubscribed(ok))
    }
  }, [])

  const requestAndSubscribe = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false
    if (!VAPID_PUBLIC_KEY) return false
    try {
      const result = await Notification.requestPermission()
      setStatus(result as NotificationStatus)
      if (result !== 'granted') return false
      const ok = await subscribeAndPost()
      setSubscribed(ok)
      return ok
    } catch {
      return false
    }
  }, [])

  return { status, subscribed, requestAndSubscribe }
}

async function subscribeAndPost(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) return await postSubscription(existing)
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
    })
    return await postSubscription(sub)
  } catch {
    return false
  }
}

async function postSubscription(sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!p256dh || !auth) {
    console.warn('[push] Subscription missing keys — cannot register')
    return false
  }
  const response = await fetch('/api/push-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh, auth },
    }),
  })
  if (!response.ok) {
    console.warn('[push] Failed to save subscription:', response.status)
    return false
  }
  return true
}
