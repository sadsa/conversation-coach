// __tests__/components/WriteItDownSheet.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WriteItDownSheet } from '@/components/WriteItDownSheet'
import type { Annotation } from '@/lib/types'
import React from 'react'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onDragEnd, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
      React.createElement('div', { ...rest }, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const annotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'fui', start_char: 0, end_char: 3,
  correction: 'anduve', explanation: 'Use "andar" when moving around on foot.',
  sub_category: 'verb-conjugation',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
}

const defaultProps = {
  isOpen: true,
  annotation,
  onConfirm: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
}

beforeEach(() => vi.resetAllMocks())
afterEach(() => vi.useRealTimers())

describe('WriteItDownSheet', () => {
  it('renders nothing when isOpen is false', () => {
    render(<WriteItDownSheet {...defaultProps} isOpen={false} />)
    expect(screen.queryByTestId('write-it-down-sheet')).not.toBeInTheDocument()
  })

  it('renders sheet when isOpen is true', () => {
    render(<WriteItDownSheet {...defaultProps} />)
    expect(screen.getByTestId('write-it-down-sheet')).toBeInTheDocument()
  })

  it('shows original and correction', () => {
    render(<WriteItDownSheet {...defaultProps} />)
    expect(screen.getByText('fui')).toBeInTheDocument()
    expect(screen.getByText('anduve')).toBeInTheDocument()
  })

  it('shows explanation text', () => {
    render(<WriteItDownSheet {...defaultProps} />)
    expect(screen.getByText('Use "andar" when moving around on foot.')).toBeInTheDocument()
  })

  it('shows all 3 writing prompts', () => {
    render(<WriteItDownSheet {...defaultProps} />)
    expect(screen.getByText(/sentence you'd actually say/i)).toBeInTheDocument()
    expect(screen.getByText(/question using voseo/i)).toBeInTheDocument()
    expect(screen.getByText(/past or future tense/i)).toBeInTheDocument()
  })

  it('confirm button is disabled before checkbox is ticked', () => {
    render(<WriteItDownSheet {...defaultProps} />)
    expect(screen.getByTestId('write-it-down-confirm')).toBeDisabled()
  })

  it('confirm button is enabled after checkbox is ticked', async () => {
    render(<WriteItDownSheet {...defaultProps} />)
    await userEvent.click(screen.getByTestId('write-it-down-checkbox'))
    expect(screen.getByTestId('write-it-down-confirm')).not.toBeDisabled()
  })

  it('calls onConfirm and shows success label when confirmed', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<WriteItDownSheet {...defaultProps} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByTestId('write-it-down-checkbox'))
    await userEvent.click(screen.getByTestId('write-it-down-confirm'))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.getByTestId('write-it-down-confirm')).toHaveTextContent(/flashcard created/i)
  })

  it('calls onClose after 1500ms following confirm', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<WriteItDownSheet {...defaultProps} onClose={onClose} onConfirm={onConfirm} />)
    // fireEvent is used here because userEvent deadlocks with vi.useFakeTimers()
    await act(async () => {
      fireEvent.click(screen.getByTestId('write-it-down-checkbox'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('write-it-down-confirm'))
    })
    // Flush pending microtasks so onConfirm promise resolves and setTimeout is registered
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1500) })
    expect(onClose).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<WriteItDownSheet {...defaultProps} onClose={onClose} />)
    await userEvent.click(screen.getByTestId('write-it-down-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('resets checked and success state when reopened', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<WriteItDownSheet {...defaultProps} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByTestId('write-it-down-checkbox'))
    // Close then reopen
    rerender(<WriteItDownSheet {...defaultProps} onConfirm={onConfirm} isOpen={false} />)
    rerender(<WriteItDownSheet {...defaultProps} onConfirm={onConfirm} isOpen={true} />)
    expect(screen.getByTestId('write-it-down-confirm')).toBeDisabled()
  })
})
