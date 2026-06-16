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
    expect(t('nav.speak', 'en')).toBe('Speak')
  })
  it('returns Spanish string for es', () => {
    expect(t('nav.speak', 'es')).toBe('Hablar')
  })
  it('returns the key itself when not found', () => {
    expect(t('nonexistent.key', 'en')).toBe('nonexistent.key')
  })
  it('substitutes {n} replacement', () => {
    expect(t('home.inProgressCountMany', 'en', { n: 5 })).toBe('5 in progress')
  })
  it('substitutes {n} replacement in Spanish', () => {
    expect(t('home.inProgressCountMany', 'es', { n: 5 })).toBe('5 en proceso')
  })
})

describe('nav.* renamed for the three nav tabs', () => {
  // Speak → Review → Vocabulary → Settings. History of renames:
  // `nav.recordings` → `nav.review`; `nav.write` → `nav.study` →
  // `nav.refine` → `nav.vocabulary`; `nav.practise` → `nav.speak`. Old keys
  // deliberately removed so a stale reference surfaces as the literal key.
  it('nav.speak + nav.review + nav.vocabulary + nav.settings are the four tabs', () => {
    for (const key of ['nav.speak', 'nav.review', 'nav.vocabulary', 'nav.settings']) {
      expect(t(key, 'en')).not.toBe(key)
      expect(t(key, 'es')).not.toBe(key)
    }
  })

  it('nav.recordings is retired (use nav.review for the conversations inbox)', () => {
    expect(t('nav.recordings', 'en')).toBe('nav.recordings')
    expect(t('nav.recordings', 'es')).toBe('nav.recordings')
  })

  it('nav.write is retired (use nav.vocabulary for the saved-corrections surface)', () => {
    expect(t('nav.write', 'en')).toBe('nav.write')
    expect(t('nav.write', 'es')).toBe('nav.write')
  })

  it('nav.study is retired (use nav.vocabulary for the saved-corrections surface)', () => {
    expect(t('nav.study', 'en')).toBe('nav.study')
    expect(t('nav.study', 'es')).toBe('nav.study')
  })

  it('nav.refine is retired (use nav.vocabulary for the saved-corrections surface)', () => {
    expect(t('nav.refine', 'en')).toBe('nav.refine')
    expect(t('nav.refine', 'es')).toBe('nav.refine')
  })

  it('nav.practise is retired (use nav.speak for the home tab)', () => {
    expect(t('nav.practise', 'en')).toBe('nav.practise')
    expect(t('nav.practise', 'es')).toBe('nav.practise')
  })

  it('nav.practice is retired (no dedicated tab — reached from home mode cards)', () => {
    expect(t('nav.practice', 'en')).toBe('nav.practice')
    expect(t('nav.practice', 'es')).toBe('nav.practice')
  })
})

describe('home.* methodology eyebrow + three doors', () => {
  it('home.pillarSpeak / Review / Refine read as the pillar names', () => {
    expect(t('home.pillarSpeak', 'en')).toBe('Speak')
    expect(t('home.pillarReview', 'en')).toBe('Review')
    expect(t('home.pillarRefine', 'en')).toBe('Refine')
    expect(t('home.pillarSpeak', 'es')).toBe('Hablar')
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
    expect(t('annotation.savePrimary', 'en')).toBe('Save to my Vocabulary')
    expect(t('annotation.savePrimary', 'es')).toBe('Guardar en mi Vocabulario')
  })
  it('annotation.savedPrimary names the destination so the button itself is the receipt', () => {
    expect(t('annotation.savedPrimary', 'en')).toMatch(/saved to (my )?vocabulary/i)
    expect(t('annotation.savedPrimary', 'es')).toMatch(/guardada/i)
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
  // Legacy keys: WriteList no longer renders tabs (only a "Studied" archive
  // divider). Kept as-is — unrendered, so out of scope for the Vocabulary
  // wording pass.
  it('writeList.tabWrite still reads "Study" in en (dead key, unrendered)', () => {
    expect(t('writeList.tabWrite', 'en')).toBe('Study')
  })
  it('writeList.tabWritten still reads "Written" in en (dead key, unrendered)', () => {
    expect(t('writeList.tabWritten', 'en')).toBe('Written')
  })
  it('writeList.tabWritten exists in es', () => {
    expect(t('writeList.tabWritten', 'es')).not.toBe('writeList.tabWritten')
  })
  it('writeSheet.markWritten is retired (falls back to key)', () => {
    expect(t('writeSheet.markWritten', 'en')).toBe('writeSheet.markWritten')
    expect(t('writeSheet.moveBack', 'en')).toBe('writeSheet.moveBack')
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
  it('nav.vocabulary replaced nav.refine for the saved-corrections tab', () => {
    expect(t('nav.vocabulary', 'en')).toBe('Vocabulary')
    expect(t('nav.vocabulary', 'es')).toBe('Vocabulario')
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
