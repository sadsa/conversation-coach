import type { PracticeItem } from '@/lib/types'

export type VocabularyStatusFilter = 'unstudied' | 'due' | 'studied'

export interface VocabularyFilterState {
  statusFilters: VocabularyStatusFilter[]
  searchQuery: string
}

export function filterVocabularyItems(
  items: PracticeItem[],
  filter: VocabularyFilterState,
): PracticeItem[] {
  let result = items

  if (filter.searchQuery.trim()) {
    const q = filter.searchQuery.toLowerCase()
    result = result.filter(item => {
      const back = item.flashcard_back?.toLowerCase() ?? ''
      const correction = item.correction?.toLowerCase() ?? ''
      return back.includes(q) || correction.includes(q)
    })
  }

  if (filter.statusFilters.length > 0) {
    const now = new Date()
    result = result.filter(item =>
      filter.statusFilters.some(status => {
        switch (status) {
          case 'unstudied': return !item.reviewed
          case 'due': return item.due != null && new Date(item.due) <= now
          case 'studied': return item.reviewed
        }
      }),
    )
  }

  return result
}
