import type { SessionListItem } from '@/lib/types'

export type SessionStatusFilter = 'partial' | 'ready_to_study'

export interface SessionFilterState {
  statusFilters: SessionStatusFilter[]
  searchQuery: string
}

export function filterSessions(
  sessions: SessionListItem[],
  filter: SessionFilterState,
): SessionListItem[] {
  let result = sessions

  if (filter.searchQuery.trim()) {
    const q = filter.searchQuery.toLowerCase()
    result = result.filter(s => s.title.toLowerCase().includes(q))
  }

  if (filter.statusFilters.length > 0) {
    result = result.filter(s =>
      filter.statusFilters.some(status => s.review_state === status),
    )
  }

  return result
}
