import { describe, it, expect } from 'vitest'
import { filterSessions } from '@/lib/session-filter'
import type { SessionListItem } from '@/lib/types'

function makeSession(overrides: Partial<SessionListItem>): SessionListItem {
  return {
    id: 's1',
    title: 'Test session',
    status: 'ready',
    duration_seconds: 60,
    created_at: '2026-01-01T00:00:00Z',
    processing_completed_at: '2026-01-01T00:01:00Z',
    last_viewed_at: null,
    reviewed_at: null,
    review_state: null,
    saved_count: 0,
    due_count: 0,
    ...overrides,
  }
}

const s1 = makeSession({ id: 'p1', title: 'Grammar talk' })
const s2 = makeSession({ id: 'r1', title: 'Ready session' })
const s3 = makeSession({ id: 'x1', title: 'No annotations' })

const allSessions = [s1, s2, s3]

describe('filterSessions — no query', () => {
  it('returns all sessions when query is empty', () => {
    expect(filterSessions(allSessions, { searchQuery: '' })).toHaveLength(3)
  })

  it('returns all sessions when query is whitespace-only', () => {
    expect(filterSessions(allSessions, { searchQuery: '   ' })).toHaveLength(3)
  })
})

describe('filterSessions — text search', () => {
  it('matches on title (case-insensitive)', () => {
    expect(filterSessions(allSessions, { searchQuery: 'grammar' }).map(s => s.id)).toEqual(['p1'])
  })

  it('is case-insensitive', () => {
    expect(filterSessions(allSessions, { searchQuery: 'GRAMMAR' }).map(s => s.id)).toEqual(['p1'])
  })

  it('returns empty when no title matches', () => {
    expect(filterSessions(allSessions, { searchQuery: 'xyz-no-match' })).toHaveLength(0)
  })
})
