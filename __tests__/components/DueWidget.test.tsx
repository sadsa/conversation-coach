import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DueWidget } from '@/components/DueWidget'
import { LanguageProvider } from '@/components/LanguageProvider'

function wrap(dueCount: number) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <DueWidget dueCount={dueCount} />
    </LanguageProvider>,
  )
}

describe('DueWidget', () => {
  it('renders the banner when dueCount > 0', () => {
    wrap(3)
    expect(screen.getByTestId('due-widget')).toBeInTheDocument()
  })

  it('renders nothing when dueCount is 0', () => {
    const { container } = wrap(0)
    expect(screen.queryByTestId('due-widget')).not.toBeInTheDocument()
    expect(container.firstChild).toBeNull()
  })

  it('shows the due count in the banner', () => {
    wrap(5)
    expect(screen.getByTestId('due-widget')).toHaveTextContent('5')
  })

  it('has a "Study now" link pointing to /study', () => {
    wrap(2)
    const link = screen.getByTestId('due-widget-study-link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/study')
  })

  it('renders "Study now" label text', () => {
    wrap(1)
    expect(screen.getByTestId('due-widget-study-link')).toHaveTextContent(/study now/i)
  })
})
