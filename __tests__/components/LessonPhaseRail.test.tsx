import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LessonPhaseRail, type LessonPhase } from '@/components/LessonPhaseRail'

describe('LessonPhaseRail', () => {
  it('renders all four phase labels', () => {
    render(<LessonPhaseRail currentPhase="explain" />)
    expect(screen.getByText('Explain')).toBeInTheDocument()
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('Drill')).toBeInTheDocument()
    expect(screen.getByText('Free use')).toBeInTheDocument()
  })

  it('marks the active phase with aria-current=step', () => {
    render(<LessonPhaseRail currentPhase="drill" />)
    expect(screen.getByText('Drill').closest('[aria-current]')).toHaveAttribute('aria-current', 'step')
  })

  it('does not mark inactive phases with aria-current', () => {
    render(<LessonPhaseRail currentPhase="drill" />)
    const explain = screen.getByText('Explain').closest('[data-phase]')
    expect(explain).not.toHaveAttribute('aria-current', 'step')
  })

  it('phases before active have data-status=done', () => {
    render(<LessonPhaseRail currentPhase="free_use" />)
    expect(screen.getByText('Explain').closest('[data-phase]')).toHaveAttribute('data-status', 'done')
    expect(screen.getByText('Model').closest('[data-phase]')).toHaveAttribute('data-status', 'done')
    expect(screen.getByText('Drill').closest('[data-phase]')).toHaveAttribute('data-status', 'done')
    expect(screen.getByText('Free use').closest('[data-phase]')).toHaveAttribute('data-status', 'active')
  })

  it('phases after active have data-status=pending', () => {
    render(<LessonPhaseRail currentPhase="model" />)
    expect(screen.getByText('Drill').closest('[data-phase]')).toHaveAttribute('data-status', 'pending')
    expect(screen.getByText('Free use').closest('[data-phase]')).toHaveAttribute('data-status', 'pending')
  })
})
