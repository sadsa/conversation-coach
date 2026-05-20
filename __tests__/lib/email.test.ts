// __tests__/lib/email.test.ts
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const mockSend = vi.fn().mockResolvedValue({ data: { id: 'test-id' }, error: null })

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockSend } }
  }),
}))

vi.mock('@react-email/render', () => ({
  render: vi.fn().mockReturnValue('<html>mock</html>'),
}))

vi.mock('@/emails/AdminNotification', () => ({
  default: vi.fn().mockReturnValue(null),
}))

vi.mock('@/emails/AccessDenied', () => ({
  default: vi.fn().mockReturnValue(null),
}))

describe('sendAdminNotification', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.RESEND_FROM_EMAIL = 'noreply@test.app'
    process.env.NEXT_PUBLIC_OWNER_EMAIL = 'admin@test.app'
    process.env.APP_URL = 'https://test.app'
    mockSend.mockClear()
  })

  afterEach(() => {
    delete process.env.RESEND_API_KEY
  })

  it('sends to NEXT_PUBLIC_OWNER_EMAIL with correct subject', async () => {
    const { sendAdminNotification } = await import('@/lib/email')
    await sendAdminNotification({
      name: 'Valentina Torres',
      email: 'v@example.com',
      requestedAt: 'Tuesday, 20 May 2026 at 9:14 am',
    })
    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@test.app',
        subject: 'New access request from Valentina Torres',
        html: '<html>mock</html>',
      })
    )
  })

  it('falls back to email in subject when name is empty', async () => {
    vi.resetModules()
    const { sendAdminNotification } = await import('@/lib/email')
    await sendAdminNotification({
      name: '',
      email: 'v@example.com',
      requestedAt: 'Tuesday, 20 May 2026 at 9:14 am',
    })
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'New access request from v@example.com' })
    )
  })

  it('does not send when RESEND_API_KEY is absent', async () => {
    delete process.env.RESEND_API_KEY
    vi.resetModules()
    const { sendAdminNotification } = await import('@/lib/email')
    await sendAdminNotification({ name: 'Test', email: 't@test.com', requestedAt: 'now' })
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('sendAccessDenied', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.RESEND_FROM_EMAIL = 'noreply@test.app'
    process.env.NEXT_PUBLIC_OWNER_EMAIL = 'admin@test.app'
    mockSend.mockClear()
  })

  afterEach(() => {
    delete process.env.RESEND_API_KEY
  })

  it('sends to the denied user with correct subject', async () => {
    vi.resetModules()
    const { sendAccessDenied } = await import('@/lib/email')
    await sendAccessDenied({ to: 'user@example.com' })
    expect(mockSend).toHaveBeenCalledOnce()
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Your Conversation Coach access request',
        html: '<html>mock</html>',
      })
    )
  })

  it('does not send when RESEND_API_KEY is absent', async () => {
    delete process.env.RESEND_API_KEY
    vi.resetModules()
    const { sendAccessDenied } = await import('@/lib/email')
    await sendAccessDenied({ to: 'user@example.com' })
    expect(mockSend).not.toHaveBeenCalled()
  })
})
