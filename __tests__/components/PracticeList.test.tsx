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
  created_at: '2026-03-15', updated_at: '2026-03-15',
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

  it('filters by type', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /naturalness/i }))
    expect(screen.getByText(/no items match/i)).toBeInTheDocument()
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
  it('shows filter buttons when not in bulk mode', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /grammar/i })).toBeInTheDocument()
  })

  it('hides filter buttons when in bulk mode', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
    expect(screen.queryByRole('button', { name: /^all$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^grammar$/i })).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
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
      { id: '1', session_id: 's1', annotation_id: null, type: 'grammar', sub_category: 'subjunctive', original: 'vengas', correction: 'venís', explanation: '', reviewed: false, created_at: '', updated_at: '' },
      { id: '2', session_id: 's1', annotation_id: null, type: 'grammar', sub_category: 'ser-estar', original: 'Soy', correction: 'Estoy', explanation: '', reviewed: false, created_at: '', updated_at: '' },
    ]
    render(<PracticeList items={items} initialSubCategory="subjunctive" />)
    expect(screen.getByText('vengas')).toBeInTheDocument()
    expect(screen.queryByText('Soy')).not.toBeInTheDocument()
  })

  it('clears sub-category filter when a type tab is clicked', async () => {
    const items: PracticeItem[] = [
      { id: '1', session_id: 's1', annotation_id: null, type: 'grammar', sub_category: 'subjunctive', original: 'vengas', correction: 'venís', explanation: '', reviewed: false, created_at: '', updated_at: '' },
      { id: '2', session_id: 's1', annotation_id: null, type: 'naturalness', sub_category: 'phrasing', original: 'qué tal', correction: null, explanation: '', reviewed: false, created_at: '', updated_at: '' },
    ]
    render(<PracticeList items={items} initialSubCategory="subjunctive" />)
    // Initially filtered to subjunctive only
    expect(screen.getByText('vengas')).toBeInTheDocument()
    expect(screen.queryByText('qué tal')).not.toBeInTheDocument()
    // Click "All" tab
    await userEvent.click(screen.getByRole('button', { name: /all/i }))
    // Both items now visible
    expect(screen.getByText('vengas')).toBeInTheDocument()
    expect(screen.getByText('qué tal')).toBeInTheDocument()
  })
})

describe('PracticeList — swipe delete', () => {
  it('calls DELETE API when onDelete is triggered', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    const onDeleted = vi.fn()
    render(<PracticeList items={[grammarItem]} onDeleted={onDeleted} />)

    const deleteButton = screen.getByTestId(`delete-item-${grammarItem.id}`)
    await userEvent.click(deleteButton)

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      { method: 'DELETE' }
    )
  })

  it('shows error toast when DELETE fails', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<PracticeList items={[grammarItem]} />)

    const deleteButton = screen.getByTestId(`delete-item-${grammarItem.id}`)
    // fireEvent is used here because userEvent deadlocks with vi.useFakeTimers()
    await act(async () => {
      fireEvent.click(deleteButton)
      await vi.runAllTimersAsync()
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/couldn't delete/i)).toBeInTheDocument()
    vi.useRealTimers()
  })
})
