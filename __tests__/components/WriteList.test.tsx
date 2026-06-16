// __tests__/components/WriteList.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WriteList } from '@/components/WriteList'
import type { PracticeItem } from '@/lib/types'

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true })
})

const grammarItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'Yo fui', correction: 'Fui',
  explanation: 'Drop pronoun.', sub_category: 'other', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
  importance_score: null, importance_note: null,
  segment_text: 'Ayer Yo fui al mercado con ella.',
  start_char: 5,
  end_char: 11,
  session_title: 'Cafe with María',
}

const subjectiveItem: PracticeItem = {
  id: 'item-2', session_id: 's1', annotation_id: 'ann-2',
  type: 'grammar', original: 'vengas', correction: 'venís',
  explanation: 'Use indicative for asserted facts.', sub_category: 'subjunctive', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
  importance_score: null, importance_note: null,
  segment_text: null, start_char: null, end_char: null,
  session_title: 'Cafe with María',
}

// Item with flashcard fields — exercises the Concept-A row rendering.
const flashcardItem: PracticeItem = {
  ...grammarItem,
  id: 'item-fc',
  flashcard_front: 'I [[went]] to the market yesterday.',
  flashcard_back: '[[Fui]] al mercado ayer.',
  flashcard_note: 'Drop the redundant pronoun in Rioplatense.',
}

// Helper: open the ⋮ row menu for a given item id.
async function openRowMenu(itemId: string) {
  await userEvent.click(screen.getByTestId(`write-row-menu-${itemId}`))
}

describe('WriteList — rows', () => {
  it('renders the correction in context (sentence + struck wrong + inline rewrite)', () => {
    render(<WriteList items={[grammarItem]} />)
    const row = screen.getByTestId(`write-row-${grammarItem.id}`)
    expect(within(row).getByText('Yo fui')).toBeInTheDocument()
    expect(within(row).getByText('Fui')).toBeInTheDocument()
  })

  it('does not render the explanation in the row (only in the sheet)', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('renders the combined correction-in-context block when segment_text is present', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.getByTestId(`correction-in-context-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('falls back to the bare strike pair when segment_text is null', () => {
    render(<WriteList items={[subjectiveItem]} />)
    expect(screen.queryByTestId(`correction-in-context-${subjectiveItem.id}`)).not.toBeInTheDocument()
    const row = screen.getByTestId(`write-row-${subjectiveItem.id}`)
    expect(within(row).getByText('vengas')).toBeInTheDocument()
    expect(within(row).getByText('venís')).toBeInTheDocument()
  })

  it('prefers the FlashcardRow rendering when flashcard_front/back are present', () => {
    render(<WriteList items={[flashcardItem]} />)
    expect(screen.getByTestId(`flashcard-row-${flashcardItem.id}`)).toBeInTheDocument()
    expect(
      screen.queryByTestId(`correction-in-context-${flashcardItem.id}`),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId(`flashcard-row-${flashcardItem.id}-front`))
      .toHaveTextContent('I went to the market yesterday.')
    expect(screen.getByTestId(`flashcard-row-${flashcardItem.id}-back`))
      .toHaveTextContent('Fui al mercado ayer.')
  })
})

describe('WriteList — flat list (no studied divider)', () => {
  it('renders all items in a single flat list', () => {
    render(<WriteList items={[grammarItem, subjectiveItem]} />)
    expect(screen.getByTestId(`write-row-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`write-row-${subjectiveItem.id}`)).toBeInTheDocument()
  })

  it('does NOT render a studied divider', () => {
    render(<WriteList items={[grammarItem, subjectiveItem]} />)
    expect(screen.queryByTestId('studied-divider')).not.toBeInTheDocument()
  })

  it('does not render an aria tablist (no view toggle)', () => {
    render(<WriteList items={[grammarItem, subjectiveItem]} />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('does not render legacy filter pills (sub-category, importance)', () => {
    render(<WriteList items={[grammarItem, subjectiveItem]} />)
    expect(screen.queryByRole('button', { name: /^all$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more \+/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /importance/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verb conjugation/i })).not.toBeInTheDocument()
  })
})

describe('WriteList — empty state', () => {
  it('shows the empty state when there are no items at all', () => {
    render(<WriteList items={[]} />)
    expect(screen.getByText(/saved corrections look like this/i)).toBeInTheDocument()
  })

  it('does not show the empty state when items exist', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByText(/saved corrections look like this/i)).not.toBeInTheDocument()
  })
})

