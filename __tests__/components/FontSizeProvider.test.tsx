// __tests__/components/FontSizeProvider.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { FontSizeProvider } from '@/components/FontSizeProvider'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.fontSize = ''
})

describe('FontSizeProvider', () => {
  it('applies stored font size to document root on mount', () => {
    localStorage.setItem('fontSize', '20')
    render(<FontSizeProvider />)
    expect(document.documentElement.style.fontSize).toBe('20px')
  })

  it('does nothing when no fontSize is in localStorage', () => {
    render(<FontSizeProvider />)
    expect(document.documentElement.style.fontSize).toBe('')
  })
})
