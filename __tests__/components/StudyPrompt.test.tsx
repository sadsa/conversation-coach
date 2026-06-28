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
    onSavePhrase: vi.fn(),
    onFinishReview: vi.fn(),
    ...overrides,
  }
}

describe('StudyPrompt', () => {
  it('renders the bar even when count is 0', () => {
    const { container } = wrap(defaultProps({ count: 0 }))
    expect(container.firstChild).not.toBeNull()
    expect(screen.getByText('Save a phrase')).toBeInTheDocument()
  })

  it('shows "Save a phrase" as primary and "Finish review" as secondary when count is 0', () => {
    wrap(defaultProps({ count: 0 }))
    const buttons = screen.getAllByRole('button')
    const labels = buttons.map(b => b.textContent)
    expect(labels.some(l => l?.includes('Save a phrase'))).toBe(true)
    expect(labels.some(l => l?.includes('Finish review'))).toBe(true)
    expect(labels.every(l => !l?.includes('Study'))).toBe(true)
  })

  it('shows "Study" as primary when count >= 1', () => {
    wrap(defaultProps({ count: 1 }))
    const buttons = screen.getAllByRole('button')
    expect(buttons.some(b => b.textContent?.includes('Study'))).toBe(true)
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

  it('calls onSavePhrase when "Save a phrase" clicked', async () => {
    const onSavePhrase = vi.fn()
    wrap(defaultProps({ count: 0, onSavePhrase }))
    const btn = screen.getAllByRole('button').find(b => b.textContent?.includes('Save a phrase'))
    await userEvent.click(btn!)
    expect(onSavePhrase).toHaveBeenCalledOnce()
  })

  it('calls onFinishReview when "Finish review" clicked', async () => {
    const onFinishReview = vi.fn()
    wrap(defaultProps({ count: 0, onFinishReview }))
    const btn = screen.getAllByRole('button').find(b => b.textContent?.includes('Finish review'))
    await userEvent.click(btn!)
    expect(onFinishReview).toHaveBeenCalledOnce()
  })
})
