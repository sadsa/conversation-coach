// __tests__/components/FlashcardDeck.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlashcardDeck } from '@/components/FlashcardDeck'
import type { PracticeItem } from '@/lib/types'
import React, { useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onDragStart, onDragEnd, onClick, style, animate, drag, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
      React.createElement('div', { onClick, ...rest }, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAnimationControls: () => ({ start: vi.fn().mockResolvedValue(undefined), set: vi.fn() }),
  useMotionValue: (_initial: number) => ({ get: vi.fn(), set: vi.fn() }),
  useTransform: () => 0,
}))

const baseItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'te elimina', correction: 'se te lleva',
  explanation: 'Wrong verb phrase.', sub_category: 'phrasing', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: 'it can [[flush out]] your electrolytes',
  flashcard_back: 'puede [[se te lleva]] los electrolitos',
  flashcard_note: '"Te elimina" sounds like a direct translation and is not natural in Rioplatense.',
  written_down: true,
  fsrs_state: null, due: null, stability: null, difficulty: null,
  elapsed_days: null, scheduled_days: null, reps: null, lapses: null, last_review: null,
}

describe('FlashcardDeck — front face', () => {
  it('renders front face by default', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
    expect(screen.queryByTestId('flashcard-back')).not.toBeInTheDocument()
  })

  it('renders highlighted phrase on front', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.getByText('flush out')).toBeInTheDocument()
  })

  it('renders plain text when no brackets in flashcard_front', () => {
    const item = { ...baseItem, flashcard_front: 'no brackets here' }
    render(<FlashcardDeck items={[item]} />)
    expect(screen.getByText('no brackets here')).toBeInTheDocument()
  })

  it('shows "Tap to reveal Spanish" hint on front', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.getByText(/tap to reveal spanish/i)).toBeInTheDocument()
  })
})

describe('FlashcardDeck — flip', () => {
  it('flips to back face on card click', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByTestId('flashcard-back')).toBeInTheDocument()
    expect(screen.queryByTestId('flashcard-front')).not.toBeInTheDocument()
  })

  it('flips back to front on second click', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
  })

  it('renders highlighted phrase on back', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByText('se te lleva')).toBeInTheDocument()
  })
})

describe('FlashcardDeck — tappable phrase', () => {
  it('does not show the explain button on any face', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.queryByRole('button', { name: /explain this/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByRole('button', { name: /explain this/i })).not.toBeInTheDocument()
  })

  it('shows "tap green to explain" hint on back face', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByText(/tap green to explain/i)).toBeInTheDocument()
  })

  it('does not show hint on front face', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.queryByText(/tap green to explain/i)).not.toBeInTheDocument()
  })

  it('opens explain sheet when green phrase is tapped', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    expect(screen.getByTestId('explain-sheet')).toBeInTheDocument()
  })

  it('opens explain sheet when flashcard_note is null', async () => {
    const item = { ...baseItem, flashcard_note: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    expect(screen.getByTestId('explain-sheet')).toBeInTheDocument()
  })

  it('shows original and correction inside sheet', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    expect(screen.getByText('te elimina')).toBeInTheDocument()
    expect(screen.getAllByText('se te lleva').length).toBeGreaterThan(0)
    expect(screen.getByText(/"Te elimina" sounds like a direct translation/)).toBeInTheDocument()
  })

  it('shows — in sheet when correction is null', async () => {
    const item = { ...baseItem, correction: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('closes sheet when backdrop is clicked', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    await userEvent.click(screen.getByTestId('explain-sheet-backdrop'))
    expect(screen.queryByTestId('explain-sheet')).not.toBeInTheDocument()
  })

  it('resets sheet when advancing to next card', async () => {
    const item2: PracticeItem = {
      ...baseItem, id: 'item-2',
      flashcard_front: 'second card [[phrase]] here',
      flashcard_back: 'segunda [[tarjeta]] aquí',
    }
    render(<FlashcardDeck items={[baseItem, item2]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    expect(screen.getByTestId('explain-sheet')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('rate-good'))
    expect(screen.queryByTestId('explain-sheet')).not.toBeInTheDocument()
  })

  it('resets sheet when flipping card back to front', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByTestId('flashcard-back-phrase'))
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByTestId('explain-sheet')).not.toBeInTheDocument()
  })
})

describe('FlashcardDeck — rating and progress', () => {
  const item2: PracticeItem = {
    ...baseItem, id: 'item-2',
    flashcard_front: 'second card [[phrase]] here',
    flashcard_back: 'segunda [[tarjeta]] aquí',
    fsrs_state: 'Review' as const,
    due: new Date(Date.now() - 1000).toISOString(),
  }

  it('calls onRate with rating 3 when rate-good is clicked', async () => {
    const onRate = vi.fn()
    render(<FlashcardDeck items={[baseItem]} onRate={onRate} />)
    await userEvent.click(screen.getByTestId('rate-good'))
    expect(onRate).toHaveBeenCalledWith('item-1', 3)
  })

  it('calls onRate with rating 1 when rate-again is clicked', async () => {
    const onRate = vi.fn()
    render(<FlashcardDeck items={[baseItem]} onRate={onRate} />)
    await userEvent.click(screen.getByTestId('rate-again'))
    expect(onRate).toHaveBeenCalledWith('item-1', 1)
  })

  it('advances to next card after rating', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    expect(screen.getByText('flush out')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('rate-good'))
    expect(screen.getByText('phrase')).toBeInTheDocument()
    expect(screen.queryByText('flush out')).not.toBeInTheDocument()
  })

  it('resets to front face when rating and advancing', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByTestId('flashcard-back')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('rate-good'))
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
  })

  it('shows caught-up screen after rating the last card', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('rate-good'))
    expect(screen.getByTestId('caught-up-screen')).toBeInTheDocument()
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('shows caught-up screen after rating-again on last card', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('rate-again'))
    expect(screen.getByTestId('caught-up-screen')).toBeInTheDocument()
  })

  it('does not loop back to first card after last', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    await userEvent.click(screen.getByTestId('rate-good'))
    await userEvent.click(screen.getByTestId('rate-good'))
    expect(screen.getByTestId('caught-up-screen')).toBeInTheDocument()
    expect(screen.queryByText('flush out')).not.toBeInTheDocument()
  })
})

