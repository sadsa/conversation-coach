import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingStep } from '@/components/OnboardingStep'

const mockIllustration = <div data-testid="illus">illustration</div>

function renderStep(overrides: Partial<React.ComponentProps<typeof OnboardingStep>> = {}) {
  const props: React.ComponentProps<typeof OnboardingStep> = {
    step: 1,
    totalSteps: 2,
    illustration: mockIllustration,
    heading: 'Heading',
    body: 'Body',
    ctaLabel: 'Next →',
    onNext: vi.fn(),
    stepOfTotalLabel: 'Step 1 of 2',
    ...overrides,
  }
  return { props, ...render(<OnboardingStep {...props} />) }
}

describe('OnboardingStep', () => {
  it('renders the heading and body', () => {
    renderStep({ heading: "Here's how it works", body: 'Some body text.' })
    expect(screen.getByText("Here's how it works")).toBeInTheDocument()
    expect(screen.getByText('Some body text.')).toBeInTheDocument()
  })

  it('renders the illustration slot', () => {
    renderStep()
    expect(screen.getByTestId('illus')).toBeInTheDocument()
  })

  it('renders the CTA with the supplied label', () => {
    renderStep({ ctaLabel: "Let's go →" })
    expect(screen.getByRole('button', { name: "Let's go →" })).toBeInTheDocument()
  })

  it('calls onNext when the CTA is clicked', async () => {
    const onNext = vi.fn()
    renderStep({ onNext })
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('progressbar reflects current step + total + accessible label', () => {
    renderStep({ step: 2, totalSteps: 2, stepOfTotalLabel: 'Step 2 of 2' })
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemax', '2')
    expect(bar).toHaveAttribute('aria-valuemin', '1')
    expect(bar).toHaveAttribute('aria-label', 'Step 2 of 2')
  })

  it('omits the back button when onBack is not provided', () => {
    renderStep()
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
  })

  it('renders a back button when onBack is provided and calls it on click', async () => {
    const onBack = vi.fn()
    renderStep({ onBack, backLabel: 'Back' })
    const backBtn = screen.getByRole('button', { name: /back/i })
    expect(backBtn).toBeInTheDocument()
    await userEvent.click(backBtn)
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('omits the exit button when onExit is not provided', () => {
    renderStep()
    expect(screen.queryByRole('button', { name: /skip|close/i })).not.toBeInTheDocument()
  })

  it('renders an exit button (Skip / Close) when onExit is provided', async () => {
    const onExit = vi.fn()
    renderStep({ onExit, exitLabel: 'Skip tutorial' })
    const exitBtn = screen.getByRole('button', { name: /skip tutorial/i })
    await userEvent.click(exitBtn)
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('renders the wordmark', () => {
    renderStep()
    expect(screen.getByText('Conversation Coach')).toBeInTheDocument()
  })
})
