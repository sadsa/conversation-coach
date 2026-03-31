import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { LanguageProvider, useTranslation } from '@/components/LanguageProvider'

vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}))

function TestConsumer() {
  const { t, targetLanguage, setTargetLanguage } = useTranslation()
  return (
    <div>
      <span data-testid="home-label">{t('nav.home')}</span>
      <span data-testid="target">{targetLanguage}</span>
      <button onClick={() => setTargetLanguage('en-NZ')}>Switch to en-NZ</button>
    </div>
  )
}

describe('LanguageProvider', () => {
  it('provides English translations for es-AR', () => {
    render(
      <LanguageProvider initialTargetLanguage="es-AR">
        <TestConsumer />
      </LanguageProvider>
    )
    expect(screen.getByTestId('home-label')).toHaveTextContent('Home')
    expect(screen.getByTestId('target')).toHaveTextContent('es-AR')
  })

  it('provides Spanish translations for en-NZ', () => {
    render(
      <LanguageProvider initialTargetLanguage="en-NZ">
        <TestConsumer />
      </LanguageProvider>
    )
    expect(screen.getByTestId('home-label')).toHaveTextContent('Inicio')
  })

  it('updates translations when setTargetLanguage is called', async () => {
    render(
      <LanguageProvider initialTargetLanguage="es-AR">
        <TestConsumer />
      </LanguageProvider>
    )
    expect(screen.getByTestId('home-label')).toHaveTextContent('Home')
    await userEvent.click(screen.getByText('Switch to en-NZ'))
    expect(screen.getByTestId('home-label')).toHaveTextContent('Inicio')
    expect(screen.getByTestId('target')).toHaveTextContent('en-NZ')
  })

  it('defaults to es-AR when no initialTargetLanguage provided', () => {
    render(
      <LanguageProvider>
        <TestConsumer />
      </LanguageProvider>
    )
    expect(screen.getByTestId('home-label')).toHaveTextContent('Home')
  })
})

describe('useTranslation outside provider', () => {
  it('returns English strings with fallback context', () => {
    function Bare() {
      const { t } = useTranslation()
      return <span data-testid="val">{t('nav.home')}</span>
    }
    render(<Bare />)
    expect(screen.getByTestId('val')).toHaveTextContent('Home')
  })
})
