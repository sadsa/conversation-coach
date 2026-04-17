// __tests__/components/PracticeList.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true })
})

const grammarItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'Yo fui', correction: 'Fui',
  explanation: 'Drop pronoun.', sub_category: 'other', reviewed: false,
  written_down: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
  importance_score: null, importance_note: null,
  segment_text: 'Ayer Yo fui al mercado con ella.',
  start_char: 5,
  end_char: 11,
}

const subjectiveItem: PracticeItem = {
  id: 'item-2', session_id: 's1', annotation_id: 'ann-2',
  type: 'grammar', original: 'vengas', correction: 'venís',
  explanation: 'Use indicative for asserted facts.', sub_category: 'subjunctive', reviewed: false,
  written_down: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
  importance_score: null, importance_note: null,
  segment_text: null, start_char: null, end_char: null,
}

const writtenItem: PracticeItem = {
  ...grammarItem,
  id: 'item-w',
  written_down: true,
  original: 'escrito',
  correction: 'correcto',
  segment_text: null,
  start_char: null,
  end_char: null,
}

describe('PracticeList — rows', () => {
  it('renders the correction prominently', () => {
    render(<PracticeList items={[grammarItem]} />)
    const row = screen.getByTestId(`practice-row-${grammarItem.id}`)
    expect(within(row).getByText('Fui')).toBeInTheDocument()
    // 'Yo fui' appears both in the row header and inside the context snippet,
    // so scope to the row's <p> with the strikethrough span.
    expect(within(row).getAllByText('Yo fui').length).toBeGreaterThan(0)
  })

  it('does not render the explanation in the row (only in the sheet)', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('renders a context snippet when segment_text is present', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.getByTestId(`context-snippet-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('omits the snippet when segment_text is null', () => {
    render(<PracticeList items={[subjectiveItem]} />)
    expect(screen.queryByTestId(`context-snippet-${subjectiveItem.id}`)).not.toBeInTheDocument()
  })
})

describe('PracticeList — segmented Active/Archive control', () => {
  it('defaults to the Active view and hides written items', () => {
    render(<PracticeList items={[grammarItem, writtenItem]} />)
    expect(screen.getByTestId(`practice-row-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`practice-row-${writtenItem.id}`)).not.toBeInTheDocument()
  })

  it('shows both Active and Archive tabs with counts', () => {
    render(<PracticeList items={[grammarItem, subjectiveItem, writtenItem]} />)
    const activeTab = screen.getByRole('tab', { name: /to write down/i })
    const archiveTab = screen.getByRole('tab', { name: /archive/i })
    expect(within(activeTab).getByText('2')).toBeInTheDocument()
    expect(within(archiveTab).getByText('1')).toBeInTheDocument()
  })

  it('switches to Archive view on click and shows only written items', async () => {
    render(<PracticeList items={[grammarItem, writtenItem]} />)
    await userEvent.click(screen.getByRole('tab', { name: /archive/i }))
    expect(screen.queryByTestId(`practice-row-${grammarItem.id}`)).not.toBeInTheDocument()
    expect(screen.getByTestId(`practice-row-${writtenItem.id}`)).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.getByRole('tab', { name: /to write down/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /archive/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('does not render legacy filter pills (sub-category, importance, written)', () => {
    render(<PracticeList items={[grammarItem, subjectiveItem]} />)
    expect(screen.queryByRole('button', { name: /^all$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more \+/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /importance/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verb conjugation/i })).not.toBeInTheDocument()
  })
})

describe('PracticeList — empty states', () => {
  it('shows the active empty copy when there is nothing to write down', () => {
    render(<PracticeList items={[writtenItem]} />)
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('shows the archive empty copy when there is nothing archived', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('tab', { name: /archive/i }))
    expect(screen.getByText(/items move to the archive/i)).toBeInTheDocument()
  })
})

describe('PracticeList — no swipe / bulk machinery', () => {
  it('does not expose a swipe-to-write test seam', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByTestId(`write-item-${grammarItem.id}`)).not.toBeInTheDocument()
  })

  it('does not render bulk-select checkboxes', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByRole('checkbox', { name: /select item/i })).not.toBeInTheDocument()
  })
})

describe('PracticeList — review sheet', () => {
  it('does not show the sheet by default', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByRole('complementary', { name: /review practice item/i })).not.toBeInTheDocument()
  })

  it('opens the sheet when a row is clicked', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    expect(screen.getByRole('complementary', { name: /review practice item/i })).toBeInTheDocument()
  })

  it('shows the explanation inside the sheet', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })

  it('renders a sheet-scoped context snippet', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    expect(screen.getByTestId(`context-snippet-sheet-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('closes when Escape is pressed', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('navigates to the next item with the Next button', async () => {
    render(<PracticeList items={[grammarItem, subjectiveItem]} />)
    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    await userEvent.click(screen.getByRole('button', { name: /next correction/i }))
    expect(screen.getByText('Use indicative for asserted facts.')).toBeInTheDocument()
  })
})

describe('PracticeList — mark as written from the sheet', () => {
  it('PATCHes written_down=true when the primary action is clicked in the active view', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<PracticeList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    await userEvent.click(screen.getByTestId('sheet-toggle-written'))

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ written_down: true }),
      }),
    )
  })

  it('removes the item from the active view after a successful mark', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<PracticeList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    expect(screen.queryByTestId(`practice-row-${grammarItem.id}`)).not.toBeInTheDocument()
  })

  it('shows an undo toast after marking as written', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<PracticeList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    const toast = screen.getByRole('alert')
    expect(within(toast).getByText(/moved to archive/i)).toBeInTheDocument()
    expect(within(toast).getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('Undo restores the item back to the active list', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<PracticeList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })
    expect(screen.queryByTestId(`practice-row-${grammarItem.id}`)).not.toBeInTheDocument()

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /undo/i }))
    })

    expect(screen.getByTestId(`practice-row-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('shows the move-back-to-list label in the archive view', async () => {
    render(<PracticeList items={[writtenItem]} />)
    await userEvent.click(screen.getByRole('tab', { name: /archive/i }))
    await userEvent.click(screen.getByTestId(`practice-row-${writtenItem.id}`))
    expect(screen.getByRole('button', { name: /move back to list/i })).toBeInTheDocument()
  })

  it('reverts the optimistic update and shows an error when the PATCH fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<PracticeList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    expect(screen.getByTestId(`practice-row-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't update/i)
  })
})

describe('PracticeList — delete from the sheet', () => {
  it('DELETEs the item and removes it from the list', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    const onDeleted = vi.fn()
    render(<PracticeList items={[grammarItem]} onDeleted={onDeleted} />)

    await userEvent.click(screen.getByTestId(`practice-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-delete'))
    })

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(onDeleted).toHaveBeenCalledWith([grammarItem.id])
    expect(screen.queryByTestId(`practice-row-${grammarItem.id}`)).not.toBeInTheDocument()
  })
})
