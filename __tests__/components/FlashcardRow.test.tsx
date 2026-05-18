// __tests__/components/FlashcardRow.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { FlashcardRow } from '@/components/FlashcardRow'

describe('FlashcardRow', () => {
  it('renders the native sentence above the target sentence', () => {
    render(
      <FlashcardRow
        flashcardFront="I [[went]] to the market yesterday."
        flashcardBack="[[Fui]] al mercado ayer."
        testId="row-1"
      />,
    )
    const front = screen.getByTestId('row-1-front')
    const back = screen.getByTestId('row-1-back')

    // Both halves of the front string are present and the bracketed
    // phrase is rendered as a single visual unit (no [[ ]] in the
    // user-visible output).
    expect(front).toHaveTextContent('I went to the market yesterday.')
    expect(front).not.toHaveTextContent('[[')

    // Same for the target line; the corrected phrase is rendered
    // separately so it can carry its own styling.
    expect(back).toHaveTextContent('Fui al mercado ayer.')
    expect(back).not.toHaveTextContent('[[')
    expect(within(back).getByText('Fui')).toBeInTheDocument()
  })

  it('renders the front sentence with the bracketed phrase as a styled span', () => {
    render(
      <FlashcardRow
        flashcardFront="Do you [[have]] a minute?"
        flashcardBack="¿[[Tenés]] un minuto?"
        testId="row-2"
      />,
    )
    const front = screen.getByTestId('row-2-front')
    const phrase = within(front).getByText('have')
    expect(phrase.tagName).toBe('SPAN')
  })

  it('falls back to the whole sentence in the front slot when brackets are missing', () => {
    // Defensive — the Claude prompt asks for brackets, but if a legacy
    // or malformed flashcard slips through we should still render the
    // sentence rather than blow up. The bracketed-span just doesn't
    // appear.
    render(
      <FlashcardRow
        flashcardFront="No brackets at all here."
        flashcardBack="Tampoco acá."
        testId="row-3"
      />,
    )
    const front = screen.getByTestId('row-3-front')
    const back = screen.getByTestId('row-3-back')
    expect(front).toHaveTextContent('No brackets at all here.')
    expect(back).toHaveTextContent('Tampoco acá.')
  })

  it('uses the Source Serif display font on the target line', () => {
    // The target row is the row's editorial moment — the brand
    // pairs a humanist sans body with Source Serif 4 for display
    // type, and the target sentence opts into the display family.
    render(
      <FlashcardRow
        flashcardFront="I [[went]] to the market."
        flashcardBack="[[Fui]] al mercado."
        testId="row-4"
      />,
    )
    expect(screen.getByTestId('row-4-back').className).toMatch(/font-display/)
    expect(screen.getByTestId('row-4-front').className).not.toMatch(/font-display/)
  })
})
