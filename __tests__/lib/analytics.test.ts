// __tests__/lib/analytics.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase-server and logger before importing the module under test
vi.mock('@/lib/supabase-server', () => ({ createServerClient: vi.fn() }))
vi.mock('@/lib/logger', () => ({ log: { warn: vi.fn() } }))

import { trackEvent } from '@/lib/analytics'
import { createServerClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

function makeDb(insertResult: { error: unknown }) {
  const insert = vi.fn().mockResolvedValue(insertResult)
  const from = vi.fn().mockReturnValue({ insert })
  return { db: { from }, from, insert }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('trackEvent', () => {
  it('inserts a row with userId, event, and properties', async () => {
    const { db, from, insert } = makeDb({ error: null })
    vi.mocked(createServerClient).mockReturnValue(db as never)

    await trackEvent('user-1', 'session_completed', { session_id: 's1', session_type: 'upload' })

    expect(from).toHaveBeenCalledWith('events')
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      event: 'session_completed',
      properties: { session_id: 's1', session_type: 'upload' },
    })
  })

  it('defaults properties to empty object when omitted', async () => {
    const { db, insert } = makeDb({ error: null })
    vi.mocked(createServerClient).mockReturnValue(db as never)

    await trackEvent('user-1', 'study_queue_opened')

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ properties: {} })
    )
  })

  it('swallows DB errors and does not throw', async () => {
    const { db } = makeDb({ error: new Error('connection refused') })
    vi.mocked(createServerClient).mockReturnValue(db as never)

    await expect(trackEvent('user-1', 'annotation_saved')).resolves.toBeUndefined()
  })

  it('logs a warning on DB error', async () => {
    const err = new Error('connection refused')
    const { db } = makeDb({ error: err })
    vi.mocked(createServerClient).mockReturnValue(db as never)

    await trackEvent('user-1', 'annotation_saved')

    expect(log.warn).toHaveBeenCalledWith('trackEvent failed', expect.objectContaining({ event: 'annotation_saved' }))
  })
})
