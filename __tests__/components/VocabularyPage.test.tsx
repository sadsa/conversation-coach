// __tests__/components/VocabularyPage.test.tsx
//
// Tests that VocabularyList orders items into study-status buckets
// (Due for review → To study → Studied) rather than grouping by session.
// Session provenance now lives in the review sheet, not as list headings.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { VocabularyList } from '@/components/VocabularyList'
import type { PracticeItem } from '@/lib/types'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/vocabulary',
}))

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true })
})

function makeItem(overrides: Partial<PracticeItem>): PracticeItem {
  return {
    id: 'item-1',
    session_id: 'sess-1',
    annotation_id: 'ann-1',
    type: 'grammar',
    sub_category: 'other',
    original: 'Yo fui',
    correction: 'Fui',
    explanation: 'Drop pronoun',
    reviewed: false,
    due: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    flashcard_front: null,
    flashcard_back: null,
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

describe('VocabularyList', () => {
  it('does NOT render session titles as list headings', () => {
    const items = [
      makeItem({ id: 'i1', session_id: 's1', session_title: 'Café con Valentina', correction: 'me resulta' }),
      makeItem({ id: 'i2', session_id: 's2', session_title: 'Trabajo remoto', correction: 'dale vamos' }),
    ]
    render(<VocabularyList items={items} onDeleted={vi.fn()} />)
    expect(screen.queryByText('Café con Valentina')).toBeNull()
    expect(screen.queryByText('Trabajo remoto')).toBeNull()
  })

  it('separates unstudied items into a "To study" bucket and studied into a "Studied" bucket', () => {
    const items = [
      makeItem({ id: 'i1', reviewed: false, correction: 'me resulta' }),
      makeItem({ id: 'i2', reviewed: true, correction: 'dale vamos' }),
    ]
    render(<VocabularyList items={items} onDeleted={vi.fn()} />)

    const toStudy = screen.getByTestId('vocabulary-bucket-toStudy')
    const studied = screen.getByTestId('vocabulary-bucket-studied')
    expect(within(toStudy).getByTestId('write-row-i1')).toBeInTheDocument()
    expect(within(studied).getByTestId('write-row-i2')).toBeInTheDocument()
  })

  it('surfaces due-for-review items in their own bucket, ahead of unstudied', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const items = [
      makeItem({ id: 'i1', reviewed: false, correction: 'one' }),
      makeItem({ id: 'i2', reviewed: true, due: past, correction: 'two' }),
    ]
    render(<VocabularyList items={items} onDeleted={vi.fn()} />)

    const due = screen.getByTestId('vocabulary-bucket-due')
    expect(within(due).getByTestId('write-row-i2')).toBeInTheDocument()

    // Due section renders before the To-study section in the DOM.
    const list = screen.getByTestId('vocabulary-list')
    const sections = within(list).getAllByTestId(/^vocabulary-bucket-/)
    expect(sections[0]).toHaveAttribute('data-testid', 'vocabulary-bucket-due')
  })

  it('omits empty buckets', () => {
    const items = [makeItem({ id: 'i1', reviewed: false })]
    render(<VocabularyList items={items} onDeleted={vi.fn()} />)
    expect(screen.getByTestId('vocabulary-bucket-toStudy')).toBeInTheDocument()
    expect(screen.queryByTestId('vocabulary-bucket-studied')).toBeNull()
    expect(screen.queryByTestId('vocabulary-bucket-due')).toBeNull()
  })
})
