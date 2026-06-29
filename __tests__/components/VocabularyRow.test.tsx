import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { VocabularyRow } from '@/components/VocabularyRow'

describe('VocabularyRow', () => {
  it('renders the Spanish (back) sentence', () => {
    render(
      <VocabularyRow
        flashcardBack="[[Fui]] al mercado ayer."
        testId="row-1"
      />,
    )
    const back = screen.getByTestId('row-1-back')
    expect(back).toHaveTextContent('Fui al mercado ayer.')
    expect(back).not.toHaveTextContent('[[')
    expect(within(back).getByText('Fui')).toBeInTheDocument()
  })

  it('does not render a front (English) sentence element', () => {
    render(
      <VocabularyRow
        flashcardBack="[[Fui]] al mercado ayer."
        testId="row-2"
      />,
    )
    expect(screen.queryByTestId('row-2-front')).not.toBeInTheDocument()
  })

  it('does not surface flashcard_front text even when called from a context that has it', () => {
    // Simulate a case where a caller might try to pass front text via back accidentally —
    // the point is the component only accepts flashcardBack, so front content can never leak in.
    render(
      <VocabularyRow
        flashcardBack="¿[[Tenés]] un minuto?"
        testId="row-3"
      />,
    )
    // Only the back element exists
    expect(screen.getByTestId('row-3-back')).toHaveTextContent('¿Tenés un minuto?')
    expect(screen.queryByTestId('row-3-front')).not.toBeInTheDocument()
  })

  it('uses the Source Serif display font on the target sentence', () => {
    render(
      <VocabularyRow
        flashcardBack="[[Fui]] al mercado."
        testId="row-4"
      />,
    )
    expect(screen.getByTestId('row-4-back').className).toMatch(/font-display/)
  })

  it('renders the bracketed phrase as a styled span', () => {
    render(
      <VocabularyRow
        flashcardBack="¿[[Tenés]] un minuto?"
        testId="row-5"
      />,
    )
    const back = screen.getByTestId('row-5-back')
    const phrase = within(back).getByText('Tenés')
    expect(phrase.tagName).toBe('SPAN')
  })

  it('falls back gracefully when brackets are missing', () => {
    render(
      <VocabularyRow
        flashcardBack="No brackets at all."
        testId="row-6"
      />,
    )
    expect(screen.getByTestId('row-6-back')).toHaveTextContent('No brackets at all.')
  })
})
