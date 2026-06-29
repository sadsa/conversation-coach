import { describe, it, expect } from 'vitest'
import { filterVocabularyItems } from '@/lib/vocabulary-filter'
import type { PracticeItem } from '@/lib/types'

const now = new Date()
const past = new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString()
const future = new Date(now.getTime() + 1000 * 60 * 60 * 24).toISOString()

function makeItem(overrides: Partial<PracticeItem>): PracticeItem {
  return {
    id: 'item-1',
    session_id: 's1',
    annotation_id: 'ann-1',
    type: 'grammar',
    sub_category: 'other',
    original: 'Yo fui',
    correction: 'Fui',
    explanation: 'Drop pronoun',
    reviewed: false,
    due: null,
    source: 'annotation',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    flashcard_front: 'I [[went]] to the market.',
    flashcard_back: '[[Fui]] al mercado.',
    flashcard_note: null,
    importance_score: null,
    importance_note: null,
    segment_text: null,
    start_char: null,
    end_char: null,
    session_title: 'Session A',
    ...overrides,
  }
}

const unstudiedItem = makeItem({ id: 'unstudied', reviewed: false, due: null })
const studiedItem = makeItem({ id: 'studied', reviewed: true, due: past })
const dueItem = makeItem({ id: 'due', reviewed: false, due: past })
const futureItem = makeItem({ id: 'future', reviewed: false, due: future })

const allItems = [unstudiedItem, studiedItem, dueItem, futureItem]

describe('filterVocabularyItems — no filters', () => {
  it('returns all items when no filters active', () => {
    const result = filterVocabularyItems(allItems, { statusFilters: [], searchQuery: '' })
    expect(result).toHaveLength(4)
  })
})

describe('filterVocabularyItems — status filters', () => {
  it('unstudied returns only items where reviewed = false', () => {
    const result = filterVocabularyItems(allItems, { statusFilters: ['unstudied'], searchQuery: '' })
    expect(result.map(i => i.id)).toEqual(['unstudied', 'due', 'future'])
  })

  it('studied returns only items where reviewed = true', () => {
    const result = filterVocabularyItems(allItems, { statusFilters: ['studied'], searchQuery: '' })
    expect(result.map(i => i.id)).toEqual(['studied'])
  })

  it('due returns only items where due <= now', () => {
    const result = filterVocabularyItems(allItems, { statusFilters: ['due'], searchQuery: '' })
    expect(result.map(i => i.id)).toEqual(['studied', 'due'])
  })

  it('multiple status filters are ORed', () => {
    const result = filterVocabularyItems(allItems, {
      statusFilters: ['unstudied', 'studied'],
      searchQuery: '',
    })
    expect(result.map(i => i.id)).toEqual(['unstudied', 'studied', 'due', 'future'])
  })

  it('items with no due date are excluded from due filter', () => {
    const result = filterVocabularyItems(
      [unstudiedItem],
      { statusFilters: ['due'], searchQuery: '' },
    )
    expect(result).toHaveLength(0)
  })
})

describe('filterVocabularyItems — text search', () => {
  const item1 = makeItem({ id: 'a', flashcard_back: '[[Fui]] al mercado.', correction: 'Fui' })
  const item2 = makeItem({ id: 'b', flashcard_back: '[[Dale]] vamos.', correction: 'Dale' })

  it('matches on flashcard_back (case-insensitive)', () => {
    const result = filterVocabularyItems([item1, item2], { statusFilters: [], searchQuery: 'mercado' })
    expect(result.map(i => i.id)).toEqual(['a'])
  })

  it('matches on correction field', () => {
    const result = filterVocabularyItems([item1, item2], { statusFilters: [], searchQuery: 'dale' })
    expect(result.map(i => i.id)).toEqual(['b'])
  })

  it('is case-insensitive', () => {
    const result = filterVocabularyItems([item1, item2], { statusFilters: [], searchQuery: 'MERCADO' })
    expect(result.map(i => i.id)).toEqual(['a'])
  })

  it('returns empty when no match', () => {
    const result = filterVocabularyItems([item1, item2], { statusFilters: [], searchQuery: 'xyz' })
    expect(result).toHaveLength(0)
  })

  it('ignores whitespace-only query', () => {
    const result = filterVocabularyItems([item1, item2], { statusFilters: [], searchQuery: '   ' })
    expect(result).toHaveLength(2)
  })

  it('falls back to correction when flashcard_back is null', () => {
    const noFlashcard = makeItem({ id: 'c', flashcard_back: null, correction: 'por las dudas' })
    const result = filterVocabularyItems([noFlashcard], { statusFilters: [], searchQuery: 'dudas' })
    expect(result.map(i => i.id)).toEqual(['c'])
  })
})

describe('filterVocabularyItems — combined filters', () => {
  it('applies both text search and status filter together', () => {
    const itemA = makeItem({ id: 'a', reviewed: false, flashcard_back: '[[Fui]] al mercado.' })
    const itemB = makeItem({ id: 'b', reviewed: true, flashcard_back: '[[Fui]] al mercado.' })
    const result = filterVocabularyItems([itemA, itemB], {
      statusFilters: ['unstudied'],
      searchQuery: 'mercado',
    })
    expect(result.map(i => i.id)).toEqual(['a'])
  })
})
