// __tests__/components/StudyPrompt.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StudyPrompt } from '@/components/StudyPrompt'
import { LanguageProvider } from '@/components/LanguageProvider'

function wrap(props: React.ComponentProps<typeof StudyPrompt>) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <StudyPrompt {...props} />
    </LanguageProvider>
  )
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof StudyPrompt>> = {}) {
  return {
    count: 0,
    onLaunchStudy: vi.fn(),
    onFinishReview: vi.fn(),
    ...overrides,
  }
}

describe('StudyPrompt', () => {
  it('renders the bar even when count is 0', () => {
    const { container } = wrap(defaultProps({ count: 0 }))
    expect(container.firstChild).not.toBeNull()
  })

  it('never renders "Save a phrase" in any state', () => {
    wrap(defaultProps({ count: 0 }))
    expect(screen.queryByText('Save a phrase')).not.toBeInTheDocument()
  })

  it('never renders "Save a phrase" even when count > 0', () => {
    wrap(defaultProps({ count: 3 }))
    expect(screen.queryByText('Save a phrase')).not.toBeInTheDocument()
  })

  it('shows partial empty-state copy when count is 0 and reviewState is partial', () => {
    wrap(defaultProps({ count: 0, reviewState: 'partial' }))
    expect(screen.getByText(/keep going/i)).toBeInTheDocument()
    expect(screen.queryByText(/nothing saved/i)).not.toBeInTheDocument()
  })

  it('shows nothing_kept empty-state copy when count is 0 and reviewState is nothing_kept', () => {
    wrap(defaultProps({ count: 0, reviewState: 'nothing_kept' }))
    expect(screen.getByText(/nothing saved/i)).toBeInTheDocument()
    expect(screen.queryByText(/keep going/i)).not.toBeInTheDocument()
  })

  it('falls back to partial copy when count is 0 and reviewState is not provided', () => {
    wrap(defaultProps({ count: 0 }))
    expect(screen.getByText(/keep going/i)).toBeInTheDocument()
  })

  it('shows "Study" as primary action when count >= 1', () => {
    wrap(defaultProps({ count: 1 }))
    const buttons = screen.getAllByRole('button')
    expect(buttons.some(b => b.textContent?.includes('Study'))).toBe(true)
  })

  it('does not show the Study button when count is 0', () => {
    wrap(defaultProps({ count: 0, reviewState: 'partial' }))
    const buttons = screen.getAllByRole('button')
    expect(buttons.every(b => !b.textContent?.includes('Study'))).toBe(true)
  })

  it('shows phrase count text when at least one phrase saved', () => {
    wrap(defaultProps({ count: 3 }))
    expect(screen.getByText('3 phrases saved')).toBeInTheDocument()
  })

  it('uses the singular status string when count is 1', () => {
    wrap(defaultProps({ count: 1 }))
    expect(screen.getByText('1 phrase saved')).toBeInTheDocument()
  })

  it('calls onLaunchStudy when Study button clicked', async () => {
    const onLaunchStudy = vi.fn()
    wrap(defaultProps({ count: 2, onLaunchStudy }))
    const studyBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('Study'))
    await userEvent.click(studyBtn!)
    expect(onLaunchStudy).toHaveBeenCalledOnce()
  })

  it('calls onFinishReview when "Finish review" clicked', async () => {
    const onFinishReview = vi.fn()
    wrap(defaultProps({ count: 0, onFinishReview }))
    const btn = screen.getAllByRole('button').find(b => b.textContent?.includes('Finish review'))
    await userEvent.click(btn!)
    expect(onFinishReview).toHaveBeenCalledOnce()
  })
})
