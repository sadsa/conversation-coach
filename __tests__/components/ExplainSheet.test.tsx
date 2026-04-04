// __tests__/components/ExplainSheet.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExplainSheet } from '@/components/ExplainSheet'
import React from 'react'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onDragEnd, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
      React.createElement('div', { ...rest }, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  original: 'te elimina',
  correction: 'se te lleva',
  note: '"Te elimina" sounds like a direct translation.',
}

describe('ExplainSheet', () => {
  it('renders nothing when isOpen is false', () => {
    render(<ExplainSheet {...defaultProps} isOpen={false} />)
    expect(screen.queryByTestId('explain-sheet')).not.toBeInTheDocument()
  })

  it('renders sheet content when isOpen is true', () => {
    render(<ExplainSheet {...defaultProps} />)
    expect(screen.getByTestId('explain-sheet')).toBeInTheDocument()
  })

  it('displays original text', () => {
    render(<ExplainSheet {...defaultProps} />)
    expect(screen.getByText('te elimina')).toBeInTheDocument()
  })

  it('displays correction text', () => {
    render(<ExplainSheet {...defaultProps} />)
    expect(screen.getByText('se te lleva')).toBeInTheDocument()
  })

  it('displays — when correction is null', () => {
    render(<ExplainSheet {...defaultProps} correction={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('displays the note text', () => {
    render(<ExplainSheet {...defaultProps} />)
    expect(screen.getByText(/"Te elimina" sounds like a direct translation/)).toBeInTheDocument()
  })

  it('hides divider and note when note is empty', () => {
    render(<ExplainSheet {...defaultProps} note="" />)
    expect(screen.queryByText(/"Te elimina" sounds like a direct translation/)).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<ExplainSheet {...defaultProps} onClose={onClose} />)
    await userEvent.click(screen.getByTestId('explain-sheet-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
