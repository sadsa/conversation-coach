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
}))

const baseItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'te elimina', correction: 'se te lleva',
  explanation: 'Wrong verb phrase.', sub_category: 'phrasing', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: 'it can [[flush out]] your electrolytes',
  flashcard_back: 'puede [[se te lleva]] los electrolitos',
  flashcard_note: '"Te elimina" sounds like a direct translation and is not natural in Rioplatense.',
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
    await userEvent.click(screen.getByTestId('advance-card'))
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

describe('FlashcardDeck — advance', () => {
  const item2: PracticeItem = {
    ...baseItem, id: 'item-2',
    flashcard_front: 'second card [[phrase]] here',
    flashcard_back: 'segunda [[tarjeta]] aquí',
  }

  it('advances to next card via test seam button', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    expect(screen.getByText('flush out')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('advance-card'))
    expect(screen.getByText('phrase')).toBeInTheDocument()
    expect(screen.queryByText('flush out')).not.toBeInTheDocument()
  })

  it('resets to front face when advancing', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    // Flip first card
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByTestId('flashcard-back')).toBeInTheDocument()
    // Advance
    await userEvent.click(screen.getByTestId('advance-card'))
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
  })

  it('loops back to first card after last', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    await userEvent.click(screen.getByTestId('advance-card')) // → card 2
    await userEvent.click(screen.getByTestId('advance-card')) // → loop to card 1
    expect(screen.getByText('flush out')).toBeInTheDocument()
  })

  it('goes back to previous card via test seam button', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    await userEvent.click(screen.getByTestId('advance-card')) // → card 2
    await userEvent.click(screen.getByTestId('go-back-card')) // → card 1
    expect(screen.getByText('flush out')).toBeInTheDocument()
  })

  it('wraps from first card to last when going back', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    await userEvent.click(screen.getByTestId('go-back-card')) // wrap → card 2
    expect(screen.getByText('phrase')).toBeInTheDocument()
  })

  it('resets to front face when going back', async () => {
    render(<FlashcardDeck items={[baseItem, item2]} />)
    await userEvent.click(screen.getByTestId('advance-card')) // → card 2
    await userEvent.click(screen.getByTestId('flashcard-card')) // flip to back
    await userEvent.click(screen.getByTestId('go-back-card')) // → card 1
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
  })
})

describe('FlashcardDeck — onDeleted prop', () => {
  it('renders without onDeleted prop (optional)', () => {
    render(<FlashcardDeck items={[baseItem]} />)
    expect(screen.getByTestId('flashcard-front')).toBeInTheDocument()
  })

  it('clamps currentIndex when items shrink below current position', async () => {
    const item2: PracticeItem = {
      ...baseItem, id: 'item-2',
      flashcard_front: 'second [[card]]',
      flashcard_back: 'segunda [[tarjeta]]',
    }
    const { rerender } = render(<FlashcardDeck items={[baseItem, item2]} onDeleted={vi.fn()} />)
    await userEvent.click(screen.getByTestId('advance-card'))
    expect(screen.getByText('card')).toBeInTheDocument()

    rerender(<FlashcardDeck items={[baseItem]} onDeleted={vi.fn()} />)

    expect(screen.getByText('flush out')).toBeInTheDocument()
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
