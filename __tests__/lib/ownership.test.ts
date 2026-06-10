// __tests__/lib/ownership.test.ts
//
// The seam every owned-resource route crosses. Covers both ownership shapes:
// directly-owned sessions (getOwnedSession / verifyOwnedSession) and
// resources owned via their parent session (verifyOwnedViaSession).
import { describe, it, expect, vi } from 'vitest'
import { getOwnedSession, verifyOwnedSession, verifyOwnedViaSession } from '@/lib/ownership'
import type { createServerClient } from '@/lib/supabase-server'

type Db = ReturnType<typeof createServerClient>

// Builds a db whose `.from(table).select(...).eq(...).eq(...).single()` chain
// resolves to the given result. Records the select columns and the final
// `.single()` so assertions can inspect the query shape.
function makeSessionDb(result: { data: unknown; error?: unknown }) {
  const single = vi.fn().mockResolvedValue({ error: null, ...result })
  const eqUser = vi.fn().mockReturnValue({ single })
  const eqId = vi.fn().mockReturnValue({ eq: eqUser })
  const select = vi.fn().mockReturnValue({ eq: eqId })
  const from = vi.fn().mockReturnValue({ select })
  return { db: { from } as unknown as Db, from, select, eqId, eqUser, single }
}

describe('getOwnedSession', () => {
  it('returns the row scoped by id and user_id, defaulting to the id column', async () => {
    const { db, from, select, eqId, eqUser } = makeSessionDb({ data: { id: 's1' } })
    const row = await getOwnedSession(db, 's1', 'user-1')
    expect(row).toEqual({ id: 's1' })
    expect(from).toHaveBeenCalledWith('sessions')
    expect(select).toHaveBeenCalledWith('id')
    expect(eqId).toHaveBeenCalledWith('id', 's1')
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('passes a custom column list through to select', async () => {
    const { db, select } = makeSessionDb({ data: { status: 'ready', error_stage: null } })
    const row = await getOwnedSession(db, 's1', 'user-1', 'status, error_stage')
    expect(select).toHaveBeenCalledWith('status, error_stage')
    expect(row).toEqual({ status: 'ready', error_stage: null })
  })

  it('returns null when no row matches (unknown or unowned session)', async () => {
    const { db } = makeSessionDb({ data: null, error: { message: 'no rows' } })
    expect(await getOwnedSession(db, 's1', 'user-1')).toBeNull()
  })
})

describe('verifyOwnedSession', () => {
  it('is true when the owned row exists', async () => {
    const { db } = makeSessionDb({ data: { id: 's1' } })
    expect(await verifyOwnedSession(db, 's1', 'user-1')).toBe(true)
  })

  it('is false when no owned row exists', async () => {
    const { db } = makeSessionDb({ data: null })
    expect(await verifyOwnedSession(db, 's1', 'user-1')).toBe(false)
  })
})

describe('verifyOwnedViaSession', () => {
  // Two-query chain: look up the child row's session_id, then prove the
  // parent session belongs to the user.
  function makeViaDb(childRow: unknown, parentRow: unknown) {
    const childSingle = vi.fn().mockResolvedValue({ data: childRow, error: childRow ? null : { message: 'no rows' } })
    const parentSingle = vi.fn().mockResolvedValue({ data: parentRow, error: parentRow ? null : { message: 'no rows' } })

    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'sessions') {
        return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: parentSingle }) }) }) }
      }
      // child table (annotations | practice_items)
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: childSingle }) }) }
    })
    return { db: { from } as unknown as Db, from, parentSingle }
  }

  it('is true when the child resolves to a session owned by the user', async () => {
    const { db } = makeViaDb({ session_id: 's1' }, { id: 's1' })
    expect(await verifyOwnedViaSession(db, 'annotations', 'ann-1', 'user-1')).toBe(true)
  })

  it('is false when the child row does not exist', async () => {
    const { db, parentSingle } = makeViaDb(null, { id: 's1' })
    expect(await verifyOwnedViaSession(db, 'practice_items', 'item-1', 'user-1')).toBe(false)
    // Short-circuits before checking the parent session.
    expect(parentSingle).not.toHaveBeenCalled()
  })

  it('is false when the parent session is owned by someone else', async () => {
    const { db } = makeViaDb({ session_id: 's1' }, null)
    expect(await verifyOwnedViaSession(db, 'annotations', 'ann-1', 'user-1')).toBe(false)
  })
})
