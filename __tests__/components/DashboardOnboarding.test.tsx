import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardOnboarding } from '@/components/DashboardOnboarding'
import { LanguageProvider } from '@/components/LanguageProvider'

function wrap() {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <DashboardOnboarding />
    </LanguageProvider>
  )
}

describe('DashboardOnboarding', () => {
  // Demoted to a subtle text-link refresher. The primary action on the
  // empty Recordings page is the Upload FAB (with its own attention pulse).
  // Anything more here was inverting the visual hierarchy.
  it('renders a subtle "Revisit the tutorial" link pointing to step 1 of the wizard', () => {
    wrap()
    const link = screen.getByRole('link', { name: /revisit the tutorial/i })
    expect(link).toBeInTheDocument()
    // No revisit=true: completing the tour should land back on /, not /settings.
    expect(link).toHaveAttribute('href', '/onboarding?step=1')
  })

  it('exposes a stable test hook for HomeClient first-run assertions', () => {
    wrap()
    expect(screen.getByTestId('dashboard-onboarding')).toBeInTheDocument()
  })

  it('does not render a second welcome heading (HomeClient header owns the welcome)', () => {
    wrap()
    expect(screen.queryByRole('heading', { name: /welcome/i })).not.toBeInTheDocument()
  })

  it('does not render the link as a primary accent button (subtle ghost only)', () => {
    wrap()
    const link = screen.getByRole('link', { name: /revisit the tutorial/i })
    // The accent-primary background was the inverted-hierarchy bug. Guard
    // against it sneaking back via a styling refactor.
    expect(link.className).not.toMatch(/bg-accent-primary/)
  })
})
