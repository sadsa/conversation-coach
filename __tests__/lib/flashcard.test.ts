import { describe, it, expect } from 'vitest'
import { parseFlashcard } from '@/lib/flashcard'

describe('parseFlashcard', () => {
  it('splits a single [[bracket]] pair into before / phrase / after', () => {
    expect(parseFlashcard('I [[went]] to the market yesterday.')).toEqual({
      before: 'I ',
      phrase: 'went',
      after: ' to the market yesterday.',
    })
  })

  it('handles a bracketed phrase at the start', () => {
    expect(parseFlashcard('[[Fui]] al mercado ayer.')).toEqual({
      before: '',
      phrase: 'Fui',
      after: ' al mercado ayer.',
    })
  })

  it('handles a bracketed phrase at the end', () => {
    expect(parseFlashcard('Le dije [[la verdad]]')).toEqual({
      before: 'Le dije ',
      phrase: 'la verdad',
      after: '',
    })
  })

  it('treats multi-word phrases as a single phrase', () => {
    expect(parseFlashcard('¿Qué [[estás haciendo]] acá?')).toEqual({
      before: '¿Qué ',
      phrase: 'estás haciendo',
      after: ' acá?',
    })
  })

  it('falls back to the whole string in `before` when no brackets are found', () => {
    expect(parseFlashcard('No brackets here.')).toEqual({
      before: 'No brackets here.',
      phrase: '',
      after: '',
    })
  })

  it('falls back when the brackets are unclosed (single bracket only)', () => {
    expect(parseFlashcard('foo [[bar baz')).toEqual({
      before: 'foo [[bar baz',
      phrase: '',
      after: '',
    })
  })

  it('captures only the FIRST bracket pair when multiple are present (defensive)', () => {
    // The Claude prompt asks for one pair per string. If a second pair
    // leaks through, we render the first as the focus and leave the
    // rest of the string (brackets included) untouched in `after`.
    expect(parseFlashcard('[[uno]] y [[dos]] también')).toEqual({
      before: '',
      phrase: 'uno',
      after: ' y [[dos]] también',
    })
  })
})
