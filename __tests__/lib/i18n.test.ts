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
    expect(t('home.toWriteDown', 'en', { n: 5 })).toBe('5 corrections to write down')
  })
  it('substitutes {n} replacement in Spanish', () => {
    expect(t('home.toWriteDown', 'es', { n: 5 })).toBe('5 correcciones para anotar')
  })
  it('home.toWriteDownOne uses singular grammar in both langs', () => {
    expect(t('home.toWriteDownOne', 'en')).toBe('1 correction to write down')
    expect(t('home.toWriteDownOne', 'es')).toBe('1 corrección para anotar')
  })
})

describe('annotation action i18n keys', () => {
  it('annotation.helpfulAria exists in en', () => {
    expect(t('annotation.helpfulAria', 'en')).not.toBe('annotation.helpfulAria')
  })
  it('annotation.helpfulAria exists in es', () => {
    expect(t('annotation.helpfulAria', 'es')).not.toBe('annotation.helpfulAria')
  })
  it('annotation.stateNeutral exists in en', () => {
    expect(t('annotation.stateNeutral', 'en')).not.toBe('annotation.stateNeutral')
  })
  it('writeList.tabWrite reads "Write" in en (matches the page name)', () => {
    expect(t('writeList.tabWrite', 'en')).toBe('Write')
  })
  it('writeList.tabWritten reads "Written" in en (Write \u2192 Written symmetry)', () => {
    expect(t('writeList.tabWritten', 'en')).toBe('Written')
  })
  it('writeList.tabWritten exists in es', () => {
    expect(t('writeList.tabWritten', 'es')).not.toBe('writeList.tabWritten')
  })
  it('writeSheet.markWritten exists in en', () => {
    expect(t('writeSheet.markWritten', 'en')).not.toBe('writeSheet.markWritten')
  })
  it('writeList.markRowAria substitutes {original} in en', () => {
    expect(t('writeList.markRowAria', 'en', { original: 'Yo fui' })).toContain('Yo fui')
  })
  it('writeList.markRowAria substitutes {original} in es', () => {
    expect(t('writeList.markRowAria', 'es', { original: 'Yo fui' })).toContain('Yo fui')
  })
  it('writeList.movedToTrash exists in both langs', () => {
    expect(t('writeList.movedToTrash', 'en')).not.toBe('writeList.movedToTrash')
    expect(t('writeList.movedToTrash', 'es')).not.toBe('writeList.movedToTrash')
  })
  it('writeList.emptyWriteCaption + emptyWriteCta exist for the teaching empty state', () => {
    expect(t('writeList.emptyWriteCaption', 'en')).not.toBe('writeList.emptyWriteCaption')
    expect(t('writeList.emptyWriteCta', 'en')).not.toBe('writeList.emptyWriteCta')
    expect(t('writeList.emptyWriteCaption', 'es')).not.toBe('writeList.emptyWriteCaption')
    expect(t('writeList.emptyWriteCta', 'es')).not.toBe('writeList.emptyWriteCta')
  })
  it('nav.write replaces nav.practice (which now falls back to key)', () => {
    expect(t('nav.write', 'en')).toBe('Write')
    expect(t('nav.practice', 'en')).toBe('nav.practice')
  })
  it('practice.title and practiceList.* keys are retired (fall back to key)', () => {
    expect(t('practice.title', 'en')).toBe('practice.title')
    expect(t('practiceList.active', 'en')).toBe('practiceList.active')
    expect(t('practiceList.archive', 'en')).toBe('practiceList.archive')
    expect(t('practiceSheet.markWritten', 'en')).toBe('practiceSheet.markWritten')
  })
  it('annotation.addToPractice is removed (falls back to key)', () => {
    expect(t('annotation.addToPractice', 'en')).toBe('annotation.addToPractice')
  })
})
