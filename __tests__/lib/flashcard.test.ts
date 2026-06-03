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

  it('strips [[…]] delimiters from extra pairs in `after`, keeping the phrase text', () => {
    // Claude occasionally generates two bracket pairs (e.g. marking two words).
    // The first pair is the focus phrase; subsequent brackets must not
    // render literally in the DOM — strip the [[ ]] markers, keep the text.
    expect(parseFlashcard('[[uno]] y [[dos]] también')).toEqual({
      before: '',
      phrase: 'uno',
      after: ' y dos también',
    })
  })

  it('strips multiple extra pairs from `after`', () => {
    expect(parseFlashcard('Lo que le [[faltaba]] al final [[era]] la sal.')).toEqual({
      before: 'Lo que le ',
      phrase: 'faltaba',
      after: ' al final era la sal.',
    })
  })
})