describe('FlashcardDeck — onDeleted prop', () => {
  it('renders without onDeleted prop (optional)', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
  })

  it('shows caught-up screen when items shrink below current position', async () => {
    const item2: PracticeItem = {
      ...baseItem, id: 'item-2',
      flashcard_front: 'second [[card]]',
      flashcard_back: 'segunda [[tarjeta]]',
    }
    const { rerender } = render(<FlashcardDeck items={[baseItem, item2]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByTestId('rate-good'))
    expect(screen.getByText('card')).toBeInTheDocument()

    rerender(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)

    expect(screen.getByTestId('caught-up-screen')).toBeInTheDocument()
  })
})

describe('FlashcardDeck — three-dot menu', () => {
  it('renders the ⋮ menu button', () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    expect(screen.getByRole('button', { name: /card options/i })).toBeInTheDocument()
  })

  it('dropdown is not visible initially', () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    expect(screen.queryByTestId('card-menu-dropdown')).not.toBeInTheDocument()
  })

  it('opens dropdown when ⋮ button is clicked', async () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    expect(screen.getByTestId('card-menu-dropdown')).toBeInTheDocument()
  })

  it('shows "Skip card" and "Delete card" in dropdown', async () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    expect(screen.getByRole('button', { name: /skip card/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete card/i })).toBeInTheDocument()
  })

  it('closes dropdown when backdrop is clicked', async () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByTestId('card-menu-backdrop'))
    expect(screen.queryByTestId('card-menu-dropdown')).not.toBeInTheDocument()
  })

  it('closes dropdown when Escape is pressed', async () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('card-menu-dropdown')).not.toBeInTheDocument()
  })
})

function FlashcardsDeleteHost() {
  const { t } = useTranslation()
  const [items, setItems] = useState<PracticeItem[]>([baseItem])
  if (items.length === 0) {
    return <p data-testid="flashcards-empty">{t('flashcards.empty')}</p>
  }
  return (
    <FlashcardDeck
      items={items}
      onDeleted={id => setItems(prev => prev.filter(i => i.id !== id))}
    />
  )
}

describe('FlashcardDeck — caught-up screen next review', () => {
  it('shows next review time when nextReviewAt is provided', async () => {
    // Any non-null/undefined ISO string should render the next-review-line
    const nextReviewAt = new Date(Date.now() + 3600_000).toISOString()
    render(<FlashcardDeck items={[baseItem]} nextReviewAt={nextReviewAt} />)
    await userEvent.click(screen.getByTestId('rate-good'))
    expect(screen.getByTestId('caught-up-screen')).toBeInTheDocument()
    expect(screen.getByTestId('next-review-line')).toBeInTheDocument()
  })

  it('does not show next review line when nextReviewAt is undefined', async () => {
    render(<FlashcardDeck items={[baseItem]} nextReviewAt={undefined} />)
    await userEvent.click(screen.getByTestId('rate-good'))
    expect(screen.queryByTestId('next-review-line')).not.toBeInTheDocument()
  })

  it('does not show next review line when nextReviewAt is null', async () => {
    render(<FlashcardDeck items={[baseItem]} nextReviewAt={null} />)
    await userEvent.click(screen.getByTestId('rate-good'))
    expect(screen.queryByTestId('next-review-line')).not.toBeInTheDocument()
  })
})

describe('FlashcardDeck — delete confirm sheet', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens confirm sheet when "Delete card" is clicked', async () => {
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    expect(screen.getByTestId('delete-confirm-sheet')).toBeInTheDocument()
    expect(screen.getByText(/delete this flashcard/i)).toBeInTheDocument()
  })

  it('closes confirm sheet and does not call fetch on Cancel', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByTestId('delete-confirm-sheet')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls DELETE /api/practice-items/:id and invokes onDeleted on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const onDeleted = vi.fn()
    render(<FlashcardDeck items={[baseItem]} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(fetch).toHaveBeenCalledWith('/api/practice-items/item-1', { method: 'DELETE' })
    expect(onDeleted).toHaveBeenCalledWith('item-1')
    expect(screen.queryByTestId('delete-confirm-sheet')).not.toBeInTheDocument()
  })

  it('shows inline error and keeps card when API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const onDeleted = vi.fn()
    render(<FlashcardDeck items={[baseItem]} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText(/couldn't delete/i)).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByTestId('delete-confirm-sheet')).toBeInTheDocument()
  })

  it('shows inline error and keeps card when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const onDeleted = vi.fn()
    render(<FlashcardDeck items={[baseItem]} onDeleted={onDeleted} />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText(/couldn't delete/i)).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('deleting last card shows empty message when parent filters items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    render(<FlashcardsDeleteHost />)
    await userEvent.click(screen.getByRole('button', { name: /card options/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete card/i }))
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByTestId('flashcards-empty')).toBeInTheDocument()
    expect(screen.getByText(/no flashcards yet/i)).toBeInTheDocument()
  })
})
