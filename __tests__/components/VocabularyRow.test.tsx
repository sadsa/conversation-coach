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

  it('matches the review list-row typography (sans, text-lg, balanced) — no display serif', () => {
    render(
      <VocabularyRow
        flashcardBack="[[Fui]] al mercado."
        testId="row-4"
      />,
    )
    const cls = screen.getByTestId('row-4-back').className
    expect(cls).not.toMatch(/font-display/)
    expect(cls).toMatch(/text-lg/)
    expect(cls).toMatch(/text-balance/)
  })

  it('keeps the sentence normal-weight and emphasises only the corrected phrase', () => {
    const { rerender } = render(
      <VocabularyRow flashcardBack="[[Fui]] al mercado." testId="row-w" />,
    )
    const liveBack = screen.getByTestId('row-w-back')
    // Sentence body stays normal weight + recedes to the same secondary ink
    // the review list uses for its rows, so it reads as scaffolding…
    expect(liveBack.className).not.toMatch(/font-semibold/)
    expect(liveBack.className).toMatch(/text-text-secondary/)
    // …the corrected phrase is the only bold, tinted part — and carries no
    // background chip / horizontal padding.
    const livePhrase = within(liveBack).getByText('Fui')
    expect(livePhrase.className).toMatch(/font-semibold/)
    expect(livePhrase.className).toMatch(/text-correction/)
    expect(livePhrase.className).not.toMatch(/bg-widget-write-bg/)
    expect(livePhrase.className).not.toMatch(/px-/)

    // Muted "Studied" archive drops the tint to a lower-contrast secondary.
    rerender(
      <VocabularyRow flashcardBack="[[Fui]] al mercado." muted testId="row-w" />,
    )
    const mutedBack = screen.getByTestId('row-w-back')
    expect(mutedBack.className).toMatch(/text-text-secondary/)
    expect(within(mutedBack).getByText('Fui').className).not.toMatch(/text-correction/)
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
