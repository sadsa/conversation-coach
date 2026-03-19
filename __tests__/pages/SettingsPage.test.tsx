// __tests__/pages/SettingsPage.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPage from '@/app/settings/page'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.fontSize = ''
})

describe('SettingsPage', () => {
  it('displays the default font size (16px) when nothing is stored', () => {
    render(<SettingsPage />)
    expect(screen.getByText('16px')).toBeInTheDocument()
  })

  it('displays the stored font size on mount', () => {
    localStorage.setItem('fontSize', '20')
    render(<SettingsPage />)
    expect(screen.getByText('20px')).toBeInTheDocument()
  })

  it('increments font size when + is clicked', async () => {
    localStorage.setItem('fontSize', '16')
    render(<SettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: '+' }))
    expect(screen.getByText('18px')).toBeInTheDocument()
    expect(localStorage.getItem('fontSize')).toBe('18')
    expect(document.documentElement.style.fontSize).toBe('18px')
  })

  it('decrements font size when − is clicked', async () => {
    localStorage.setItem('fontSize', '16')
    render(<SettingsPage />)
    await userEvent.click(screen.getByRole('button', { name: '−' }))
    expect(screen.getByText('14px')).toBeInTheDocument()
    expect(localStorage.getItem('fontSize')).toBe('14')
    expect(document.documentElement.style.fontSize).toBe('14px')
  })

  it('disables the − button at the minimum size (14)', () => {
    localStorage.setItem('fontSize', '14')
    render(<SettingsPage />)
    expect(screen.getByRole('button', { name: '−' })).toBeDisabled()
  })

  it('disables the + button at the maximum size (22)', () => {
    localStorage.setItem('fontSize', '22')
    render(<SettingsPage />)
    expect(screen.getByRole('button', { name: '+' })).toBeDisabled()
  })

  it('renders a preview section', () => {
    render(<SettingsPage />)
    expect(screen.getByText(/Hoy fui al mercado/)).toBeInTheDocument()
  })
})
