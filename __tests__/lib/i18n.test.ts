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
    expect(t('home.toWriteDown', 'en', { n: 5 })).toBe('5 to write down')
  })
  it('substitutes {n} replacement in Spanish', () => {
    expect(t('home.toWriteDown', 'es', { n: 5 })).toBe('5 para anotar')
  })
})

describe('annotation action i18n keys', () => {
  it('annotation.starAria exists in en', () => {
    expect(t('annotation.starAria', 'en')).not.toBe('annotation.starAria')
  })
  it('annotation.starAria exists in es', () => {
    expect(t('annotation.starAria', 'es')).not.toBe('annotation.starAria')
  })
  it('annotation.stateUnsaved exists in en', () => {
    expect(t('annotation.stateUnsaved', 'en')).not.toBe('annotation.stateUnsaved')
  })
  it('practiceList.active exists in en', () => {
    expect(t('practiceList.active', 'en')).not.toBe('practiceList.active')
  })
  it('practiceList.archive exists in es', () => {
    expect(t('practiceList.archive', 'es')).not.toBe('practiceList.archive')
  })
  it('practiceList.archive renders as "Written" in en (renamed from Archive)', () => {
    expect(t('practiceList.archive', 'en')).toBe('Written')
  })
  it('practiceSheet.markWritten exists in en', () => {
    expect(t('practiceSheet.markWritten', 'en')).not.toBe('practiceSheet.markWritten')
  })
  it('practiceList.markRowAria substitutes {original} in en', () => {
    expect(t('practiceList.markRowAria', 'en', { original: 'Yo fui' })).toContain('Yo fui')
  })
  it('practiceList.markRowAria substitutes {original} in es', () => {
    expect(t('practiceList.markRowAria', 'es', { original: 'Yo fui' })).toContain('Yo fui')
  })
  it('practiceList.movedToTrash exists in both langs', () => {
    expect(t('practiceList.movedToTrash', 'en')).not.toBe('practiceList.movedToTrash')
    expect(t('practiceList.movedToTrash', 'es')).not.toBe('practiceList.movedToTrash')
  })
  it('practiceList.emptyActiveCaption + emptyActiveCta exist for the teaching empty state', () => {
    expect(t('practiceList.emptyActiveCaption', 'en')).not.toBe('practiceList.emptyActiveCaption')
    expect(t('practiceList.emptyActiveCta', 'en')).not.toBe('practiceList.emptyActiveCta')
    expect(t('practiceList.emptyActiveCaption', 'es')).not.toBe('practiceList.emptyActiveCaption')
    expect(t('practiceList.emptyActiveCta', 'es')).not.toBe('practiceList.emptyActiveCta')
  })
  it('annotation.addToPractice is removed (falls back to key)', () => {
    expect(t('annotation.addToPractice', 'en')).toBe('annotation.addToPractice')
  })
  it('practiceList.filterWritten is removed (falls back to key)', () => {
    expect(t('practiceList.filterWritten', 'en')).toBe('practiceList.filterWritten')
  })
  it('practiceList.emptyActive is retired in favour of emptyActiveCaption/Cta (falls back to key)', () => {
    expect(t('practiceList.emptyActive', 'en')).toBe('practiceList.emptyActive')
  })
})
