import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingStep } from '@/components/OnboardingStep'

const mockIllustration = <div data-testid="illus">illustration</div>

describe('OnboardingStep', () => {
  it('renders the heading and body', () => {
    render(
      <OnboardingStep
        step={1}
        illustration={mockIllustration}
        heading="Here's how it works"
        body="Some body text."
        ctaLabel="Next →"
        onNext={vi.fn()}
      />
    )
    expect(screen.getByText("Here's how it works")).toBeInTheDocument()
    expect(screen.getByText('Some body text.')).toBeInTheDocument()
  })

  it('renders the illustration slot', () => {
    render(
      <OnboardingStep
        step={2}
        illustration={mockIllustration}
        heading="Upload"
        body="Body"
        ctaLabel="Next →"
        onNext={vi.fn()}
      />
    )
    expect(screen.getByTestId('illus')).toBeInTheDocument()
  })

  it('renders the CTA with the supplied label', () => {
    render(
      <OnboardingStep
        step={3}
        illustration={mockIllustration}
        heading="Share"
        body="Body"
        ctaLabel="Let's go →"
        onNext={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: "Let's go →" })).toBeInTheDocument()
  })

  it('calls onNext when the CTA is clicked', async () => {
    const onNext = vi.fn()
    render(
      <OnboardingStep
        step={1}
        illustration={mockIllustration}
        heading="Heading"
        body="Body"
        ctaLabel="Next →"
        onNext={onNext}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('marks the correct dot as active via aria-label', () => {
    render(
      <OnboardingStep
        step={2}
        illustration={mockIllustration}
        heading="H"
        body="B"
        ctaLabel="Next →"
        onNext={vi.fn()}
      />
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
  })
})
