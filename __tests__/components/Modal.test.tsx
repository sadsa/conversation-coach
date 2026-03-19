// __tests__/components/Modal.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '@/components/Modal'

describe('Modal', () => {
  it('renders children and title', () => {
    render(
      <Modal title={<span>Grammar</span>} onClose={() => {}}>
        <p>Correction content</p>
      </Modal>
    )
    expect(screen.getByText('Grammar')).toBeInTheDocument()
    expect(screen.getByText('Correction content')).toBeInTheDocument()
  })

  it('calls onClose when X button is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal title="Test" onClose={onClose}><p>Content</p></Modal>)
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal title="Test" onClose={onClose}><p>Content</p></Modal>)
    // Click the backdrop (the outermost element, not the card)
    await userEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT call onClose when card content is clicked', async () => {
    const onClose = vi.fn()
    render(<Modal title="Test" onClose={onClose}><p>Content</p></Modal>)
    await userEvent.click(screen.getByText('Content'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
