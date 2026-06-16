// __tests__/components/VocabularyPage.test.tsx
//
// Tests that VocabularyList groups items by session name.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  it('shows a section heading for each distinct session', () => {
    const items = [
      makeItem({ id: 'i1', session_id: 's1', session_title: 'Café con Valentina' }),
      makeItem({ id: 'i2', session_id: 's2', session_title: 'Trabajo remoto' }),
    ]
    render(<VocabularyList items={items} onDeleted={vi.fn()} />)
    expect(screen.getByText('Café con Valentina')).toBeDefined()
    expect(screen.getByText('Trabajo remoto')).toBeDefined()
  })

  it('shows only one heading when multiple items share a session', () => {
    const items = [
      makeItem({ id: 'i1', session_id: 's1', session_title: 'Mi sesión', correction: 'me resulta' }),
      makeItem({ id: 'i2', session_id: 's1', session_title: 'Mi sesión', correction: 'dale vamos' }),
      makeItem({ id: 'i3', session_id: 's2', session_title: 'Otra sesión', correction: 'por las dudas' }),
    ]
    render(<VocabularyList items={items} onDeleted={vi.fn()} />)
    const headings = screen.getAllByRole('heading', { name: 'Mi sesión' })
    expect(headings).toHaveLength(1)
  })
})