describe('WriteList — row context menu', () => {
  it('renders a ⋮ menu button on every row', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.getByTestId(`write-row-menu-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('menu is closed by default (delete button not visible)', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByTestId(`row-delete-${grammarItem.id}`)).not.toBeInTheDocument()
  })

  it('opens the menu and shows only Delete (no mark-studied)', async () => {
    render(<WriteList items={[grammarItem]} />)
    await openRowMenu(grammarItem.id)
    expect(screen.getByTestId(`row-delete-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`row-mark-written-${grammarItem.id}`)).not.toBeInTheDocument()
  })

  it('does not render bulk-select checkboxes', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByRole('checkbox', { name: /select item/i })).not.toBeInTheDocument()
  })
})

describe('WriteList — delete via row menu', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function clickMenuDelete(itemId: string) {
    await openRowMenu(itemId)
    await act(async () => {
      await userEvent.click(screen.getByTestId(`row-delete-${itemId}`))
    })
  }

  it('shows an undo toast immediately without firing DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await clickMenuDelete(grammarItem.id)

    const toast = screen.getByRole('alert')
    expect(within(toast).getByText(/removed/i)).toBeInTheDocument()
    expect(within(toast).getByRole('button', { name: /undo/i })).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('fires DELETE and notifies onDeleted after the undo window expires', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    const onDeleted = vi.fn()
    render(<WriteList items={[grammarItem]} onDeleted={onDeleted} />)

    await clickMenuDelete(grammarItem.id)

    await act(async () => {
      vi.advanceTimersByTime(5500)
      await Promise.resolve()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(onDeleted).toHaveBeenCalledWith([grammarItem.id])
  })

  it('Undo prevents the DELETE from firing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    const onDeleted = vi.fn()
    render(<WriteList items={[grammarItem]} onDeleted={onDeleted} />)

    await clickMenuDelete(grammarItem.id)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    })

    await act(async () => {
      vi.advanceTimersByTime(5500)
      await Promise.resolve()
    })

    expect(mockFetch).not.toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(onDeleted).not.toHaveBeenCalled()
  })
})

describe('WriteList — review sheet', () => {
  it('does not show the sheet by default', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByRole('dialog', { name: /review saved correction/i })).not.toBeInTheDocument()
  })

  it('opens the sheet when the row body is clicked', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    expect(screen.getByRole('dialog', { name: /review saved correction/i })).toBeInTheDocument()
  })

  it('shows the explanation inside the sheet', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })

  it('renders the Hush stack (You said + original + correction) inside the sheet', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    const sheet = screen.getByRole('dialog', { name: /review saved correction/i })
    expect(within(sheet).getByText(/you said/i)).toBeInTheDocument()
    expect(within(sheet).getByText(grammarItem.original)).toBeInTheDocument()
    expect(within(sheet).getByText(grammarItem.correction!)).toBeInTheDocument()
  })

  it('closes when Escape is pressed', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('navigates to the next item with the Next button', async () => {
    render(<WriteList items={[grammarItem, subjectiveItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await userEvent.click(screen.getByRole('button', { name: /next correction/i }))
    expect(screen.getByText('Use indicative for asserted facts.')).toBeInTheDocument()
  })
})

describe('WriteList — delete with undo window (from sheet)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function openSheetAndDelete(itemId: string) {
    await userEvent.click(screen.getByTestId(`write-row-${itemId}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-delete'))
    })
  }

  it('hides the row immediately and shows an undo toast (no DELETE yet)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await openSheetAndDelete(grammarItem.id)

    expect(screen.queryByTestId(`write-row-${grammarItem.id}`)).not.toBeInTheDocument()
    const toast = screen.getByRole('alert')
    expect(within(toast).getByText(/removed/i)).toBeInTheDocument()
    expect(within(toast).getByRole('button', { name: /undo/i })).toBeInTheDocument()

    expect(mockFetch).not.toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('fires DELETE and notifies onDeleted after the undo window expires', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    const onDeleted = vi.fn()
    render(<WriteList items={[grammarItem]} onDeleted={onDeleted} />)

    await openSheetAndDelete(grammarItem.id)

    await act(async () => {
      vi.advanceTimersByTime(5500)
      await Promise.resolve()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(onDeleted).toHaveBeenCalledWith([grammarItem.id])
  })

  it('Undo restores the row and prevents the DELETE from firing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    const onDeleted = vi.fn()
    render(<WriteList items={[grammarItem]} onDeleted={onDeleted} />)

    await openSheetAndDelete(grammarItem.id)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    })
    expect(screen.getByTestId(`write-row-${grammarItem.id}`)).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(5500)
      await Promise.resolve()
    })

    expect(mockFetch).not.toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('restores the row + shows an error toast when the deferred DELETE fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await openSheetAndDelete(grammarItem.id)

    await act(async () => {
      vi.advanceTimersByTime(5500)
      await Promise.resolve()
    })

    expect(screen.getByTestId(`write-row-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't delete/i)
  })
})
