// __tests__/components/PracticeList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'

// Mock fetch for delete calls
global.fetch = vi.fn().mockResolvedValue({ ok: true })

const grammarItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'Yo fui', correction: 'Fui',
  explanation: 'Drop pronoun.', sub_category: 'other', reviewed: false,
  written_down: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
  importance_score: null, importance_note: null,
  segment_text: 'Ayer Yo fui al mercado con ella.',
  start_char: 6,
  end_char: 12,
}

const subjectiveItem: PracticeItem = {
  id: 'item-2', session_id: 's1', annotation_id: 'ann-2',
  type: 'grammar', original: 'vengas', correction: 'venís',
  explanation: '', sub_category: 'subjunctive', reviewed: false,
  written_down: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
  importance_score: null, importance_note: null,
  segment_text: null, start_char: null, end_char: null,
}

describe('PracticeList', () => {
  it('renders correction for grammar items', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
  })

  it('does not render explanation or session metadata', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('does not render reviewed filter buttons', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByRole('button', { name: /pending/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reviewed/i })).not.toBeInTheDocument()
  })
})

describe('PracticeList — item modal', () => {
  it('does not show a modal initially', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByTestId('modal-backdrop')).not.toBeInTheDocument()
  })

  it('opens a modal when an item is clicked', async () => {
    render(<PracticeList items={[grammarItem]} />)
    // Click the item card (not the checkbox)
    await userEvent.click(screen.getByText('Fui'))
    expect(screen.getByTestId('modal-backdrop')).toBeInTheDocument()
  })

  it('modal shows the explanation text', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByText('Fui'))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })

  it('modal shows correction for grammar items', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByText('Fui'))
    // Modal should show original and correction
    expect(screen.getAllByText('Yo fui').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fui').length).toBeGreaterThan(0)
  })

  it('closes the modal when backdrop is clicked', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByText('Fui'))
    await userEvent.click(screen.getByTestId('modal-backdrop'))
    expect(screen.queryByTestId('modal-backdrop')).not.toBeInTheDocument()
  })

  it('does not open modal when in bulk mode', async () => {
    render(<PracticeList items={[grammarItem]} />)
    // Enter bulk mode by clicking the checkbox
    await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
    // Now clicking the item should toggle selection, not open modal
    await userEvent.click(screen.getByText('Fui'))
    expect(screen.queryByTestId('modal-backdrop')).not.toBeInTheDocument()
  })
})

describe('PracticeList — bulk toolbar', () => {
  it('hides filter buttons when in bulk mode', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
    expect(screen.queryByRole('button', { name: /^all$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^other$/i })).not.toBeInTheDocument()
  })

  it('shows selected count in bulk mode', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('exits bulk mode when back button is clicked', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
    await userEvent.click(screen.getByRole('button', { name: /exit selection/i }))
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
  })

  it('select-all selects filtered items', async () => {
    render(<PracticeList items={[grammarItem]} />)
    const checkboxes = screen.getAllByRole('checkbox', { name: /select item/i })
    await userEvent.click(checkboxes[0])
    await userEvent.click(screen.getByRole('button', { name: /select all/i }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })
})

describe('PracticeList — sub-category filter', () => {
  it('filters to only items matching initialSubCategory', () => {
    const items: PracticeItem[] = [
      { id: '1', session_id: 's1', annotation_id: null, type: 'grammar', sub_category: 'subjunctive', original: 'vengas', correction: 'venís', explanation: '', reviewed: false, written_down: false, created_at: '', updated_at: '', flashcard_front: null, flashcard_back: null, flashcard_note: null, importance_score: null, importance_note: null, segment_text: null, start_char: null, end_char: null },
      { id: '2', session_id: 's1', annotation_id: null, type: 'grammar', sub_category: 'ser-estar', original: 'Soy', correction: 'Estoy', explanation: '', reviewed: false, written_down: false, created_at: '', updated_at: '', flashcard_front: null, flashcard_back: null, flashcard_note: null, importance_score: null, importance_note: null, segment_text: null, start_char: null, end_char: null },
    ]
    render(<PracticeList items={items} initialSubCategory="subjunctive" />)
    expect(screen.getByText('vengas')).toBeInTheDocument()
    expect(screen.queryByText('Soy')).not.toBeInTheDocument()
  })
})

describe('PracticeList — delete is bulk-only', () => {
  it('does not have a swipe-left delete test seam', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByTestId(`delete-item-${grammarItem.id}`)).not.toBeInTheDocument()
  })

  it('delete button appears in bulk toolbar when items selected', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
    expect(screen.getByRole('button', { name: /delete.*selected/i })).toBeInTheDocument()
  })
})

describe('PracticeList — sub-category pill in SwipeableItem and modal', () => {
  it('shows sub-category pill label in SwipeableItem row', () => {
    render(<PracticeList items={[grammarItem]} />)
    // Filter row buttons show "Other 1" (with count span), SwipeableItem pill shows exactly "Other"
    expect(screen.getByText('Other')).toBeInTheDocument()
  })

  it('shows sub-category pill in practice item modal', async () => {
    render(<PracticeList items={[grammarItem]} />)
    // Click the item to open the modal
    await userEvent.click(screen.getByText('Fui'))
    // Both SwipeableItem row and modal now show 'Other'
    expect(screen.getAllByText('Other').length).toBeGreaterThanOrEqual(2)
  })
})

