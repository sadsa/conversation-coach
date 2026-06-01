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

// Item with flashcard fields — exercises the Concept-A row rendering.
// Both front and back use the [[double-bracket]] phrase convention that
// Claude already produces.
const flashcardItem: PracticeItem = {
  ...grammarItem,
  id: 'item-fc',
  flashcard_front: 'I [[went]] to the market yesterday.',
  flashcard_back: '[[Fui]] al mercado ayer.',
  flashcard_note: 'Drop the redundant pronoun in Rioplatense.',
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

  it('prefers the FlashcardRow rendering when flashcard_front/back are present', () => {
    // Items written after migration 20260325 carry the flashcard fields.
    // The Study row should use the native-prompt / target-answer pair
    // and skip the source-sentence correction-in-context treatment (the
    // sheet body still uses CorrectionInContext — that's by design).
    render(<WriteList items={[flashcardItem]} />)
    expect(screen.getByTestId(`flashcard-row-${flashcardItem.id}`)).toBeInTheDocument()
    expect(
      screen.queryByTestId(`correction-in-context-${flashcardItem.id}`),
    ).not.toBeInTheDocument()
    // Both lines render: native sentence above, target sentence below.
    expect(screen.getByTestId(`flashcard-row-${flashcardItem.id}-front`))
      .toHaveTextContent('I went to the market yesterday.')
    expect(screen.getByTestId(`flashcard-row-${flashcardItem.id}-back`))
      .toHaveTextContent('Fui al mercado ayer.')
  })
})

describe('WriteList — inline studied section', () => {
  it('renders active items and studied items in the same list', () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    expect(screen.getByTestId(`write-row-${grammarItem.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`write-row-${writtenItem.id}`)).toBeInTheDocument()
  })

  it('renders the studied divider when studied items exist', () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    expect(screen.getByTestId('studied-divider')).toBeInTheDocument()
  })

  it('does NOT render the studied divider when no items are studied', () => {
    render(<WriteList items={[grammarItem, subjectiveItem]} />)
    expect(screen.queryByTestId('studied-divider')).not.toBeInTheDocument()
  })

  it('does not render an aria tablist (no view toggle)', () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('does not render legacy archive footer link', () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    expect(screen.queryByTestId('view-toggle-to-written')).not.toBeInTheDocument()
  })

  it('does not render legacy back-to-study link', () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    expect(screen.queryByTestId('view-toggle-to-write')).not.toBeInTheDocument()
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
    // The empty-state CTA sends users to `/` (the Practise picker) —
    // the methodology's entry point. They pick a mode, have a
    // conversation, save a correction from the transcript, and it
    // lands back in this Study queue. The link briefly pointed at
    // /review during the home redesign, but the inbox is also empty
    // for first-time users and "open a conversation" promised a list
    // they didn't have — Practise is the surface that actually
    // generates the first correction.
    const link = screen.getByRole('link', { name: /practise to save/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
  })

  it('shows empty-state AND studied section when queue is empty but studied items exist', () => {
    render(<WriteList items={[writtenItem]} />)
    // Active queue is empty — show the teaching empty state
    expect(screen.getByText(/saved corrections look like this/i)).toBeInTheDocument()
    // Studied item still visible below
    expect(screen.getByTestId(`write-row-${writtenItem.id}`)).toBeInTheDocument()
  })

  it('shows only the empty state when there are no items at all', () => {
    render(<WriteList items={[]} />)
    expect(screen.getByText(/saved corrections look like this/i)).toBeInTheDocument()
    expect(screen.queryByTestId('studied-divider')).not.toBeInTheDocument()
  })
})

describe('WriteList — fast-path mark-written from the row', () => {
  it('renders a trailing mark-studied button on active rows', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.getByTestId(`row-mark-written-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('renders a trailing un-study button on studied rows', () => {
    render(<WriteList items={[writtenItem]} />)
    expect(screen.getByTestId(`row-mark-written-${writtenItem.id}`)).toBeInTheDocument()
  })

  it('PATCHes written_down=true without opening the sheet when the trailing button is clicked on an active row', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`row-mark-written-${grammarItem.id}`))
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ written_down: true }),
      }),
    )
  })

  it('PATCHes written_down=false when the trailing button is clicked on a studied row', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[writtenItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`row-mark-written-${writtenItem.id}`))
    })

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${writtenItem.id}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ written_down: false }),
      }),
    )
  })

  it('moves a studied item back to the active section after un-study', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[writtenItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`row-mark-written-${writtenItem.id}`))
    })

    // Item is now active — divider should be gone (no more studied items)
    expect(screen.queryByTestId('studied-divider')).not.toBeInTheDocument()
    // The empty state disappears too since the item is now active
    expect(screen.queryByText(/saved corrections look like this/i)).not.toBeInTheDocument()
  })

  it('moves an active item to the studied section after mark-studied, stays silent', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[grammarItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`row-mark-written-${grammarItem.id}`))
    })

    // Item is now studied — divider appears
    expect(screen.getByTestId('studied-divider')).toBeInTheDocument()
    // Success is silent — no toast
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('WriteList — swipe gesture seams', () => {
  it('exposes a swipe-delete seam button on every row', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.getByTestId(`swipe-delete-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('exposes a swipe-mark-written seam button on active rows', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.getByTestId(`swipe-mark-written-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('does NOT expose swipe-mark-written seam button on studied rows', () => {
    render(<WriteList items={[writtenItem]} />)
    expect(screen.queryByTestId(`swipe-mark-written-${writtenItem.id}`)).not.toBeInTheDocument()
  })

  it('does not render bulk-select checkboxes', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByRole('checkbox', { name: /select item/i })).not.toBeInTheDocument()
  })
})

