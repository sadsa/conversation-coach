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
  session_title: 'Cafe with María',
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
  session_title: 'Cafe with María',
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
  it('renders the correction in context (sentence + struck wrong + inline rewrite)', () => {
    render(<WriteList items={[grammarItem]} />)
    const row = screen.getByTestId(`write-row-${grammarItem.id}`)
    // Wrong fragment + correction now both live inside the same sentence
    // block; they should each appear exactly once in the row.
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
    // Fallback still surfaces both halves of the correction so the user
    // sees the fix even without surrounding context.
    const row = screen.getByTestId(`write-row-${subjectiveItem.id}`)
    expect(within(row).getByText('vengas')).toBeInTheDocument()
    expect(within(row).getByText('venís')).toBeInTheDocument()
  })
})

describe('WriteList — view toggle (asymmetric Write surface + Written archive link)', () => {
  it('defaults to the Write view and hides written items', () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    expect(screen.getByTestId(`write-row-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`write-row-${writtenItem.id}`)).not.toBeInTheDocument()
  })

  it('does not render an aria tablist (Write is the surface, not a peer tab)', () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    // The old segmented control was role="tablist" with two role="tab"
    // children. The distill pass removes that equality.
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('renders a quiet "{n} written →" link in the Write view when an archive exists', () => {
    render(<WriteList items={[grammarItem, subjectiveItem, writtenItem]} />)
    const link = screen.getByTestId('view-toggle-to-written')
    expect(link).toHaveTextContent(/written/i)
    expect(within(link).getByText('1')).toBeInTheDocument()
  })

  it('does NOT render the archive link when nothing has been written yet', () => {
    render(<WriteList items={[grammarItem, subjectiveItem]} />)
    expect(screen.queryByTestId('view-toggle-to-written')).not.toBeInTheDocument()
  })

  it('switches to the Written view via the archive link and shows only written items', async () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    await userEvent.click(screen.getByTestId('view-toggle-to-written'))
    expect(screen.queryByTestId(`write-row-${grammarItem.id}`)).not.toBeInTheDocument()
    expect(screen.getByTestId(`write-row-${writtenItem.id}`)).toBeInTheDocument()
  })

  it('shows a "Back to Write" link in the Written view that returns to the queue', async () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    await userEvent.click(screen.getByTestId('view-toggle-to-written'))
    const back = screen.getByTestId('view-toggle-to-write')
    expect(back).toHaveTextContent(/back to write/i)

    await userEvent.click(back)
    expect(screen.getByTestId(`write-row-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`write-row-${writtenItem.id}`)).not.toBeInTheDocument()
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

  it('shows the Written empty copy when nothing has been marked yet', () => {
    // The archive link is suppressed when writtenCount is 0 (the surface
    // simply hides the destination), so the empty Written view is reached
    // via the initialView escape hatch — same surface the user would land
    // on if they came from a deep link.
    render(<WriteList items={[grammarItem]} initialView="written" />)
    expect(screen.getByText(/items you've written down land here/i)).toBeInTheDocument()
    // CTA points back to the Write queue (with its count) so the user
    // never gets stranded in an empty archive.
    expect(screen.getByRole('button', { name: /back to write \(1\)/i })).toBeInTheDocument()
  })

  it('shows the no-queue Written empty state when both views are empty', () => {
    render(<WriteList items={[]} initialView="written" />)
    expect(screen.getByText(/nothing in your write queue either/i)).toBeInTheDocument()
    // The empty-state itself does not offer a "back to write" CTA when
    // the other side is also empty — the ViewToggle still provides
    // navigation, but the empty card stays purely informational.
    const emptyCard = screen.getByText(/items you've written down/i).closest('div')!
    expect(within(emptyCard).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('WriteList — fast-path mark-written from the row', () => {
  it('renders a trailing mark-written button on Active rows', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.getByTestId(`row-mark-written-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('does not render the trailing button on Written-view rows', () => {
    render(<WriteList items={[writtenItem]} initialView="written" />)
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

  it('removes the row from the active list and stays silent on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[grammarItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`row-mark-written-${grammarItem.id}`))
    })

    // Row leaving the current tab is the confirmation. We deliberately don't
    // fire a success toast for mark-written — it was just noise.
    expect(screen.queryByTestId(`write-row-${grammarItem.id}`)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  it('renders the sheet-scoped correction-in-context block', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    expect(screen.getByTestId(`correction-in-context-sheet-${grammarItem.id}`)).toBeInTheDocument()
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

  it('removes the item from the active view after a successful mark and stays silent', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    expect(screen.queryByTestId(`write-row-${grammarItem.id}`)).not.toBeInTheDocument()
    // Success toast removed — the row leaving the tab is enough confirmation.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the move-back label in the Written view', async () => {
    render(<WriteList items={[writtenItem]} initialView="written" />)
    await userEvent.click(screen.getByTestId(`write-row-${writtenItem.id}`))
    expect(screen.getByRole('button', { name: /move.+correction back/i })).toBeInTheDocument()
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

  // Helper — open the sheet, then walk through the overflow menu to reach
  // Delete. Mirrors the user's actual two-tap path now that Delete lives
  // behind a `…` overflow rather than a side-by-side icon.
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

describe('WriteList — auto-advance from the sheet', () => {
  it('advances to the next item after Mark as written when one exists', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[grammarItem, subjectiveItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    // Sheet stays open on the next item rather than closing — Gmail-style.
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByText('Use indicative for asserted facts.')).toBeInTheDocument()
  })

  it('closes the sheet after marking the LAST item as written', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
})
