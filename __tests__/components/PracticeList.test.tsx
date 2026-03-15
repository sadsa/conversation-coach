import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'

const item: PracticeItem & { sessions?: { title: string; created_at: string } } = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'Yo fui', correction: 'Fui',
  explanation: 'Drop pronoun.', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  sessions: { title: 'Café con María', created_at: '2026-03-15' },
}

describe('PracticeList', () => {
  it('renders item with session title', () => {
    render(<PracticeList items={[item]} onToggleReviewed={() => {}} onDelete={() => {}} />)
    expect(screen.getByText(/Café con María/)).toBeInTheDocument()
    expect(screen.getByText('Fui')).toBeInTheDocument()
  })

  it('calls onToggleReviewed when checkbox is clicked', async () => {
    const onToggle = vi.fn()
    render(<PracticeList items={[item]} onToggleReviewed={onToggle} onDelete={() => {}} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith('item-1', true)
  })

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = vi.fn()
    render(<PracticeList items={[item]} onToggleReviewed={() => {}} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith('item-1')
  })

  it('filters by type', async () => {
    render(<PracticeList items={[item]} onToggleReviewed={() => {}} onDelete={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /naturalness/i }))
    expect(screen.getByText(/no items match/i)).toBeInTheDocument()
  })
})
