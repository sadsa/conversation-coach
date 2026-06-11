// lib/analytics.ts
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

export async function trackEvent(
  userId: string,
  event: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    const db = createServerClient()
    const { error } = await db.from('events').insert({ user_id: userId, event, properties })
    if (error) throw error
  } catch (err) {
    log.warn('trackEvent failed', { event, err })
  }
}
