// __tests__/components/PracticeList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PracticeList } from '@/components/PracticeList'
import type { PracticeItem } from '@/lib/types'

// Mock fetch for delete calls
global.fetch = vi.fn().mockResolvedValue({ ok: true })

const grammarItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'Yo fui', correction: 'Fui',
  explanation: 'Drop pronoun.', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
}
const strengthItem: PracticeItem = {
  id: 'item-2', session_id: 's1', annotation_id: 'ann-2',
  type: 'strength', original: 'Dale, vamos', correction: null,
  explanation: 'Natural Argentine expression.', reviewed: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
}

describe('PracticeList', () => {
  it('renders correction for grammar items', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
  })

  it('renders original (no correction) for strength items', () => {
    render(<PracticeList items={[strengthItem]} />)
    expect(screen.getByText(/Dale, vamos/)).toBeInTheDocument()
    expect(screen.queryByText('→')).not.toBeInTheDocument()
  })

  it('does not render explanation or session metadata', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByText('Drop pronoun.')).not.toBeInTheDocument()
  })

  it('filters by type', async () => {
    render(<PracticeList items={[grammarItem, strengthItem]} />)
    await userEvent.click(screen.getByRole('button', { name: /naturalness/i }))
    expect(screen.getByText(/no items match/i)).toBeInTheDocument()
  })

  it('does not render reviewed filter buttons', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByRole('button', { name: /pending/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reviewed/i })).not.toBeInTheDocument()
  })
})
