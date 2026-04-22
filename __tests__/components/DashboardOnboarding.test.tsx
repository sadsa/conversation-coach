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
  it('renders the step cards', () => {
    wrap()
    expect(screen.getByTestId('dashboard-onboarding')).toBeInTheDocument()
  })

  it('renders a revisit tutorial link pointing to the tutorial', () => {
    wrap()
    const link = screen.getByRole('link', { name: /revisit.*tutorial/i })
    expect(link).toHaveAttribute('href', '/onboarding?step=1&revisit=true')
  })
})
