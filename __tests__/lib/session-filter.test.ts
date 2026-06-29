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

const partialSession = makeSession({ id: 'p1', title: 'Grammar talk', review_state: 'partial' })
const readySession = makeSession({ id: 'r1', title: 'Ready session', review_state: 'ready_to_study' })
const nothingKeptSession = makeSession({ id: 'n1', title: 'Nothing kept', review_state: 'nothing_kept' })
const nullStateSession = makeSession({ id: 'x1', title: 'No annotations', review_state: null })

const allSessions = [partialSession, readySession, nothingKeptSession, nullStateSession]

describe('filterSessions — no filters', () => {
  it('returns all sessions when no filters active', () => {
    const result = filterSessions(allSessions, { statusFilters: [], searchQuery: '' })
    expect(result).toHaveLength(4)
  })
})

describe('filterSessions — status filters', () => {
  it('partial filter returns only partial sessions', () => {
    const result = filterSessions(allSessions, { statusFilters: ['partial'], searchQuery: '' })
    expect(result.map(s => s.id)).toEqual(['p1'])
  })

  it('ready_to_study filter returns only ready_to_study sessions', () => {
    const result = filterSessions(allSessions, { statusFilters: ['ready_to_study'], searchQuery: '' })
    expect(result.map(s => s.id)).toEqual(['r1'])
  })

  it('multiple status filters are ORed', () => {
    const result = filterSessions(allSessions, {
      statusFilters: ['partial', 'ready_to_study'],
      searchQuery: '',
    })
    expect(result.map(s => s.id)).toEqual(['p1', 'r1'])
  })

  it('sessions with null review_state are excluded when any status filter is active', () => {
    const result = filterSessions(allSessions, { statusFilters: ['partial'], searchQuery: '' })
    expect(result.find(s => s.id === 'x1')).toBeUndefined()
  })

  it('returns empty when no sessions match the filter', () => {
    const result = filterSessions([nullStateSession], { statusFilters: ['partial'], searchQuery: '' })
    expect(result).toHaveLength(0)
  })
})

describe('filterSessions — text search', () => {
  it('matches on title (case-insensitive)', () => {
    const result = filterSessions(allSessions, { statusFilters: [], searchQuery: 'grammar' })
    expect(result.map(s => s.id)).toEqual(['p1'])
  })

  it('is case-insensitive', () => {
    const result = filterSessions(allSessions, { statusFilters: [], searchQuery: 'GRAMMAR' })
    expect(result.map(s => s.id)).toEqual(['p1'])
  })

  it('returns empty when no title matches', () => {
    const result = filterSessions(allSessions, { statusFilters: [], searchQuery: 'xyz-no-match' })
    expect(result).toHaveLength(0)
  })

  it('ignores whitespace-only query', () => {
    const result = filterSessions(allSessions, { statusFilters: [], searchQuery: '   ' })
    expect(result).toHaveLength(4)
  })
})

describe('filterSessions — combined filters', () => {
  it('applies both text search and status filter together (AND logic)', () => {
    const s1 = makeSession({ id: 'a', title: 'Grammar talk', review_state: 'partial' })
    const s2 = makeSession({ id: 'b', title: 'Grammar talk', review_state: 'ready_to_study' })
    const result = filterSessions([s1, s2], { statusFilters: ['partial'], searchQuery: 'grammar' })
    expect(result.map(s => s.id)).toEqual(['a'])
  })

  it('returns empty when status filter matches but text search does not', () => {
    const result = filterSessions([partialSession], { statusFilters: ['partial'], searchQuery: 'xyz' })
    expect(result).toHaveLength(0)
  })
})
