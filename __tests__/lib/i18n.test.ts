import { describe, it, expect } from 'vitest'
import { t, inferUiLanguage } from '@/lib/i18n'

describe('inferUiLanguage', () => {
  it('returns en for es-AR', () => {
    expect(inferUiLanguage('es-AR')).toBe('en')
  })
  it('returns es for en-NZ', () => {
    expect(inferUiLanguage('en-NZ')).toBe('es')
  })
})

describe('t()', () => {
  it('returns English string for en', () => {
    expect(t('nav.home', 'en')).toBe('Home')
  })
  it('returns Spanish string for es', () => {
    expect(t('nav.home', 'es')).toBe('Inicio')
  })
  it('returns the key itself when not found', () => {
    expect(t('nonexistent.key', 'en')).toBe('nonexistent.key')
  })
  it('substitutes {n} replacement', () => {
    expect(t('flashcard.reviewPileHeading', 'en', { n: 2 })).toBe('Review pile 2')
  })
  it('substitutes {n} replacement in Spanish', () => {
    expect(t('flashcard.reviewPileHeading', 'es', { n: 2 })).toBe('Repasar pila 2')
  })
})
