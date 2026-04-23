import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardOnboarding } from '@/components/DashboardOnboarding'
import { LanguageProvider } from '@/components/LanguageProvider'

function wrap(props: Parameters<typeof DashboardOnboarding>[0] = {}) {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <DashboardOnboarding {...props} />
    </LanguageProvider>
  )
}

describe('DashboardOnboarding', () => {
  it('renders the welcome section', () => {
    wrap()
    expect(screen.getByTestId('dashboard-onboarding')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /welcome/i })).toBeInTheDocument()
  })

  it('renders a primary "Start tutorial" link pointing to step 1 of the wizard', () => {
    wrap()
    const link = screen.getByRole('link', { name: /start tutorial/i })
    expect(link).toHaveAttribute('href', '/onboarding?step=1&revisit=true')
  })

  it('omits the upload button when no onUpload handler is provided', () => {
    wrap()
    expect(screen.queryByRole('button', { name: /upload audio/i })).not.toBeInTheDocument()
  })

  it('renders an "Upload audio" button when onUpload is wired', () => {
    wrap({ onUpload: vi.fn() })
    expect(screen.getByRole('button', { name: /upload audio/i })).toBeInTheDocument()
  })

  it('forwards picked files to onUpload after validation', () => {
    const onUpload = vi.fn()
    wrap({ onUpload })

    const file = new File(['x'], 'clip.mp3', { type: 'audio/mpeg' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(onUpload).toHaveBeenCalledWith(file)
  })

  it('rejects unsupported formats via onPickInvalid instead of uploading', () => {
    const onUpload = vi.fn()
    const onPickInvalid = vi.fn()
    wrap({ onUpload, onPickInvalid })

    const bad = new File(['x'], 'photo.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [bad] } })

    expect(onUpload).not.toHaveBeenCalled()
    expect(onPickInvalid).toHaveBeenCalled()
  })

  it('disables the upload button while a previous upload is in flight', () => {
    wrap({ onUpload: vi.fn(), uploadDisabled: true })
    const button = screen.getByRole('button', { name: /uploading|subiendo|upload audio/i })
    expect(button).toBeDisabled()
  })
})
