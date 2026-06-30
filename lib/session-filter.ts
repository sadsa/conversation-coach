import type { SessionListItem } from '@/lib/types'

export interface SessionFilterState {
  searchQuery: string
}

export function filterSessions(
  sessions: SessionListItem[],
  filter: SessionFilterState,
): SessionListItem[] {
  if (!filter.searchQuery.trim()) return sessions
  const q = filter.searchQuery.toLowerCase()
  return sessions.filter(s => s.title.toLowerCase().includes(q))
}
