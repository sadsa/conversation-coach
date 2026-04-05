import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn() } }))

import { createServerClient } from '@/lib/supabase-server'
import webpush from 'web-push'
import { sendPushNotification } from '@/lib/push'

describe('sendPushNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pubkey'
    process.env.VAPID_PRIVATE_KEY = 'privkey'
  })

  it('returns early and does not call sendNotification when no subscription row exists', async () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)

    await sendPushNotification('session-1', 'My Session')

    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('calls sendNotification with correct payload when subscription exists', async () => {
    const sub = { endpoint: 'https://fcm.example', p256dh: 'abc', auth: 'def' }
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: sub, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as any)

    await sendPushNotification('session-1', 'My Session')

    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://fcm.example', keys: { p256dh: 'abc', auth: 'def' } },
      JSON.stringify({ title: 'My Session', body: 'Your session is ready to review.', sessionId: 'session-1' }),
    )
  })

  it('does not throw when sendNotification rejects', async () => {
    const sub = { endpoint: 'https://fcm.example', p256dh: 'abc', auth: 'def' }
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: sub, error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createServerClient).mockReturnValue(mockDb as any)
    vi.mocked(webpush.sendNotification).mockRejectedValue(new Error('push failed'))

    await expect(sendPushNotification('session-1', 'My Session')).resolves.toBeUndefined()
  })
})
