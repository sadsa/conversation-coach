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
  it('annotation.savePrimary exists in both langs', () => {
    expect(t('annotation.savePrimary', 'en')).toBe('Save to my Write list')
    expect(t('annotation.savePrimary', 'es')).toBe('Guardar en mi lista')
  })
  it('annotation.savedPrimary names the destination so the button itself is the receipt', () => {
    expect(t('annotation.savedPrimary', 'en')).toMatch(/added to write list/i)
    expect(t('annotation.savedPrimary', 'es')).toMatch(/agregada/i)
  })
  it('annotation.notUseful is the quiet secondary action label', () => {
    expect(t('annotation.notUseful', 'en')).not.toBe('annotation.notUseful')
    expect(t('annotation.notUseful', 'es')).not.toBe('annotation.notUseful')
  })
  it('annotation.savedHint + savedHintLink are retired (folded into the saved-state button label)', () => {
    expect(t('annotation.savedHint', 'en')).toBe('annotation.savedHint')
    expect(t('annotation.savedHintLink', 'en')).toBe('annotation.savedHintLink')
    expect(t('annotation.savedHint', 'es')).toBe('annotation.savedHint')
    expect(t('annotation.savedHintLink', 'es')).toBe('annotation.savedHintLink')
  })
  it('annotation.unhelpfulHint reinforces the hidden state', () => {
    expect(t('annotation.unhelpfulHint', 'en')).toMatch(/hidden/i)
    expect(t('annotation.unhelpfulHint', 'es')).toMatch(/oculta/i)
  })
  it('annotation.retry + offlineNote exist for inline error recovery', () => {
    expect(t('annotation.retry', 'en')).toBe('Retry')
    expect(t('annotation.retry', 'es')).toBe('Reintentar')
    expect(t('annotation.offlineNote', 'en')).not.toBe('annotation.offlineNote')
    expect(t('annotation.offlineNote', 'es')).not.toBe('annotation.offlineNote')
  })
  it('annotation.importantPill replaces the ASCII star cluster', () => {
    expect(t('annotation.importantPill', 'en')).not.toBe('annotation.importantPill')
    expect(t('annotation.importantPillHigh', 'en')).not.toBe('annotation.importantPillHigh')
    expect(t('annotation.importantPill', 'es')).not.toBe('annotation.importantPill')
  })
  it('sheet.navHintFirst exists for the first-open onboarding cue', () => {
    expect(t('sheet.navHintFirst', 'en')).not.toBe('sheet.navHintFirst')
    expect(t('sheet.navHintFirst', 'es')).not.toBe('sheet.navHintFirst')
  })
  it('retired annotation keys fall back to the key (helpfulAria, stateNeutral, etc.)', () => {
    expect(t('annotation.helpfulAria', 'en')).toBe('annotation.helpfulAria')
    expect(t('annotation.stateNeutral', 'en')).toBe('annotation.stateNeutral')
    expect(t('annotation.stateSaved', 'en')).toBe('annotation.stateSaved')
    expect(t('annotation.stateUnhelpful', 'en')).toBe('annotation.stateUnhelpful')
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
  it('writeSheet primary action busy + aria keys exist for both directions', () => {
    expect(t('writeSheet.markWrittenBusy', 'en')).not.toBe('writeSheet.markWrittenBusy')
    expect(t('writeSheet.markWrittenAria', 'en')).not.toBe('writeSheet.markWrittenAria')
    expect(t('writeSheet.moveBackBusy', 'en')).not.toBe('writeSheet.moveBackBusy')
    expect(t('writeSheet.moveBackAria', 'en')).not.toBe('writeSheet.moveBackAria')
    expect(t('writeSheet.markWrittenBusy', 'es')).not.toBe('writeSheet.markWrittenBusy')
    expect(t('writeSheet.moveBackBusy', 'es')).not.toBe('writeSheet.moveBackBusy')
  })
  it('writeSheet.moveBack now spells out the destination', () => {
    expect(t('writeSheet.moveBack', 'en')).toMatch(/write list/i)
    expect(t('writeSheet.moveBack', 'es')).toMatch(/anotar/i)
  })
  it('writeSheet overflow + delete copy exists in both langs', () => {
    expect(t('writeSheet.moreActionsAria', 'en')).not.toBe('writeSheet.moreActionsAria')
    expect(t('writeSheet.deleteLabel', 'en')).not.toBe('writeSheet.deleteLabel')
    // The visible "you can undo for 5 seconds" helper line was distilled
    // out (the toast is the immediate confirmation). The reassurance now
    // lives only in the aria-label so screen-reader users still hear it.
    expect(t('writeSheet.deleteAria', 'en')).toMatch(/undo/i)
    expect(t('writeSheet.deleteAria', 'es')).toMatch(/deshacer/i)
  })
  it('writeSheet status caption keys exist in both langs', () => {
    expect(t('writeSheet.statusToWrite', 'en')).not.toBe('writeSheet.statusToWrite')
    expect(t('writeSheet.statusWritten', 'en')).not.toBe('writeSheet.statusWritten')
    expect(t('writeSheet.statusToWrite', 'es')).not.toBe('writeSheet.statusToWrite')
    expect(t('writeSheet.statusWritten', 'es')).not.toBe('writeSheet.statusWritten')
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

describe('onboarding tutorial i18n keys', () => {
  it('language-select keys exist in both langs', () => {
    for (const key of [
      'onboarding.languageSelect.heading',
      'onboarding.languageSelect.body',
      'onboarding.languageSelect.cta',
      'onboarding.languageSelect.spanish',
      'onboarding.languageSelect.spanishVariant',
      'onboarding.languageSelect.english',
      'onboarding.languageSelect.englishVariant',
      'onboarding.languageSelect.targetLanguageAria',
    ]) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })
  it('semantic upload + share step keys exist in both langs', () => {
    for (const key of [
      'onboarding.upload.heading',
      'onboarding.upload.body',
      'onboarding.share.heading',
      'onboarding.share.body',
    ]) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })
  it('illustration label keys exist in both langs (so learners see their own language inside the mockup)', () => {
    for (const key of [
      'onboarding.illus.uploadButton',
      'onboarding.illus.shareTitle',
      'onboarding.illus.appMessages',
      'onboarding.illus.appMail',
      'onboarding.illus.appCoach',
      'onboarding.illus.appFiles',
      'onboarding.illus.shareContact',
      'onboarding.illus.pickerTitle',
    ]) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })
  it('legacy indexed keys are retired (fall back to key)', () => {
    expect(t('onboarding.step1.heading', 'en')).toBe('onboarding.step1.heading')
    expect(t('onboarding.step2.heading', 'en')).toBe('onboarding.step2.heading')
    expect(t('onboarding.step3.heading', 'en')).toBe('onboarding.step3.heading')
  })
  it('CTA + chrome keys exist in both langs', () => {
    for (const key of [
      'onboarding.cta.next',
      'onboarding.cta.letsGo',
      'onboarding.cta.done',
      'onboarding.skip',
      'onboarding.close',
      'onboarding.revisitLink',
    ]) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })
  it('onboarding.stepOfTotal substitutes {n} and {total} in both langs', () => {
    expect(t('onboarding.stepOfTotal', 'en', { n: 1, total: 2 })).toBe('Step 1 of 2')
    expect(t('onboarding.stepOfTotal', 'es', { n: 1, total: 2 })).toBe('Paso 1 de 2')
  })
  it('settings help keys exist in both langs', () => {
    for (const key of ['settings.help', 'settings.howToUpload', 'settings.howToShare']) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })
})
