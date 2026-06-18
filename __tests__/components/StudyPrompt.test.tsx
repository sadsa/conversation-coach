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

describe('StudyPrompt', () => {
  it('renders nothing when count is 0', () => {
    const { container } = wrap({ count: 0, onLaunchStudy: vi.fn() })
    expect(container.firstChild).toBeNull()
  })

  it('renders a button (not a link) when count >= 1', () => {
    wrap({ count: 1, onLaunchStudy: vi.fn() })
    const btn = screen.getByRole('button')
    expect(btn).toBeDefined()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('splits the count status from the Study action (distinct bar structure)', () => {
    wrap({ count: 3, onLaunchStudy: vi.fn() })
    // Status text (left) sits outside the button; the button reads "Study".
    expect(screen.getByText('3 phrases saved')).toBeInTheDocument()
    const btn = screen.getByRole('button')
    expect(btn.textContent).toContain('Study')
    expect(btn.textContent).not.toContain('3 phrases saved')
  })

  it('uses the singular status string when count is 1', () => {
    wrap({ count: 1, onLaunchStudy: vi.fn() })
    expect(screen.getByText('1 phrase saved')).toBeInTheDocument()
  })

  it('calls onLaunchStudy when clicked', async () => {
    const onLaunchStudy = vi.fn()
    wrap({ count: 2, onLaunchStudy })
    await userEvent.click(screen.getByRole('button'))
    expect(onLaunchStudy).toHaveBeenCalledOnce()
  })
})
