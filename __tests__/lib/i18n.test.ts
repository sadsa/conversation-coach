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
    expect(t('nav.practise', 'en')).toBe('Practise')
  })
  it('returns Spanish string for es', () => {
    expect(t('nav.practise', 'es')).toBe('Practicar')
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

describe('nav.* renamed for the three-pillar methodology', () => {
  // The Practise-as-home redesign renamed two nav keys to match the
  // methodology — `nav.recordings` → `nav.review` (the inbox of
  // recorded conversations) and `nav.write` → `nav.study` (the queue of
  // corrections to study). `nav.practice` was retired entirely: the
  // home tab now reads `nav.practise` (British spelling, matching the
  // pillar name) since the /practice route lost its dedicated tab and
  // is reached from the home mode cards.
  it('nav.practise + nav.review + nav.study + nav.settings are the four tabs', () => {
    for (const key of ['nav.practise', 'nav.review', 'nav.study', 'nav.settings']) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })

  it('nav.recordings is retired (use nav.review for the conversations inbox)', () => {
    expect(t('nav.recordings', 'en')).toBe('nav.recordings')
    expect(t('nav.recordings', 'es')).toBe('nav.recordings')
  })

  it('nav.write is retired (use nav.study for the corrections queue)', () => {
    expect(t('nav.write', 'en')).toBe('nav.write')
    expect(t('nav.write', 'es')).toBe('nav.write')
  })

  it('nav.practice is retired (use nav.practise — British spelling matches the pillar)', () => {
    expect(t('nav.practice', 'en')).toBe('nav.practice')
    expect(t('nav.practice', 'es')).toBe('nav.practice')
  })
})

describe('home.* methodology eyebrow + three doors', () => {
  it('home.pillarPractise / Review / Study read as the pillar names', () => {
    expect(t('home.pillarPractise', 'en')).toBe('Practise')
    expect(t('home.pillarReview', 'en')).toBe('Review')
    expect(t('home.pillarStudy', 'en')).toBe('Study')
    expect(t('home.pillarPractise', 'es')).toBe('Practicar')
  })

  it('home.subhead is the new under-greeting tagline (drives the three doors)', () => {
    expect(t('home.subhead', 'en')).toMatch(/practise/i)
    expect(t('home.subhead', 'es')).toMatch(/practicar/i)
  })

  it('home.modeShareTitle + Blurb back the third door', () => {
    for (const key of [
      'home.modeShareTitle',
      'home.modeShareBlurb',
    ]) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })

  // Old keys that the home no longer renders. Retired deliberately so a
  // stale reference shows up as the literal key in dev rather than the
  // wrong copy. `home.modeShareAria` joined this list when the visible
  // title+blurb on the Share door were promoted to do the screen-reader
  // talking — keeping an aria-label there overrode the visible text for
  // SR users and silently dropped the blurb.
  it('retired home keys fall back to the key (firstRunSubtitle, shareCTA, practiceCTA*, modeShareAria)', () => {
    for (const key of [
      'home.firstRunSubtitle',
      'home.shareCTA',
      'home.practiceCTATitle',
      'home.practiceCTASubtitle',
      'home.subtitle',
      'home.greetingMorning',
      'home.greetingAfternoon',
      'home.greetingEvening',
      'home.modeShareAria',
    ]) {
      expect(t(key, 'en')).toBe(key)
      expect(t(key, 'es')).toBe(key)
    }
  })
})

describe('annotation action i18n keys', () => {
  it('annotation.savePrimary exists in both langs', () => {
    expect(t('annotation.savePrimary', 'en')).toBe('Save to my Write list')
    expect(t('annotation.savePrimary', 'es')).toBe('Guardar en mi lista')
  })
  it('annotation.savedPrimary names the destination so the button itself is the receipt', () => {
    expect(t('annotation.savedPrimary', 'en')).toMatch(/added to (my )?write list/i)
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
  it('nav.study replaced nav.write for the corrections queue tab', () => {
    expect(t('nav.study', 'en')).toBe('Study')
    expect(t('nav.study', 'es')).toBe('Estudiar')
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
  it('hub keys are retired (hub removed; home page Share CTA replaces it)', () => {
    for (const key of [
      'onboarding.hub.heading',
      'onboarding.hub.practice.title',
      'onboarding.hub.practice.body',
      'onboarding.hub.practice.cta',
      'onboarding.hub.share.linkText',
    ]) {
      expect(t(key, 'en')).toBe(key)
      expect(t(key, 'es')).toBe(key)
    }
  })
  it('home.shareCTA is retired (folded into the home.modeShare* door)', () => {
    expect(t('home.shareCTA', 'en')).toBe('home.shareCTA')
    expect(t('home.shareCTA', 'es')).toBe('home.shareCTA')
  })
  it('home.revisitTutorial is retired (DashboardOnboarding link removed)', () => {
    expect(t('home.revisitTutorial', 'en')).toBe('home.revisitTutorial')
    expect(t('home.revisitTutorial', 'es')).toBe('home.revisitTutorial')
  })
  it('semantic share-illustration step keys exist in both langs', () => {
    for (const key of [
      'onboarding.share.heading',
      'onboarding.share.body',
    ]) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })
  it('illustration label keys exist in both langs (so learners see their own language inside the mockup)', () => {
    for (const key of [
      'onboarding.illus.shareTitle',
      'onboarding.illus.appMessages',
      'onboarding.illus.appMail',
      'onboarding.illus.appCoach',
      'onboarding.illus.appFiles',
      'onboarding.illus.shareContact',
    ]) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })
  it('retired keys (upload step + indexed legacy) fall back to key', () => {
    // Upload-from-file is gone as a primary input — the upload tutorial
    // step was replaced by the hub. These keys should NOT have translations.
    expect(t('onboarding.upload.heading', 'en')).toBe('onboarding.upload.heading')
    expect(t('onboarding.upload.body', 'en')).toBe('onboarding.upload.body')
    expect(t('onboarding.illus.uploadButton', 'en')).toBe('onboarding.illus.uploadButton')
    expect(t('onboarding.illus.pickerTitle', 'en')).toBe('onboarding.illus.pickerTitle')
    // Indexed legacy from an even older naming pass.
    expect(t('onboarding.step1.heading', 'en')).toBe('onboarding.step1.heading')
    expect(t('onboarding.step2.heading', 'en')).toBe('onboarding.step2.heading')
    expect(t('onboarding.step3.heading', 'en')).toBe('onboarding.step3.heading')
  })
  it('CTA + chrome keys still in use exist in both langs', () => {
    // Only `done` (CTA on share step) and `close` (exit affordance)
    // survive the collapsed wizard. `next`, `letsGo`, `skip`, and
    // `revisitLink` were chrome for the multi-step flow and the hub;
    // both are gone.
    for (const key of [
      'onboarding.cta.done',
      'onboarding.close',
    ]) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })
  it('retired chrome keys (next/letsGo/skip/revisitLink) fall back to the key', () => {
    for (const key of [
      'onboarding.cta.next',
      'onboarding.cta.letsGo',
      'onboarding.skip',
      'onboarding.revisitLink',
    ]) {
      expect(t(key, 'en')).toBe(key)
      expect(t(key, 'es')).toBe(key)
    }
  })
  it('onboarding.stepOfTotal substitutes {n} and {total} in both langs', () => {
    expect(t('onboarding.stepOfTotal', 'en', { n: 1, total: 2 })).toBe('Step 1 of 2')
    expect(t('onboarding.stepOfTotal', 'es', { n: 1, total: 2 })).toBe('Paso 1 de 2')
  })
  it('settings help keys are retired (Help section removed)', () => {
    for (const key of ['settings.help', 'settings.showTutorial', 'settings.howToShare']) {
      expect(t(key, 'en')).toBe(key)
      expect(t(key, 'es')).toBe(key)
    }
  })
})
