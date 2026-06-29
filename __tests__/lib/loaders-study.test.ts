// __tests__/lib/loaders-study.test.ts
//
// Unit tests for loadStudyItems — the three loading modes for the /study route.
// Mocks createServerClient so no real DB is needed.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}))

import { createServerClient } from '@/lib/supabase-server'
import { loadStudyItems } from '@/lib/loaders'

const mockCreateServerClient = vi.mocked(createServerClient)

/**
 * Returns a fluent Supabase query-builder mock that resolves to the given
 * `data`. The object is both thenable (await-able) and spyable — callers
 * can assert which filter methods were called.
 */
function makeChain(data: unknown[], error: unknown = null) {
  const promise = Promise.resolve({ data, error })
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    // Thenable protocol — lets `await chain` resolve to { data, error }
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  }
  return chain
}

function makeDb(data: unknown[], error: unknown = null) {
  const chain = makeChain(data, error)
  const db = { from: vi.fn().mockReturnValue(chain) }
  mockCreateServerClient.mockReturnValue(db as unknown as ReturnType<typeof createServerClient>)
  return { db, chain }
}

const USER_ID = 'user-1'

describe('loadStudyItems — session mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns all items for the session, bypassing due-date filter', async () => {
    const rows = [
      { id: 'p1', correction: 'Fui', explanation: 'drop pronoun', flashcard_front: null, flashcard_back: null },
    ]
    const { chain } = makeDb(rows)

    const phrases = await loadStudyItems(USER_ID, { mode: 'session', sessionId: 'sess-1' })

    expect(phrases).toHaveLength(1)
    expect(phrases[0]).toMatchObject({ id: 'p1', correction: 'Fui', explanation: 'drop pronoun' })
    // Must filter by session_id and user
    expect(chain.eq).toHaveBeenCalledWith('session_id', 'sess-1')
    expect(chain.eq).toHaveBeenCalledWith('sessions.user_id', USER_ID)
    // Must NOT add a due-date filter
    expect(chain.lte).not.toHaveBeenCalled()
  })

  it('includes items regardless of their due date', async () => {
    // Items not yet due — should still be returned in session mode
    const rows = [
      { id: 'p1', correction: 'Fui', explanation: 'e1', flashcard_front: null, flashcard_back: null },
      { id: 'p2', correction: 'Sos', explanation: 'e2', flashcard_front: null, flashcard_back: null },
    ]
    makeDb(rows)

    const phrases = await loadStudyItems(USER_ID, { mode: 'session', sessionId: 'sess-1' })

    expect(phrases).toHaveLength(2)
  })

  it('maps flashcard fields onto LessonPhrase', async () => {
    const rows = [
      {
        id: 'p1',
        correction: 'Fui',
        explanation: 'drop pronoun',
        flashcard_front: 'I [[went]] to the market.',
        flashcard_back: '[[Fui]] al mercado.',
      },
    ]
    makeDb(rows)

    const [phrase] = await loadStudyItems(USER_ID, { mode: 'session', sessionId: 'sess-1' })

    expect(phrase.flashcard_front).toBe('I [[went]] to the market.')
    expect(phrase.flashcard_back).toBe('[[Fui]] al mercado.')
  })

  it('returns empty array when session has no practice items', async () => {
    makeDb([])

    const phrases = await loadStudyItems(USER_ID, { mode: 'session', sessionId: 'sess-empty' })

    expect(phrases).toHaveLength(0)
  })
})

describe('loadStudyItems — SRS mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('filters items where due <= now and scopes to the user', async () => {
    const rows = [
      { id: 'p1', correction: 'Fui', explanation: 'e1', flashcard_front: null, flashcard_back: null },
    ]
    const { chain } = makeDb(rows)

    await loadStudyItems(USER_ID, { mode: 'srs' })

    // Must add a due-date ceiling
    expect(chain.lte).toHaveBeenCalledWith('due', expect.any(String))
    // Must scope to user
    expect(chain.eq).toHaveBeenCalledWith('sessions.user_id', USER_ID)
  })

  it('returns mapped phrases for due items', async () => {
    const rows = [
      { id: 'p1', correction: 'Fui', explanation: 'e1', flashcard_front: null, flashcard_back: null },
      { id: 'p2', correction: 'Sos', explanation: 'e2', flashcard_front: null, flashcard_back: null },
    ]
    makeDb(rows)

    const phrases = await loadStudyItems(USER_ID, { mode: 'srs' })

    expect(phrases).toHaveLength(2)
    expect(phrases[0].id).toBe('p1')
    expect(phrases[1].id).toBe('p2')
  })
})

describe('loadStudyItems — items mode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array without querying the DB when itemIds is empty', async () => {
    const { db } = makeDb([])

    const phrases = await loadStudyItems(USER_ID, { mode: 'items', itemIds: [] })

    expect(phrases).toHaveLength(0)
    expect(db.from).not.toHaveBeenCalled()
  })

  it('filters by the given IDs', async () => {
    const rows = [
      { id: 'p1', correction: 'Fui', explanation: 'e1', flashcard_front: null, flashcard_back: null,
        user_id: null, sessions: { user_id: USER_ID } },
    ]
    const { chain } = makeDb(rows)

    await loadStudyItems(USER_ID, { mode: 'items', itemIds: ['p1'] })

    expect(chain.in).toHaveBeenCalledWith('id', ['p1'])
  })

  it('excludes items that belong to a different user', async () => {
    const rows = [
      {
        id: 'p1', correction: 'Fui', explanation: 'e1', flashcard_front: null, flashcard_back: null,
        user_id: null, sessions: { user_id: USER_ID },
      },
      {
        id: 'p2', correction: 'Sos', explanation: 'e2', flashcard_front: null, flashcard_back: null,
        user_id: null, sessions: { user_id: 'other-user' },
      },
    ]
    makeDb(rows)

    const phrases = await loadStudyItems(USER_ID, { mode: 'items', itemIds: ['p1', 'p2'] })

    expect(phrases).toHaveLength(1)
    expect(phrases[0].id).toBe('p1')
  })

  it('accepts manual items owned directly via user_id (no session)', async () => {
    const rows = [
      {
        id: 'p1', correction: 'Fui', explanation: 'e1', flashcard_front: null, flashcard_back: null,
        user_id: USER_ID, sessions: null,
      },
    ]
    makeDb(rows)

    const phrases = await loadStudyItems(USER_ID, { mode: 'items', itemIds: ['p1'] })

    expect(phrases).toHaveLength(1)
    expect(phrases[0].id).toBe('p1')
  })

  it('rejects items with no session and wrong direct user_id', async () => {
    const rows = [
      {
        id: 'p1', correction: 'Fui', explanation: 'e1', flashcard_front: null, flashcard_back: null,
        user_id: 'other-user', sessions: null,
      },
    ]
    makeDb(rows)

    const phrases = await loadStudyItems(USER_ID, { mode: 'items', itemIds: ['p1'] })

    expect(phrases).toHaveLength(0)
  })
})