describe('WriteList — swipe-left delete', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows an undo toast immediately without firing DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`swipe-delete-${grammarItem.id}`))
    })

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

    await act(async () => {
      await userEvent.click(screen.getByTestId(`swipe-delete-${grammarItem.id}`))
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

  it('Undo prevents the DELETE from firing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    const onDeleted = vi.fn()
    render(<WriteList items={[grammarItem]} onDeleted={onDeleted} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`swipe-delete-${grammarItem.id}`))
    })

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

describe('WriteList — swipe-right mark written', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows an undo toast immediately without firing PATCH', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`swipe-mark-written-${grammarItem.id}`))
    })

    const toast = screen.getByRole('alert')
    expect(within(toast).getByText(/studied/i)).toBeInTheDocument()
    expect(within(toast).getByRole('button', { name: /undo/i })).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('fires PATCH written_down=true after the undo window expires', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`swipe-mark-written-${grammarItem.id}`))
    })

    await act(async () => {
      vi.advanceTimersByTime(5500)
      await Promise.resolve()
    })

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ written_down: true }),
      }),
    )
  })

  it('Undo prevents the PATCH from firing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId(`swipe-mark-written-${grammarItem.id}`))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    })

    await act(async () => {
      vi.advanceTimersByTime(5500)
      await Promise.resolve()
    })

    expect(mockFetch).not.toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({ method: 'PATCH' }),
    )
  })
})

describe('WriteList — swipe hint', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the swipe hint in write view when the localStorage key is absent', () => {
    render(<WriteList items={[grammarItem]} />)
    expect(screen.getByText(/swipe left to delete/i)).toBeInTheDocument()
  })

  it('does not render the hint when the localStorage key is already set', () => {
    localStorage.setItem('cc:write-swipe-hint:v1', '1')
    render(<WriteList items={[grammarItem]} />)
    expect(screen.queryByText(/swipe left to delete/i)).not.toBeInTheDocument()
  })

  it('dismisses the hint and sets the localStorage key on "Got it" click', async () => {
    render(<WriteList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(screen.queryByText(/swipe left to delete/i)).not.toBeInTheDocument()
    expect(localStorage.getItem('cc:write-swipe-hint:v1')).toBe('1')
  })

  it('does not render the hint on the empty state', () => {
    render(<WriteList items={[]} />)
    expect(screen.queryByText(/swipe left to delete/i)).not.toBeInTheDocument()
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
    // The CorrectionInContext block was retired from the sheet body when
    // WriteSheet adopted the Hush direction — the sheet now opens with a
    // tracked-uppercase "You said" eyebrow, the italic struck original, and
    // a large serif answer below. Surrounding-sentence context lives back
    // on /sessions/[id] via the source link above the stack.
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

  it('opens a studied item from the studied section', async () => {
    render(<WriteList items={[grammarItem, writtenItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${writtenItem.id}`))
    expect(screen.getByRole('dialog', { name: /review saved correction/i })).toBeInTheDocument()
  })
})

describe('WriteList — mark as written from the sheet', () => {
  it('PATCHes written_down=true when the primary action is clicked in the active view', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    // Toggle-written is now in the overflow menu
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    await userEvent.click(screen.getByTestId('sheet-toggle-written'))

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ written_down: true }),
      }),
    )
  })

  it('moves the item to the studied section after a successful mark, stays silent', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    // Toggle-written is now in the overflow menu
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    // Item moves to studied section — divider appears
    expect(screen.getByTestId('studied-divider')).toBeInTheDocument()
    // Success toast removed — the row moving is confirmation enough.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the move-back label in the sheet when opened from the studied section', async () => {
    render(<WriteList items={[writtenItem]} />)
    await userEvent.click(screen.getByTestId(`write-row-${writtenItem.id}`))
    // Toggle-written is now in the overflow menu
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    expect(screen.getByTestId('sheet-toggle-written')).toHaveTextContent(/move back/i)
  })

  it('reverts the optimistic update and shows an error when the PATCH fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    // Toggle-written is now in the overflow menu
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
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
    // Toggle-written is now in the overflow menu
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    // Sheet stays open on the next item rather than closing — Gmail-style.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Use indicative for asserted facts.')).toBeInTheDocument()
  })

  it('closes the sheet after marking the LAST active item as written', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<WriteList items={[grammarItem]} />)

    await userEvent.click(screen.getByTestId(`write-row-${grammarItem.id}`))
    // Toggle-written is now in the overflow menu
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
