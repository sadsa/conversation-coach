'use client'
import { useEffect } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return new Uint8Array(Array.from(rawData).map(c => c.charCodeAt(0)))
}

export function usePushNotifications() {
  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return
    if (!('PushManager' in window)) return
    if (Notification.permission === 'denied') return

    async function subscribe() {
      try {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          // Already subscribed — re-POST to ensure DB row is up to date
          await postSubscription(existing)
          return
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
        })
        await postSubscription(sub)
      } catch {
        // Silent failure — push unavailable or user denied
      }
    }

    subscribe()
  }, [])
}

async function postSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  const response = await fetch('/api/push-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  })
  if (!response.ok) {
    console.warn('[push] Failed to save subscription:', response.status)
  }
}