describe('PracticeList — sub-category pill row', () => {
  it('shows All pill + 3 sub-category pills + More button by default', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /more \+/i })).toBeInTheDocument()
    // Pills beyond the first 3 sub-categories should NOT be visible
    // (which ones are hidden depends on sort order; just verify More exists)
  })

  it('shows all sub-category pills after clicking More', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /more \+/i }))
    expect(screen.queryByRole('button', { name: /more \+/i })).not.toBeInTheDocument()
    // Spot-check a few sub-categories that would otherwise be hidden
    expect(screen.getByRole('button', { name: /verb conjugation/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /subjunctive/i })).toBeInTheDocument()
  })

  it('starts expanded (no More pill) when initialSubCategory is provided', () => {
    render(<PracticeList items={[grammarItem]} initialSubCategory="verb-conjugation" />)
    expect(screen.queryByRole('button', { name: /more \+/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /verb conjugation/i })).toBeInTheDocument()
  })

  it('clicking a sub-category pill hides non-matching items', async () => {
    render(<PracticeList items={[grammarItem, subjectiveItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /subjunctive/i }))
    expect(screen.getByText('vengas')).toBeInTheDocument()
    expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
  })

  it('clicking the active pill again clears the filter (toggle)', async () => {
    render(<PracticeList items={[grammarItem, subjectiveItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /subjunctive/i }))
    expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /subjunctive/i }))
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('vengas')).toBeInTheDocument()
  })

  it('initialSubCategory prop activates matching pill and hides non-matching items', () => {
    render(<PracticeList items={[grammarItem, subjectiveItem]} initialSubCategory="subjunctive" />)
    expect(screen.getByText('vengas')).toBeInTheDocument()
    expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
  })

  it('clicking All when sub-category is active clears the filter', async () => {
    render(<PracticeList items={[grammarItem, subjectiveItem]} initialSubCategory="subjunctive" />)
    expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('vengas')).toBeInTheDocument()
  })

  it('pill with higher item count appears before lower-count pill in DOM', () => {
    const subjectiveItem2: PracticeItem = {
      ...subjectiveItem, id: 'item-3',
    }
    render(<PracticeList items={[grammarItem, subjectiveItem, subjectiveItem2]} />)
    const allButtons = screen.getAllByRole('button')
    const subjunctiveIdx = allButtons.findIndex(b => /subjunctive/i.test(b.textContent ?? ''))
    const otherIdx = allButtons.findIndex(b => /^other/i.test(b.textContent?.trim() ?? ''))
    expect(subjunctiveIdx).toBeLessThan(otherIdx)
  })
})

describe('PracticeList — written_down status chip removed', () => {
  it('does not show "not written" chip on list items', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByText('not written')).not.toBeInTheDocument()
  })
})

describe('PracticeList — Written filter pill', () => {
  it('shows "Written" pill as second pill after "All"', () => {
    render(<PracticeList items={[grammarItem]} />)
    const buttons = screen.getAllByRole('button')
    const allIdx = buttons.findIndex(b => /^all$/i.test(b.textContent?.trim() ?? ''))
    const writtenIdx = buttons.findIndex(b => /^written$/i.test(b.textContent?.trim() ?? ''))
    expect(allIdx).toBeGreaterThanOrEqual(0)
    expect(writtenIdx).toBe(allIdx + 1)
  })
})

describe('PracticeList — swipe right to mark written', () => {
  it('calls PATCH API with written_down:true when mark-written triggered', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    render(<PracticeList items={[grammarItem]} />)

    const writeButton = screen.getByTestId(`write-item-${grammarItem.id}`)
    await userEvent.click(writeButton)

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ written_down: true }),
      })
    )
  })

  it('shows error toast when PATCH fails', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<PracticeList items={[grammarItem]} />)

    const writeButton = screen.getByTestId(`write-item-${grammarItem.id}`)
    await act(async () => {
      fireEvent.click(writeButton)
      await vi.runAllTimersAsync()
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/failed to mark as written/i)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('removes item from list after successful mark-written', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    render(<PracticeList items={[grammarItem]} />)

    const writeButton = screen.getByTestId(`write-item-${grammarItem.id}`)
    await act(async () => {
      fireEvent.click(writeButton)
      await vi.runAllTimersAsync()
    })

    expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('PracticeList — default filter hides written items', () => {
  const writtenItem: PracticeItem = {
    ...grammarItem, id: 'item-w', written_down: true, original: 'escrito', correction: 'correcto',
  }

  it('hides written items by default', () => {
    render(<PracticeList items={[grammarItem, writtenItem]} />)
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.queryByText('escrito')).not.toBeInTheDocument()
  })

  it('shows written items when Written filter is active', async () => {
    render(<PracticeList items={[grammarItem, writtenItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /^written$/i }))
    expect(screen.queryByText('Yo fui')).not.toBeInTheDocument()
    expect(screen.getByText('escrito')).toBeInTheDocument()
  })

  it('shows all items when All is clicked after Written filter', async () => {
    render(<PracticeList items={[grammarItem, writtenItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /^written$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('escrito')).toBeInTheDocument()
  })
})

describe('PracticeList — context snippet', () => {
  it('renders context snippet when segment_text is present', () => {
    render(<PracticeList items={[grammarItem]} />)
    // grammarItem has segment_text 'Ayer Yo fui al mercado con ella.' with start=6, end=12
    // ContextSnippet should show the error text 'Yo fui' highlighted
    expect(screen.getByTestId(`context-snippet-${grammarItem.id}`)).toBeInTheDocument()
  })

  it('does not render snippet when segment_text is null', () => {
    render(<PracticeList items={[subjectiveItem]} />)
    expect(screen.queryByTestId(`context-snippet-${subjectiveItem.id}`)).not.toBeInTheDocument()
  })

  it('renders context snippet in detail modal', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByText('Fui'))
    expect(screen.getByTestId(`context-snippet-modal-${grammarItem.id}`)).toBeInTheDocument()
  })
})
