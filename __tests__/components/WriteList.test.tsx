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

describe('WriteList — rows', () => {
  it('renders the correction prominently', () => {
    render(<WriteList items={[grammarItem]} />)
    const row = screen.getByTestId(`write-row-${grammarItem.id}`)
    expect(within(row).getByText('Fui')).toBeInTheDocument()
    // 'Yo fui' appears both in the row header and inside the context snippet,
    // so scope to the row's <p> with the strikethrough span.
    expect(within(row).getAllByText('Yo fui').length).toBeGreaterThan(0)
  })

  it('does not render the explanation in the row (only in the sheet)', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('renders a context snippet when segment_text is present', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.getByTestId(`context-snippet-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('omits the snippet when segment_text is null', () => {
    render(<WriteList items={[subjectiveItem]} />)
    expect(screen.queryByTestId(`context-snippet-${subjectiveItem.id}`)).not.toBeInTheDocument()
  })
})

describe('WriteList — segmented Write/Written control', () => {
  it('defaults to the Active view and hides written items', () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    expect(screen.getByTestId(`write-row-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`write-row-${writtenItem.id}`)).not.toBeInTheDocument()
  })

  it('shows both Write and Written tabs with counts', () => {
    render(<WriteList items={[grammarItem, subjectiveItem, writtenItem]} />)
    // Match the Write tab on its leading label so it doesn't also match "Written".
    const writeTab = screen.getByRole('tab', { name: /^write\b/i })
    const writtenTab = screen.getByRole('tab', { name: /written/i })
    expect(within(writeTab).getByText('2')).toBeInTheDocument()
    expect(within(writtenTab).getByText('1')).toBeInTheDocument()
  })

  it('switches to the Written view on click and shows only written items', async () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    await userEvent.click(screen.getByRole('tab', { name: /written/i }))
    expect(screen.queryByTestId(`write-row-${grammarItem.id}`)).not.toBeInTheDocument()
    expect(screen.getByTestId(`write-row-${writtenItem.id}`)).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.getByRole('tab', { name: /^write\b/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /written/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('does not render legacy filter pills (sub-category, importance, written)', () => {
    render(<WriteList items={[grammarItem, subjectiveItem]} />)
    expect(screen.queryByRole('button', { name: /^all$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more \+/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /importance/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /verb conjugation/i })).not.toBeInTheDocument()
  })
})

describe('WriteList — empty states', () => {
  it('shows the teaching empty-state with example + CTA when nothing to write down', () => {
    render(<WriteList items={[writtenItem]} />)
    expect(screen.getByText(/saved corrections look like this/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start a session/i })).toBeInTheDocument()
  })

  it('shows the Written empty copy when nothing has been marked yet', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('tab', { name: /written/i }))
    expect(screen.getByText(/once you mark them as written/i)).toBeInTheDocument()
  })
})

describe('WriteList — fast-path mark-written from the row', () => {
  it('renders a trailing mark-written button on Active rows', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.getByTestId(`row-mark-written-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('does not render the trailing button on Written-view rows', async () => {
    render(<WriteList items={[writtenItem]} />)
    await userEvent.click(screen.getByRole('tab', { name: /written/i }))
    expect(screen.queryByTestId(`row-mark-written-${writtenItem.id}`)).not.toBeInTheDocument()
  })

  it('PATCHes written_down=true without opening the sheet when the trailing button is clicked', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`row-mark-written-${grammarItem.id}`))
    })

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ written_down: true }),
      }),
    )
  })

  it('removes the row from the active list and shows the undo toast', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[grammarItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`row-mark-written-${grammarItem.id}`))
    })

    expect(screen.queryByTestId(`write-row-${grammarItem.id}`)).not.toBeInTheDocument()
    const toast = screen.getByRole('alert')
    expect(within(toast).getByText(/moved to written/i)).toBeInTheDocument()
    expect(within(toast).getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })
})

describe('WriteList — no swipe / bulk machinery', () => {
  it('does not expose a swipe-to-write test seam', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByTestId(`write-item-${grammarItem.id}`)).not.toBeInTheDocument()
  })

  it('does not render bulk-select checkboxes', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByRole('checkbox', { name: /select item/i })).not.toBeInTheDocument()
  })
})

describe('WriteList — review sheet', () => {
  it('does not show the sheet by default', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByRole('complementary', { name: /review saved correction/i })).not.toBeInTheDocument()
  })

  it('opens the sheet when the row body is clicked', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    expect(screen.getByRole('complementary', { name: /review saved correction/i })).toBeInTheDocument()
  })

  it('shows the explanation inside the sheet', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })

  it('renders a sheet-scoped context snippet', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    expect(screen.getByTestId(`context-snippet-sheet-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('closes when Escape is pressed', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('navigates to the next item with the Next button', async () => {
    render(<WriteList items={[grammarItem, subjectiveItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await userEvent.click(screen.getByRole('button', { name: /next correction/i }))
    expect(screen.getByText('Use indicative for asserted facts.')).toBeInTheDocument()
  })
})

describe('WriteList — mark as written from the sheet', () => {
  it('PATCHes written_down=true when the primary action is clicked in the active view', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
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
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    expect(screen.queryByTestId(`write-row-${grammarItem.id}`)).not.toBeInTheDocument()
  })

  it('shows an undo toast after marking as written', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    const toast = screen.getByRole('alert')
    expect(within(toast).getByText(/moved to written/i)).toBeInTheDocument()
    expect(within(toast).getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('Undo restores the item back to the active list', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })
    expect(screen.queryByTestId(`write-row-${grammarItem.id}`)).not.toBeInTheDocument()

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /undo/i }))
    })

    expect(screen.getByTestId(`write-row-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('shows the move-back label in the Written view', async () => {
    render(<WriteList items={[writtenItem]} />)
    await userEvent.click(screen.getByRole('tab', { name: /written/i }))
    await userEvent.click(screen.getByTestId(`write-row-${writtenItem.id}`))
    expect(screen.getByRole('button', { name: /move back/i })).toBeInTheDocument()
  })

  it('reverts the optimistic update and shows an error when the PATCH fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    expect(screen.getByTestId(`write-row-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't update/i)
  })
})

describe('WriteList — delete with undo window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('hides the row immediately and shows an undo toast (no DELETE yet)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-delete'))
    })

    expect(screen.queryByTestId(`write-row-${grammarItem.id}`)).not.toBeInTheDocument()
    const toast = screen.getByRole('alert')
    expect(within(toast).getByText(/deleted/i)).toBeInTheDocument()
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

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-delete'))
    })

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

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-delete'))
    })

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

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-delete'))
    })

    await act(async () => {
      vi.advanceTimersByTime(5500)
      await Promise.resolve()
    })

    expect(screen.getByTestId(`write-row-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't delete/i)
  })
})
