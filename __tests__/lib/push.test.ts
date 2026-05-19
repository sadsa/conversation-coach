import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))

import { createServerClient } from '@/lib/supabase-server'
import webpush from 'web-push'
import { sendPushNotification, sendAdminPush } from '@/lib/push'

const sub = { endpoint: 'https://fcm.example', p256dh: 'abc', auth: 'def' }

function makeDb(subData: typeof sub | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: subData }),
        }),
      }),
    }),
  }
}

describe('sendPushNotification (compat wrapper)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pubkey'
    process.env.VAPID_PRIVATE_KEY = 'privkey'
    process.env.VAPID_CONTACT = 'mailto:test@example.com'
  })

  it('returns early when no subscription row exists', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb(null) as any)
    await sendPushNotification('session-1', 'My Session')
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('sends with correct payload when subscription exists', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb(sub) as any)
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as any)

    await sendPushNotification('session-1', 'My Session')

    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://fcm.example', keys: { p256dh: 'abc', auth: 'def' } },
      expect.stringContaining('"sessionId":"session-1"'),
    )
  })

  it('returns early when VAPID keys are missing', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    await sendPushNotification('session-1', 'My Session')
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('does not throw when sendNotification rejects', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb(sub) as any)
    vi.mocked(webpush.sendNotification).mockRejectedValue(new Error('push failed'))
    await expect(sendPushNotification('session-1', 'My Session')).resolves.toBeUndefined()
  })
})

describe('sendAdminPush', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pubkey'
    process.env.VAPID_PRIVATE_KEY = 'privkey'
    process.env.VAPID_CONTACT = 'mailto:test@example.com'
  })

  it('sends correct payload to owner device', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb(sub) as any)
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as any)

    await sendAdminPush({ title: 'New access request', body: 'foo@example.com signed in via Google. Tap to review.', url: '/admin' })

    const [pushSub, payload] = vi.mocked(webpush.sendNotification).mock.calls[0]
    expect(pushSub).toEqual({ endpoint: 'https://fcm.example', keys: { p256dh: 'abc', auth: 'def' } })
    const parsed = JSON.parse(payload as string)
    expect(parsed.title).toBe('New access request')
    expect(parsed.url).toBe('/admin')
  })

  it('returns silently when VAPID is not configured', async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    await sendAdminPush({ title: 'Test', body: 'Test', url: '/admin' })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('returns silently when owner has no push subscription', async () => {
    vi.mocked(createServerClient).mockReturnValue(makeDb(null) as any)
    await sendAdminPush({ title: 'Test', body: 'Test', url: '/admin' })
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })
})
