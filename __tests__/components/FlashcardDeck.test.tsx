// __tests__/components/FlashcardDeck.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlashcardDeck } from '@/components/FlashcardDeck'
import type { PracticeItem } from '@/lib/types'

vi.mock('react-swipeable', () => ({
  useSwipeable: () => ({}),
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

describe('FlashcardDeck — note panel', () => {
  it('note body is hidden by default on back face', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByText(/"Te elimina" sounds/)).not.toBeInTheDocument()
  })

  it('shows note body after clicking Why?', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    await userEvent.click(screen.getByRole('button', { name: /why\?/i }))
    expect(screen.getByText(/"Te elimina" sounds like a direct translation/)).toBeInTheDocument()
  })

  it('shows original and correction in note header', async () => {
    render(<FlashcardDeck items={[baseItem]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByText('te elimina')).toBeInTheDocument()
    expect(screen.getAllByText('se te lleva').length).toBeGreaterThan(0)
  })

  it('shows — when correction is null', async () => {
    const item = { ...baseItem, correction: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('hides note panel entirely when flashcard_note is null', async () => {
    const item = { ...baseItem, flashcard_note: null }
    render(<FlashcardDeck items={[item]} />)
    await userEvent.click(screen.getByTestId('flashcard-card'))
    expect(screen.queryByRole('button', { name: /why\?/i })).not.toBeInTheDocument()
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
})
