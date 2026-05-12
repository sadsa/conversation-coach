// lib/i18n.ts
import type { TargetLanguage } from '@/lib/types'

export type UiLanguage = 'en' | 'es'

export function inferUiLanguage(target: TargetLanguage): UiLanguage {
  return target === 'en-NZ' ? 'es' : 'en'
}

type Replacements = Record<string, string | number>

export function t(key: string, lang: UiLanguage, replacements?: Replacements): string {
  const template = TRANSLATIONS[lang][key] ?? key
  if (!replacements) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => String(replacements[k] ?? ''))
}

const TRANSLATIONS: Record<UiLanguage, Record<string, string>> = {
  en: {
    // Common
    'common.close': 'Dismiss',

    // Navigation
    'nav.recordings': 'Recordings',
    'nav.write': 'Write',
    'nav.settings': 'Settings',
    'nav.skipToContent': 'Skip to content',
    'nav.back': 'Back',
    'nav.openMenu': 'Open menu',
    'nav.closeMenu': 'Close menu',
    'nav.switchToLight': 'Switch to light mode',
    'nav.switchToDark': 'Switch to dark mode',
    'nav.quickNavAria': 'Quick navigation',
    'nav.signOut': 'Sign out',

    // Practice
    'nav.practice': 'Practice',
    'practice.heading': 'Have a conversation',
    'practice.description': "Chat in {language} for a few minutes — the coach starts, just respond naturally. Afterwards we'll go over the moments worth practising.",
    'lang.es-AR': 'Spanish',
    'lang.en-NZ': 'English',
    'practice.idleMeta': 'Uses your microphone · 5-minute session · reviewed for corrections after',
    'practice.start': 'Start chatting',
    'practice.connecting': 'Connecting to the coach…',
    'practice.endingState': 'Hanging up…',
    'practice.statusMuted': 'Muted',
    'practice.muteAria': 'Mute microphone',
    'practice.unmuteAria': 'Unmute microphone',
    'practice.muteLabel': 'Mute',
    'practice.unmuteLabel': 'Unmute',
    'practice.end': 'Hang up',
    'practice.endAria': 'Hang up',
    'practice.shortcutHint': 'Esc to hang up · Space to mute',
    'practice.timeRemaining': '{time} left',
    'practice.warningToast': "1 minute left — wrap up when you're ready",
    'practice.analysing': 'Going over your conversation…',
    'practice.analysingHint': 'Taking you to your corrections — usually 10–20 seconds',
    'practice.errorConnect': "Couldn't connect — check your network and try again",
    'practice.errorMic': 'We need microphone access to hear you',
    'practice.errorNoSpeech': "Didn't catch any speech this time",
    'practice.errorAnalysis': "Couldn't finish the review",
    'practice.tryAgain': 'Try again',
    'practice.startOver': 'Start over',
    'practice.navAway': "We're still reviewing your conversation. Leave anyway?", // unused — beforeunload shows the browser's own dialog
    'practice.timerAria': 'Time remaining: {time}',
    'practice.timerAriaElapsed': 'Session length: {time}',
    'practice.reviewHeading': 'Save this conversation?',
    'practice.reviewEncouragement': "We'll highlight the moments worth practising.",
    'practice.reviewMeta': 'Session length: {time}',
    'practice.reviewSave': 'Save and review',
    'practice.reviewDiscard': 'Discard',
    'practice.reviewResume': 'Continue conversation',
    'practice.discardToast': 'Session discarded',
    'practice.discardUndo': 'Undo',
    'practice.youLabel': 'You',
    'practice.coachLabel': 'Coach',

    // Auth — login page
    'auth.signInTitle': 'Sign in with your email',
    'auth.signInSubtitle': 'Sign in to review your recorded conversations.',
    'auth.emailLabel': 'Email',
    'auth.emailPlaceholder': 'you@example.com',
    'auth.submit': 'Email me a sign-in link',
    'auth.submitting': 'Sending…',
    'auth.invitedNote': "Invite-only — we'll send a sign-in link to your inbox, no password needed.",
    'auth.linkSentTo': 'We sent a sign-in link to {email}.',
    'auth.linkSentNote':
      "Open it on this device to sign in. Check your spam if you don't see it in a few minutes.",
    'auth.continueAs': 'Continue as {email}',
    'auth.openMailApp': 'Open mail app',
    'auth.useDifferentEmail': 'Use a different email',
    'auth.invalidEmail': "That doesn't look like an email address.",
    'auth.error.rateLimit':
      "Too many sign-in attempts. Wait a minute, then try again.",
    'auth.error.signupDisabled':
      "Sign-ups are paused right now. Reach out to the person who shared this app.",
    'auth.error.invalidEmail':
      "We couldn't send to that address. Double-check it and try again.",
    'auth.error.generic': "We couldn't send the link — please try again.",

    // Access denied
    'accessDenied.title': 'Access required',
    'accessDenied.subtitle':
      "Conversation Coach is invite-only. Your email isn't on the list yet.",
    'accessDenied.emailButton': 'Email a request to the owner',
    'accessDenied.copyPrefix': 'or copy {email}',
    'accessDenied.copied': 'Copied',
    'accessDenied.fallback':
      'Reach out to the person who shared this app to request access.',
    'accessDenied.signOut': 'Sign out and use a different email',
    'accessDenied.requestSubject': 'Conversation Coach access request',
    'accessDenied.requestBody': "Hi,\n\nI'd like to request access to Conversation Coach.\n\nThanks,",

    // Home page
    'home.title': 'Conversation Coach',
    'home.subtitle': 'Upload a recorded conversation to get feedback on your speech.',
    'home.uploading': 'Uploading…',
    'home.uploadFailed': 'Upload failed — please try again',
    'home.pastSessions': 'Past Sessions',

    // Dashboard
    'home.greetingMorning': 'Good morning',
    'home.greetingAfternoon': 'Good afternoon',
    'home.greetingEvening': 'Good evening',
    'home.uploadFabAria': 'Upload audio',
    'home.uploadFabLabel': 'Upload audio',
    'home.dashboardSubtitle': '',
    'home.firstRunSubtitle': 'Practice by chatting — or share a recording from WhatsApp.',
    'home.coachmarkCaption': 'Tap here to upload your first recording.',
    'home.coachmarkDismiss': 'Dismiss tip',
    'home.revisitTutorial': 'Revisit the tutorial',
    'home.remindersAria': 'Saved corrections',
    'home.allCaughtUp': 'All caught up — nothing to write down right now.',
    'home.recentSessionsTitle': 'Your conversations',
    'home.recentShowAll': 'Show all {n}',
    'home.recentShowFewer': 'Show fewer',
    'home.recentBucketToday': 'Today',
    'home.recentBucketYesterday': 'Yesterday',
    'home.recentBucketThisWeek': 'This week',
    'home.recentBucketEarlier': 'Earlier',
    'home.recentSessionUnreadAria': 'Unread',
    'home.newSessionTitle': 'Start a new session',
    'home.newSessionSubtitle': 'Upload a recorded conversation to get fresh feedback.',
    'home.inProgressTitle': 'Currently processing',
    'home.inProgressCountOne': '1 in progress',
    'home.inProgressCountMany': '{n} in progress',
    'home.practiceCTATitle': 'Practice with your coach',
    'home.practiceCTASubtitle': 'Start a 5-minute voice session in Spanish',
    'home.uploadRecording': 'Upload recording',
    'home.noRecordingsYet': 'No recordings yet — share audio from WhatsApp to get started.',

    // Drop zone
    'dropzone.title': 'Upload conversation',
    'dropzone.formats': 'MP3, M4A, WAV, OGG, OPUS, AAC',
    'dropzone.browse': 'Browse',
    'dropzone.ariaLabel': 'Upload audio file',
    'dropzone.errorFormat': 'Unsupported format. Use MP3, M4A, WAV, OGG, OPUS, or AAC.',
    'dropzone.errorSize': 'File too large. Maximum is 500 MB.',

    // Pending upload card
    'upload.recordingType': 'Recording type:',
    'upload.solo': 'Solo',
    'upload.conversation': 'Conversation',
    'upload.speakers': 'Speakers:',
    'upload.dismiss': 'Dismiss',
    'upload.uploadBtn': 'Upload →',

    // Session list status labels
    'status.uploading': 'Uploading…',
    'status.transcribing': 'Transcribing…',
    'status.identifying': 'Awaiting speaker ID',
    'status.analysing': 'Analysing…',
    'status.ready': 'Ready',
    'status.error': 'Error',

    // Session list
    'session.delete': 'Delete',
    'session.deleteTitle': 'Delete session?',
    'session.deleteWarning': 'will be permanently deleted, along with all its corrections and any you\'ve saved to your Write list.',
    'session.deleteButton': 'Delete',
    'session.cancelButton': 'Cancel',
    'session.noSessions': 'No sessions yet — tap Upload to add your first conversation.',
    'session.deleteError': 'Couldn\'t delete session — try again.',
    // Optimistic delete + 5s Undo (parity with /write). Replaces the old
    // confirmation modal: the swipe is the commit, the toast is the safety net.
    'session.movedToTrash': 'Conversation moved to trash.',
    'session.undo': 'Undo',
    // Swipe-right toggle on a session row in the recent inbox.
    'session.markUnread': 'Mark unread',
    'session.markRead': 'Mark read',
    'session.markUnreadAria': 'Mark "{title}" as unread',
    'session.markReadAria': 'Mark "{title}" as read',
    'session.toggleReadError': 'Couldn\'t update — try again.',
    // Pipeline status
    'pipeline.uploading': 'Uploading',
    'pipeline.transcribing': 'Transcribing',
    'pipeline.identifying': 'Identifying speakers',
    'pipeline.analysing': 'Analysing your speech',
    'pipeline.ready': 'Ready',
    // Full-sentence status copy for the consolidated processing screen.
    // The short labels above are kept in case future surfaces want a terse
    // form (badges, breadcrumbs); the unified screen reads these instead.
    'pipeline.statusUploading': 'Uploading your audio…',
    'pipeline.statusTranscribing': 'Transcribing your conversation…',
    'pipeline.statusAnalysing': 'Analysing your conversation…',
    'pipeline.statusFallbackHint': 'This usually takes a minute or two.',
    'pipeline.errorUploading': 'Upload failed.',
    'pipeline.errorTranscribing': 'Transcription failed.',
    'pipeline.errorAnalysing': 'Analysis failed.',
    'pipeline.errorGeneric': 'Something went wrong.',
    'pipeline.errorUploadingDetail':
      "We couldn't send your recording. This is usually a connection issue — your audio is safe.",
    'pipeline.errorTranscribingDetail':
      "The transcription service didn't respond. Most of the time another try is all it takes.",
    'pipeline.errorAnalysingDetail':
      "The analysis didn't finish. Your transcript is saved — we just need another pass over it.",
    'pipeline.errorGenericDetail':
      'Your recording is safe. Try again in a moment, or come back later.',
    'pipeline.retry': 'Try again',
    'pipeline.estimatedTime': 'Usually ready in ~{n} min',
    'pipeline.takingLong':
      'Taking longer than expected — longer recordings can take a few minutes.',
    'pipeline.retryAnalysis': 'Retry analysis',
    'pipeline.retrying': 'Retrying…',
    'pipeline.moreActions': 'More actions',
    'pipeline.deleteSession': 'Delete session',
    'pipeline.deleteTitle': 'Delete this session?',
    'pipeline.deleteBody': 'This will stop processing and permanently remove the session and its audio. This can\'t be undone.',
    'pipeline.deleteConfirm': 'Delete',
    'pipeline.deleteCancel': 'Keep processing',
    'pipeline.deleteError': 'Couldn\'t delete — try again.',
    // Reassurance + meta
    'pipeline.recordedOn': 'Recorded {date}',
    'pipeline.audioLength': '{n} min recording',
    'pipeline.audioLengthShort': '{n} sec recording',
    'pipeline.leaveBreak':
      "Feel free to close this page — we'll keep working in the background.",
    'pipeline.leaveBreakNotify':
      "Feel free to close this page — we'll send a notification when it's ready.",
    // Inline notification permission prompt
    'pipeline.notifyPromptTitle': 'Want a heads-up when it\u2019s ready?',
    'pipeline.notifyPromptBody':
      'We can ping you on this device so you don\u2019t have to wait here.',
    'pipeline.notifyPromptAccept': 'Notify me',
    'pipeline.notifyPromptDismiss': 'Not now',
    // Active-stage hints (rotating, gentle)
    'pipeline.hint.uploading.0': 'Sending your audio safely',
    'pipeline.hint.transcribing.0': 'Listening to every word',
    'pipeline.hint.transcribing.1': 'Picking up punctuation and pauses',
    'pipeline.hint.analysing.0': 'Reading the transcript closely',
    'pipeline.hint.analysing.1': 'Looking for grammar to refine',
    'pipeline.hint.analysing.2': 'Noting where phrasing could feel more natural',
    'pipeline.hint.analysing.3': 'Comparing your tense and pronoun choices',
    // Stepper a11y
    'pipeline.stageDone': '{label} (done)',
    'pipeline.stageActive': '{label} (in progress)',
    'pipeline.stagePending': '{label} (pending)',

    // Transcript page
    'transcript.loading': 'Loading transcript…',
    'transcript.loadError': 'We couldn\'t load this session. Check your connection and try again.',
    'transcript.retry': 'Retry',
    'transcript.grammar': 'grammar',
    'transcript.naturalness': 'naturalness',
    'transcript.min': 'min',
    'transcript.you': 'You',
    'transcript.them': 'Them',
    'transcript.reanalyse': 'Re-analyse session',
    'transcript.markUnread': 'Mark as unread',
    'transcript.markedUnreadToast': 'Marked as unread.',
    'transcript.markUnreadError': 'Couldn\'t mark as unread — try again.',
    'transcript.moreActions': 'More actions',
    'transcript.editTitle': 'Rename session',
    'transcript.progress': '{saved} saved · {dismissed} dismissed · {remaining} to go',
    'transcript.progressAria': '{n} of {total} reviewed',
    'transcript.progressAllReviewed': 'All {total} reviewed',
    'transcript.legend.amber': 'needs review',
    'transcript.legend.violet': 'saved',
    'transcript.legend.green': 'written down',
    'transcript.openCorrection': 'Open correction',
    'transcript.themRevealHint': 'Tap to read',
    'transcript.markState.written': 'written down',
    'transcript.markState.saved': 'saved',
    'transcript.markState.unreviewed': 'needs review',

    // Re-analyse confirmation
    'reanalyse.title': 'Replace this session\'s corrections?',
    'reanalyse.body': 'Re-analysing rewrites every correction for this session. Saved corrections keep their flashcards — only the corrections shown here are replaced.',
    'reanalyse.confirm': 'Replace corrections',
    'reanalyse.cancel': 'Keep current',
    'reanalyse.error': 'Couldn\'t start re-analysis — try again.',

    // Annotation sheet (replaces the modal)
    'sheet.close': 'Close',
    'sheet.prev': 'Previous correction',
    'sheet.next': 'Next correction',
    'sheet.position': '{n} of {total}',
    'sheet.navHintFirst': 'Tip — use ← → or swipe between corrections.',
    'sheet.navHintDismiss': 'Got it',

    // Identify page
    'identify.loading': 'Loading…',
    'identify.title': 'Select all speakers that are you',
    'identify.subtitle': 'Tap a speaker to select it. You can select both if they\'re all you.',
    'identify.confirm': 'Confirm →',

    // Speaker card
    'speaker.label': 'Speaker {label}',

    // Annotation card — primary save action. The saved-state label spells
    // out the destination so the button itself is the receipt; we used to
    // pair it with a separate "Added to your Write list" hint paragraph
    // underneath, which was redundant.
    'annotation.savePrimary': 'Save to my Write list',
    'annotation.savedPrimary': 'Added to my Write list',
    'annotation.savePrimaryAria': 'Save this correction to your Write list',
    'annotation.savedPrimaryAria': 'Remove this correction from your Write list',
    // Quiet secondary "this correction wasn't useful" affordance
    'annotation.notUseful': 'Not useful — hide it',
    'annotation.notUsefulRestore': 'Restore this correction',
    'annotation.notUsefulAria': 'Mark as not useful and hide from the transcript',
    'annotation.notUsefulRestoreAria': 'Restore this correction',
    // Hidden-state caption — kept so the visual fade isn't the only signal.
    'annotation.unhelpfulHint': 'Hidden from your transcript.',
    // Errors are surfaced with an inline Retry rather than auto-dismissing
    'annotation.saveError': "Couldn't save that — let's try again.",
    'annotation.unhelpfulError': "Couldn't save your feedback — let's try again.",
    'annotation.retry': 'Retry',
    'annotation.offlineNote': "You're offline right now — try again once you're back.",
    // Importance pill (replaces the ASCII star cluster)
    'annotation.importantPill': 'Worth remembering',
    'annotation.importantPillHigh': 'High priority',
    'annotation.importantPillAria': 'Show why this correction matters',
    'type.grammar': 'Grammar',
    'type.naturalness': 'Naturalness',

    // Write it down sheet
    'writeItDown.title': 'Write it down first',
    'writeItDown.subtitle': 'Reinforce before it becomes a flashcard',
    'writeItDown.promptsLabel': 'Write it 3 ways on paper',
    'writeItDown.prompt1': "A sentence you'd actually say to someone",
    'writeItDown.prompt2': 'As a question using voseo',
    'writeItDown.prompt3': 'Using a past or future tense',
    'writeItDown.checkboxLabel': "I've written it down on paper",
    'writeItDown.confirmLabel': 'Create flashcard',
    'writeItDown.successLabel': 'Flashcard created ✓',

    'home.toWriteDown': '{n} corrections to write down',
    'home.toWriteDownOne': '1 correction to write down',

    // Write page (the queue of saved corrections waiting to be written down)
    'write.title': 'Write',
    // Empty-state only. The H1 already names the surface; the subtitle's
    // job here is to invite the next action without restating "saved
    // corrections waiting to be written down" (the page is the noun, the
    // subtitle is the verb).
    'write.subtitle': 'Pick up a saved correction whenever you\'re ready.',
    'write.loading': 'Loading…',
    'write.error': 'Error: {msg}',

    // Write list — view toggle (asymmetric: Write is the primary surface,
    // Written is a quiet archive link rather than a peer tab).
    'writeList.viewLabel': 'Saved corrections',
    'writeList.tabWrite': 'Write',
    'writeList.tabWritten': 'Written',
    'writeList.archiveHeading': 'Written',
    'writeList.archiveLink': 'written',
    'writeList.backToWrite': 'Back to Write',
    'writeList.markDoneShort': 'Done',
    'writeList.emptyWriteCaption': 'Saved corrections look like this.',
    'writeList.emptyWriteCta': 'Start a session to save more →',
    'writeList.emptyWritten': 'Nothing here yet. Items show up here once you mark them as written.',
    'writeList.emptyWrittenCaption': 'Items you\'ve written down land here, faded so they don\'t crowd the queue.',
    'writeList.emptyWrittenCta': '← Back to Write ({count})',
    'writeList.emptyWrittenNoQueue': 'Nothing in your Write queue either — start a session to save your first correction.',
    'writeList.markRowAria': 'Mark "{original}" as written',
    // Toasts only fire on the destructive / error paths now: success
    // states (mark-written, move-back) are silent because the row leaving
    // the current tab is more confirmation than the user needs.
    'writeList.movedToTrash': 'Removed. You can grab it back.',
    'writeList.undo': 'Undo',
    'writeList.deleteError': 'Couldn\'t delete item — try again.',
    'writeList.markWrittenError': 'Couldn\'t update — try again.',
    'writeList.importanceToggleAria': 'Toggle importance explanation',

    // Write review sheet (docked)
    'writeSheet.aria': 'Review saved correction',
    // Primary action — verb-first, with destination spelled out so the user
    // knows where the item is going. Busy variant keeps focus while the
    // network is in flight.
    'writeSheet.markWritten': 'Mark as written',
    'writeSheet.markWrittenBusy': 'Marking…',
    'writeSheet.markWrittenAria': 'Mark this correction as written down on paper',
    'writeSheet.moveBack': 'Move back to Write list',
    'writeSheet.moveBackBusy': 'Moving back…',
    'writeSheet.moveBackAria': 'Move this correction back to the Write list',
    // Overflow menu — Delete is undoable for 5 seconds via the toast, so the
    // copy is reassuring rather than threatening.
    'writeSheet.moreActionsAria': 'More actions',
    'writeSheet.deleteLabel': 'Delete',
    'writeSheet.deleteAria': 'Delete this item (you can undo for 5 seconds)',

    // Settings page
    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.textSize': 'Text Size',
    'settings.preview': 'Preview',
    'settings.previewYou': 'You',
    'settings.previewThem': 'Them',
    'settings.previewSentence': 'Hoy fui al mercado y compré muchas cosas para la semana.',
    'settings.previewResponse': '¿Y qué compraste?',
    'settings.targetLanguage': 'Target Language',
    'settings.account': 'Account',
    'settings.signOut': 'Sign out',
    'settings.signOutError': 'Sign out failed — please try again',
    'settings.app': 'App',
    'settings.version': 'Version',
    // Onboarding — language select (step 0)
    'onboarding.languageSelect.heading': 'What are you learning?',
    'onboarding.languageSelect.body': 'Change anytime in Settings.',
    'onboarding.languageSelect.targetLanguageAria': 'Target language',
    'onboarding.languageSelect.spanish': 'Spanish',
    'onboarding.languageSelect.spanishVariant': 'Rioplatense · Argentine',
    'onboarding.languageSelect.english': 'English',
    'onboarding.languageSelect.englishVariant': 'New Zealand English',
    'onboarding.languageSelect.cta': 'Get started →',
    // Onboarding — tutorial steps (semantic keys; URL ?step=1 → upload, ?step=2 → share)
    'onboarding.upload.heading': 'Upload a recording',
    'onboarding.upload.body':
      'Tap Upload audio and pick a file. It transcribes automatically.',
    'onboarding.share.heading': 'Share straight from WhatsApp',
    'onboarding.share.body':
      'Hold a WhatsApp voice note, tap Share, choose Conversation Coach.',
    // Onboarding — illustration labels (decorative mockups, but learners deserve their own language)
    'onboarding.illus.uploadButton': 'Upload audio',
    'onboarding.illus.shareTitle': 'Share voice note via…',
    'onboarding.illus.appMessages': 'Messages',
    'onboarding.illus.appMail': 'Mail',
    'onboarding.illus.appCoach': 'Coach',
    'onboarding.illus.appFiles': 'Files',
    'onboarding.illus.shareContact': 'María',
    'onboarding.illus.pickerTitle': 'Audio files',
    // Onboarding — chrome
    'onboarding.cta.next': 'Next →',
    'onboarding.cta.letsGo': "Let's go →",
    'onboarding.cta.done': 'Done',
    'onboarding.skip': 'Skip tutorial',
    'onboarding.close': 'Close',
    'onboarding.stepOfTotal': 'Step {n} of {total}',
    'onboarding.revisitLink': 'Revisit tutorial →',
    'settings.help': 'Help',
    'settings.howToUpload': 'How to upload audio',
    'settings.howToShare': 'Share from WhatsApp',

    // Sub-categories
    'subCat.verb-conjugation': 'Verb conjugation',
    'subCat.subjunctive': 'Subjunctive',
    'subCat.gender-agreement': 'Gender agreement',
    'subCat.number-agreement': 'Number agreement',
    'subCat.ser-estar': 'Ser / Estar',
    'subCat.por-para': 'Por / Para',
    'subCat.tense-selection': 'Tense selection',
    'subCat.article-usage': 'Article usage',
    'subCat.word-order': 'Word order',
    'subCat.vocabulary-choice': 'Vocabulary choice',
    'subCat.register': 'Register',
    'subCat.phrasing': 'Phrasing',
    'subCat.other': 'Other',

    // Voice widget
    'voice.startLabel': 'Talk it through',
    'voice.startAria': 'Start voice conversation',
    'voice.endAria': 'End voice conversation',
    'voice.muteAria': 'Mute microphone',
    'voice.unmuteAria': 'Unmute microphone',
    'voice.toolbarAria': 'Voice conversation controls',
    'voice.indicatorIdle': 'Listening',
    'voice.indicatorUser': 'You are speaking',
    'voice.indicatorAgent': 'Coach is speaking',
    'voice.indicatorMuted': 'Microphone muted',
    'voice.micPermission': 'Microphone access needed. Check browser settings.',
    'voice.sessionEnded': 'Voice session ended',
    'voice.connecting': 'Connecting…',
    'voice.reconnecting': 'Reconnecting…',
    'voice.coachTitle': 'Voice coach',
    'voice.languagePill.esAR': 'ES-AR',
    'voice.languagePill.enNZ': 'EN-NZ',
    'voice.startCoachmark': 'Ask the coach anything',
    'voice.statusListening': 'Listening…',
    'voice.statusMuted': 'Muted',
    'voice.regionAria': 'Voice coach session',
    'voice.connectedAnnouncement': 'Voice coach connected',
    'voice.connectingAnnouncement': 'Connecting to voice coach',
    'voice.shortcutHint': 'Esc to end · Space to mute',
    'voice.tryAgain': 'Try again',
    'voice.muteLabel': 'Mute',
    'voice.unmuteLabel': 'Unmute',
    'voice.endLabel': 'End',
  },

  es: {
    // Common
    'common.close': 'Cerrar',

    // Navigation
    'nav.recordings': 'Grabaciones',
    'nav.write': 'Anotar',
    'nav.settings': 'Configuración',
    'nav.skipToContent': 'Saltar al contenido',
    'nav.back': 'Atrás',
    'nav.openMenu': 'Abrir menú',
    'nav.closeMenu': 'Cerrar menú',
    'nav.switchToLight': 'Cambiar a modo claro',
    'nav.switchToDark': 'Cambiar a modo oscuro',
    'nav.quickNavAria': 'Navegación rápida',
    'nav.signOut': 'Cerrar sesión',

    // Practice
    'nav.practice': 'Práctica',
    'practice.heading': 'Tener una charla',
    'practice.description': 'Charlá en {language} unos minutos — el coach empieza, respondé naturalmente. Después repasamos juntos los momentos que vale la pena practicar.',
    'lang.es-AR': 'español',
    'lang.en-NZ': 'inglés',
    'practice.idleMeta': 'Usa tu micrófono · sesión de 5 minutos · revisión de errores después',
    'practice.start': 'Empezar a charlar',
    'practice.connecting': 'Conectando con el coach…',
    'practice.endingState': 'Colgando…',
    'practice.statusMuted': 'Silenciado',
    'practice.muteAria': 'Silenciar micrófono',
    'practice.unmuteAria': 'Activar micrófono',
    'practice.muteLabel': 'Silenciar',
    'practice.unmuteLabel': 'Activar',
    'practice.end': 'Colgar',
    'practice.endAria': 'Colgar',
    'practice.shortcutHint': 'Esc para colgar · Espacio para silenciar',
    'practice.timeRemaining': 'Falta {time}',
    'practice.warningToast': '1 minuto restante — cerrá cuando quieras',
    'practice.analysing': 'Repasando tu conversación…',
    'practice.analysingHint': 'Ya te llevamos a tu revisión — suele tardar 10–20 segundos',
    'practice.errorConnect': 'No se pudo conectar — revisá la red e intentá de nuevo',
    'practice.errorMic': 'Necesitamos acceso al micrófono para escucharte',
    'practice.errorNoSpeech': 'Esta vez no se detectó ninguna voz',
    'practice.errorAnalysis': 'No se pudo terminar la revisión',
    'practice.tryAgain': 'Intentar de nuevo',
    'practice.startOver': 'Empezar de nuevo',
    'practice.navAway': 'Todavía estamos repasando tu conversación. ¿Salir igual?', // unused — beforeunload muestra el diálogo nativo del browser
    'practice.timerAria': 'Tiempo restante: {time}',
    'practice.timerAriaElapsed': 'Duración de la charla: {time}',
    'practice.reviewHeading': '¿Guardar esta charla?',
    'practice.reviewEncouragement': 'Vamos a marcar los momentos que vale la pena practicar.',
    'practice.reviewMeta': 'Charla de {time}',
    'practice.reviewSave': 'Guardar y revisar',
    'practice.reviewDiscard': 'Descartar',
    'practice.reviewResume': 'Continuar la charla',
    'practice.discardToast': 'Charla descartada',
    'practice.discardUndo': 'Deshacer',
    'practice.youLabel': 'Vos',
    'practice.coachLabel': 'Coach',

    // Auth — login page
    'auth.signInTitle': 'Iniciá sesión con tu correo',
    'auth.signInSubtitle': 'Iniciá sesión para revisar tus conversaciones grabadas.',
    'auth.emailLabel': 'Correo electrónico',
    'auth.emailPlaceholder': 'vos@ejemplo.com',
    'auth.submit': 'Enviame un enlace de inicio',
    'auth.submitting': 'Enviando…',
    'auth.invitedNote': 'Solo por invitación — te enviamos un enlace de inicio, sin contraseña.',
    'auth.linkSentTo': 'Te enviamos un enlace de inicio a {email}.',
    'auth.linkSentNote':
      'Abrilo en este dispositivo para iniciar sesión. Revisá spam si no lo ves en unos minutos.',
    'auth.continueAs': 'Continuar como {email}',
    'auth.openMailApp': 'Abrir la app de correo',
    'auth.useDifferentEmail': 'Usar otro correo',
    'auth.invalidEmail': 'Eso no parece una dirección de correo válida.',
    'auth.error.rateLimit':
      'Demasiados intentos. Esperá un minuto y volvé a intentar.',
    'auth.error.signupDisabled':
      'Los registros están pausados ahora. Contactá a quien compartió esta app.',
    'auth.error.invalidEmail':
      'No pudimos enviar a esa dirección. Revisala e intentá de nuevo.',
    'auth.error.generic': 'No pudimos enviar el enlace — por favor intentá de nuevo.',

    // Access denied
    'accessDenied.title': 'Acceso requerido',
    'accessDenied.subtitle':
      'Conversation Coach es por invitación. Tu correo todavía no está en la lista.',
    'accessDenied.emailButton': 'Enviar una solicitud al propietario',
    'accessDenied.copyPrefix': 'o copiar {email}',
    'accessDenied.copied': 'Copiado',
    'accessDenied.fallback':
      'Contactá a quien compartió esta app para solicitar acceso.',
    'accessDenied.signOut': 'Cerrar sesión y usar otro correo',
    'accessDenied.requestSubject': 'Solicitud de acceso a Conversation Coach',
    'accessDenied.requestBody': 'Hola,\n\nMe gustaría solicitar acceso a Conversation Coach.\n\nGracias,',

    // Home page
    'home.title': 'Entrenador de conversación',
    'home.subtitle': 'Subí una conversación grabada para recibir retroalimentación sobre tu habla.',
    'home.uploading': 'Subiendo…',
    'home.uploadFailed': 'Error al subir — por favor intentá de nuevo',
    'home.pastSessions': 'Sesiones anteriores',

    // Dashboard
    'home.greetingMorning': 'Buenos días',
    'home.greetingAfternoon': 'Buenas tardes',
    'home.greetingEvening': 'Buenas noches',
    'home.uploadFabAria': 'Subir audio',
    'home.uploadFabLabel': 'Subir audio',
    'home.dashboardSubtitle': '',
    'home.firstRunSubtitle': 'Practicá chateando — o compartí una grabación desde WhatsApp.',
    'home.coachmarkCaption': 'Tocá acá para subir tu primera grabación.',
    'home.coachmarkDismiss': 'Cerrar consejo',
    'home.revisitTutorial': 'Ver el tutorial otra vez',
    'home.remindersAria': 'Correcciones guardadas',
    'home.allCaughtUp': 'Todo al día — no tenés correcciones guardadas.',
    'home.recentSessionsTitle': 'Tus conversaciones',
    'home.recentShowAll': 'Mostrar las {n}',
    'home.recentShowFewer': 'Mostrar menos',
    'home.recentBucketToday': 'Hoy',
    'home.recentBucketYesterday': 'Ayer',
    'home.recentBucketThisWeek': 'Esta semana',
    'home.recentBucketEarlier': 'Antes',
    'home.recentSessionUnreadAria': 'Sin leer',
    'home.newSessionTitle': 'Empezar una sesión nueva',
    'home.newSessionSubtitle': 'Subí una conversación grabada para recibir nuevas correcciones.',
    'home.inProgressTitle': 'Procesando ahora',
    'home.inProgressCountOne': '1 en proceso',
    'home.inProgressCountMany': '{n} en proceso',
    'home.practiceCTATitle': 'Practicá con tu coach',
    'home.practiceCTASubtitle': 'Empezá una sesión de voz de 5 minutos en español',
    'home.uploadRecording': 'Subir grabación',
    'home.noRecordingsYet': 'Aún no hay grabaciones — compartí audio desde WhatsApp para empezar.',

    // Drop zone
    'dropzone.title': 'Subir conversación',
    'dropzone.formats': 'MP3, M4A, WAV, OGG, OPUS, AAC',
    'dropzone.browse': 'Explorar',
    'dropzone.ariaLabel': 'Subir archivo de audio',
    'dropzone.errorFormat': 'Formato no compatible. Usá MP3, M4A, WAV, OGG, OPUS, o AAC.',
    'dropzone.errorSize': 'Archivo demasiado grande. El máximo es 500 MB.',

    // Pending upload card
    'upload.recordingType': 'Tipo de grabación:',
    'upload.solo': 'Solo',
    'upload.conversation': 'Conversación',
    'upload.speakers': 'Hablantes:',
    'upload.dismiss': 'Cancelar',
    'upload.uploadBtn': 'Subir →',

    // Session list status labels
    'status.uploading': 'Subiendo…',
    'status.transcribing': 'Transcribiendo…',
    'status.identifying': 'Esperando ID del hablante',
    'status.analysing': 'Analizando…',
    'status.ready': 'Listo',
    'status.error': 'Error',

    // Session list
    'session.delete': 'Eliminar',
    'session.deleteTitle': '¿Eliminar sesión?',
    'session.deleteWarning': 'se eliminará permanentemente, junto con todas sus correcciones y las que guardaste en tu lista de Anotar.',
    'session.deleteButton': 'Eliminar',
    'session.cancelButton': 'Cancelar',
    'session.noSessions': 'Todavía no hay sesiones — tocá Subir para agregar tu primera conversación.',
    'session.deleteError': 'No se pudo eliminar la sesión — intentá de nuevo.',
    // Eliminado optimista con 5s para deshacer (mismo patrón que /write).
    // El gesto deslizar ya es la confirmación; el toast es la red de seguridad.
    'session.movedToTrash': 'Conversación enviada a la papelera.',
    'session.undo': 'Deshacer',
    // Toggle leído/sin leer al deslizar a la derecha sobre una fila.
    'session.markUnread': 'Sin leer',
    'session.markRead': 'Leída',
    'session.markUnreadAria': 'Marcar "{title}" como sin leer',
    'session.markReadAria': 'Marcar "{title}" como leída',
    'session.toggleReadError': 'No se pudo actualizar — intentá de nuevo.',
    // Toast de deshacer en el inicio cuando una visita marcó una fila como leída.
    // Pipeline status
    'pipeline.uploading': 'Subiendo',
    'pipeline.transcribing': 'Transcribiendo',
    'pipeline.identifying': 'Identificando hablantes',
    'pipeline.analysing': 'Analizando tu habla',
    'pipeline.ready': 'Listo',
    'pipeline.statusUploading': 'Subiendo tu audio…',
    'pipeline.statusTranscribing': 'Transcribiendo tu conversación…',
    'pipeline.statusAnalysing': 'Analizando tu conversación…',
    'pipeline.statusFallbackHint': 'Esto suele tardar uno o dos minutos.',
    'pipeline.errorUploading': 'Error al subir.',
    'pipeline.errorTranscribing': 'Error en la transcripción.',
    'pipeline.errorAnalysing': 'Error en el análisis.',
    'pipeline.errorGeneric': 'Algo salió mal.',
    'pipeline.errorUploadingDetail':
      'No pudimos enviar la grabación. Suele ser un problema de conexión — tu audio está a salvo.',
    'pipeline.errorTranscribingDetail':
      'El servicio de transcripción no respondió. Casi siempre se resuelve con otro intento.',
    'pipeline.errorAnalysingDetail':
      'El análisis no terminó. Tu transcripción está guardada — solo necesitamos pasarla de nuevo.',
    'pipeline.errorGenericDetail':
      'Tu grabación está a salvo. Probá de nuevo en un momento o volvé más tarde.',
    'pipeline.retry': 'Probar de nuevo',
    'pipeline.estimatedTime': 'Suele estar listo en ~{n} min',
    'pipeline.takingLong':
      'Está tardando más de lo esperado — las grabaciones largas pueden llevar unos minutos.',
    'pipeline.retryAnalysis': 'Reintentar análisis',
    'pipeline.retrying': 'Reintentando…',
    'pipeline.moreActions': 'Más acciones',
    'pipeline.deleteSession': 'Eliminar sesión',
    'pipeline.deleteTitle': '¿Eliminar esta sesión?',
    'pipeline.deleteBody': 'Esto detendrá el procesamiento y eliminará la sesión y su audio de forma permanente. Esta acción no se puede deshacer.',
    'pipeline.deleteConfirm': 'Eliminar',
    'pipeline.deleteCancel': 'Seguir procesando',
    'pipeline.deleteError': 'No se pudo eliminar — intentá de nuevo.',
    // Reassurance + meta
    'pipeline.recordedOn': 'Grabado {date}',
    'pipeline.audioLength': 'grabación de {n} min',
    'pipeline.audioLengthShort': 'grabación de {n} seg',
    'pipeline.leaveBreak':
      'Podés cerrar esta página — seguimos trabajando en segundo plano.',
    'pipeline.leaveBreakNotify':
      'Podés cerrar esta página — te avisamos con una notificación cuando esté listo.',
    // Inline notification permission prompt
    'pipeline.notifyPromptTitle': '¿Te avisamos cuando esté listo?',
    'pipeline.notifyPromptBody':
      'Podemos enviarte una notificación a este dispositivo para que no tengas que esperar acá.',
    'pipeline.notifyPromptAccept': 'Avisarme',
    'pipeline.notifyPromptDismiss': 'Ahora no',
    // Active-stage hints (rotating, gentle)
    'pipeline.hint.uploading.0': 'Enviando tu audio de forma segura',
    'pipeline.hint.transcribing.0': 'Escuchando cada palabra',
    'pipeline.hint.transcribing.1': 'Reconociendo pausas y puntuación',
    'pipeline.hint.analysing.0': 'Leyendo la transcripción con atención',
    'pipeline.hint.analysing.1': 'Buscando gramática para afinar',
    'pipeline.hint.analysing.2': 'Anotando dónde el fraseo podría sentirse más natural',
    'pipeline.hint.analysing.3': 'Comparando tus tiempos verbales y pronombres',
    // Stepper a11y
    'pipeline.stageDone': '{label} (terminado)',
    'pipeline.stageActive': '{label} (en curso)',
    'pipeline.stagePending': '{label} (pendiente)',

    // Transcript page
    'transcript.loading': 'Cargando transcripción…',
    'transcript.loadError': 'No pudimos cargar esta sesión. Revisá tu conexión e intentá de nuevo.',
    'transcript.retry': 'Reintentar',
    'transcript.grammar': 'gramática',
    'transcript.naturalness': 'naturalidad',
    'transcript.min': 'min',
    'transcript.you': 'Vos',
    'transcript.them': 'Ellos',
    'transcript.reanalyse': 'Re-analizar sesión',
    'transcript.markUnread': 'Marcar como sin leer',
    'transcript.markedUnreadToast': 'Marcada como sin leer.',
    'transcript.markUnreadError': 'No se pudo marcar como sin leer — intentá de nuevo.',
    'transcript.moreActions': 'Más acciones',
    'transcript.editTitle': 'Renombrar sesión',
    'transcript.progress': '{saved} guardadas · {dismissed} descartadas · faltan {remaining}',
    'transcript.progressAria': '{n} de {total} revisadas',
    'transcript.progressAllReviewed': '{total} revisadas',
    'transcript.legend.amber': 'a revisar',
    'transcript.legend.violet': 'guardadas',
    'transcript.legend.green': 'escritas',
    'transcript.openCorrection': 'Abrir corrección',
    'transcript.themRevealHint': 'Tocá para leer',
    'transcript.markState.written': 'escrito',
    'transcript.markState.saved': 'guardado',
    'transcript.markState.unreviewed': 'pendiente',

    // Re-analyse confirmation
    'reanalyse.title': '¿Reemplazar las correcciones de esta sesión?',
    'reanalyse.body': 'Re-analizar reescribe todas las correcciones de esta sesión. Las correcciones guardadas conservan sus tarjetas — solo se reemplazan las correcciones que ves acá.',
    'reanalyse.confirm': 'Reemplazar correcciones',
    'reanalyse.cancel': 'Mantener',
    'reanalyse.error': 'No se pudo iniciar el re-análisis — intentá de nuevo.',

    // Annotation sheet (replaces the modal)
    'sheet.close': 'Cerrar',
    'sheet.prev': 'Corrección anterior',
    'sheet.next': 'Corrección siguiente',
    'sheet.position': '{n} de {total}',
    'sheet.navHintFirst': 'Tip — usá ← → o deslizá para moverte entre correcciones.',
    'sheet.navHintDismiss': 'Entendido',

    // Identify page
    'identify.loading': 'Cargando…',
    'identify.title': 'Seleccioná todos los hablantes que sos vos',
    'identify.subtitle': 'Tocá un hablante para seleccionarlo. Podés seleccionar ambos si sos vos en todos.',
    'identify.confirm': 'Confirmar →',

    // Speaker card
    'speaker.label': 'Hablante {label}',

    // Annotation card — primary save action. La etiqueta del estado
    // "guardada" ya menciona el destino, así que el botón funciona como
    // confirmación por sí solo y eliminamos el cartel separado que decía
    // "Agregada a tu lista".
    'annotation.savePrimary': 'Guardar en mi lista',
    'annotation.savedPrimary': 'Agregada a mi lista',
    'annotation.savePrimaryAria': 'Guardar esta corrección en tu lista de Anotar',
    'annotation.savedPrimaryAria': 'Quitar esta corrección de tu lista de Anotar',
    // Quiet secondary "this correction wasn't useful" affordance
    'annotation.notUseful': 'Poco útil — ocultarla',
    'annotation.notUsefulRestore': 'Restaurar esta corrección',
    'annotation.notUsefulAria': 'Marcar como poco útil y ocultarla de la transcripción',
    'annotation.notUsefulRestoreAria': 'Restaurar esta corrección',
    // Subtítulo del estado oculto — sin él, lo único que indica el cambio
    // es la opacidad, lo que se confunde con "cargando".
    'annotation.unhelpfulHint': 'Oculta de tu transcripción.',
    // Errors are surfaced with an inline Retry rather than auto-dismissing
    'annotation.saveError': 'No se pudo guardar — probemos de nuevo.',
    'annotation.unhelpfulError': 'No se pudo guardar tu feedback — probemos de nuevo.',
    'annotation.retry': 'Reintentar',
    'annotation.offlineNote': 'Estás sin conexión — probá de nuevo cuando vuelvas.',
    // Importance pill (replaces the ASCII star cluster)
    'annotation.importantPill': 'Vale la pena recordarla',
    'annotation.importantPillHigh': 'Alta prioridad',
    'annotation.importantPillAria': 'Ver por qué esta corrección importa',
    'type.grammar': 'Gramática',
    'type.naturalness': 'Naturalidad',

    // Write it down sheet
    'writeItDown.title': 'Escribilo primero',
    'writeItDown.subtitle': 'Reforzá antes de que se convierta en tarjeta',
    'writeItDown.promptsLabel': 'Escribilo de 3 maneras en papel',
    'writeItDown.prompt1': 'Una oración que realmente le dirías a alguien',
    'writeItDown.prompt2': 'Como pregunta usando voseo',
    'writeItDown.prompt3': 'Usando un tiempo pasado o futuro',
    'writeItDown.checkboxLabel': 'Lo escribí en papel',
    'writeItDown.confirmLabel': 'Crear tarjeta',
    'writeItDown.successLabel': 'Tarjeta creada ✓',

    'home.toWriteDown': '{n} correcciones para anotar',
    'home.toWriteDownOne': '1 corrección para anotar',

    // Write page (the queue of saved corrections waiting to be written down)
    'write.title': 'Anotar',
    // Solo estado vacío. El H1 ya nombra la superficie; el subtítulo invita
    // a la próxima acción sin repetir "correcciones guardadas".
    'write.subtitle': 'Tomá una corrección guardada cuando quieras.',
    'write.loading': 'Cargando…',
    'write.error': 'Error: {msg}',

    // Write list — alternancia de vistas (Anotar es la superficie principal,
    // Escritos vive como link discreto al archivo, no como pestaña par).
    'writeList.viewLabel': 'Correcciones guardadas',
    'writeList.tabWrite': 'Anotar',
    'writeList.tabWritten': 'Escritos',
    'writeList.archiveHeading': 'Escritos',
    'writeList.archiveLink': 'escritos',
    'writeList.backToWrite': 'Volver a Anotar',
    'writeList.markDoneShort': 'Listo',
    'writeList.emptyWriteCaption': 'Las correcciones guardadas se ven así.',
    'writeList.emptyWriteCta': 'Empezá una sesión para guardar más →',
    'writeList.emptyWritten': 'Todavía no hay nada acá. Los ítems aparecen acá cuando los marcás como escritos.',
    'writeList.emptyWrittenCaption': 'Lo que ya anotaste cae acá, atenuado para que no llene la cola.',
    'writeList.emptyWrittenCta': '← Volver a Anotar ({count})',
    'writeList.emptyWrittenNoQueue': 'Tampoco hay nada en tu cola de Anotar — empezá una sesión para guardar tu primera corrección.',
    'writeList.markRowAria': 'Marcar "{original}" como escrito',
    // Toasts only fire on the destructive / error paths now: success
    // states (mark-written, move-back) are silent because the row leaving
    // the current tab is more confirmation than the user needs.
    'writeList.movedToTrash': 'Eliminada. Podés recuperarla.',
    'writeList.undo': 'Deshacer',
    'writeList.deleteError': 'No se pudo eliminar el ítem — intentá de nuevo.',
    'writeList.markWrittenError': 'No se pudo actualizar — intentá de nuevo.',
    'writeList.importanceToggleAria': 'Alternar explicación de importancia',

    // Write review sheet (docked)
    'writeSheet.aria': 'Revisar corrección guardada',
    // Acción principal — verbo primero, con destino explícito. La variante
    // "ocupada" mantiene el foco mientras la red responde.
    'writeSheet.markWritten': 'Marcar como escrito',
    'writeSheet.markWrittenBusy': 'Marcando…',
    'writeSheet.markWrittenAria': 'Marcar esta corrección como escrita en papel',
    'writeSheet.moveBack': 'Volver a la lista de Anotar',
    'writeSheet.moveBackBusy': 'Volviendo…',
    'writeSheet.moveBackAria': 'Devolver esta corrección a la lista de Anotar',
    // Menú de acciones secundarias — Eliminar se puede deshacer 5 segundos
    'writeSheet.moreActionsAria': 'Más acciones',
    'writeSheet.deleteLabel': 'Eliminar',
    'writeSheet.deleteAria': 'Eliminar este ítem (podés deshacer 5 segundos)',

    // Settings page
    'settings.title': 'Configuración',
    'settings.appearance': 'Apariencia',
    'settings.textSize': 'Tamaño del texto',
    'settings.preview': 'Vista previa',
    'settings.previewYou': 'Vos',
    'settings.previewThem': 'Ellos',
    'settings.previewSentence': 'Today I went to the market and bought a lot of things for the week.',
    'settings.previewResponse': 'And what did you buy?',
    'settings.targetLanguage': 'Idioma objetivo',
    'settings.account': 'Cuenta',
    'settings.signOut': 'Cerrar sesión',
    'settings.signOutError': 'No se pudo cerrar sesión — intentá de nuevo',
    'settings.app': 'App',
    'settings.version': 'Versión',
    // Onboarding — selección de idioma (paso 0)
    'onboarding.languageSelect.heading': '¿Qué estás aprendiendo?',
    'onboarding.languageSelect.body': 'Lo podés cambiar en Configuración.',
    'onboarding.languageSelect.targetLanguageAria': 'Idioma objetivo',
    'onboarding.languageSelect.spanish': 'Español',
    'onboarding.languageSelect.spanishVariant': 'Rioplatense · Argentino',
    'onboarding.languageSelect.english': 'Inglés',
    'onboarding.languageSelect.englishVariant': 'Inglés de Nueva Zelanda',
    'onboarding.languageSelect.cta': 'Empezar →',
    // Onboarding — pasos del tutorial
    'onboarding.upload.heading': 'Subí una grabación',
    'onboarding.upload.body':
      'Tocá Subir audio y elegí un archivo. Se transcribe automáticamente.',
    'onboarding.share.heading': 'Compartí desde WhatsApp',
    'onboarding.share.body':
      'Mantené presionada una nota de voz de WhatsApp, tocá Compartir y elegí Conversation Coach.',
    // Onboarding — etiquetas de las ilustraciones
    'onboarding.illus.uploadButton': 'Subir audio',
    'onboarding.illus.shareTitle': 'Compartir nota de voz vía…',
    'onboarding.illus.appMessages': 'Mensajes',
    'onboarding.illus.appMail': 'Correo',
    'onboarding.illus.appCoach': 'Coach',
    'onboarding.illus.appFiles': 'Archivos',
    'onboarding.illus.shareContact': 'María',
    'onboarding.illus.pickerTitle': 'Archivos de audio',
    // Onboarding — chrome
    'onboarding.cta.next': 'Siguiente →',
    'onboarding.cta.letsGo': '¡Vamos! →',
    'onboarding.cta.done': 'Listo',
    'onboarding.skip': 'Saltar tutorial',
    'onboarding.close': 'Cerrar',
    'onboarding.stepOfTotal': 'Paso {n} de {total}',
    'onboarding.revisitLink': 'Ver tutorial otra vez →',
    'settings.help': 'Ayuda',
    'settings.howToUpload': 'Cómo subir audio',
    'settings.howToShare': 'Compartir desde WhatsApp',

    // Sub-categories
    'subCat.verb-conjugation': 'Conjugación verbal',
    'subCat.subjunctive': 'Subjuntivo',
    'subCat.gender-agreement': 'Concordancia de género',
    'subCat.number-agreement': 'Concordancia de número',
    'subCat.ser-estar': 'Ser / Estar',
    'subCat.por-para': 'Por / Para',
    'subCat.tense-selection': 'Selección de tiempo verbal',
    'subCat.article-usage': 'Uso del artículo',
    'subCat.word-order': 'Orden de las palabras',
    'subCat.vocabulary-choice': 'Elección de vocabulario',
    'subCat.register': 'Registro',
    'subCat.phrasing': 'Frases',
    'subCat.other': 'Otro',

    // Voice widget
    'voice.startLabel': 'Practicarlo',
    'voice.startAria': 'Iniciar conversación de voz',
    'voice.endAria': 'Finalizar conversación de voz',
    'voice.muteAria': 'Silenciar micrófono',
    'voice.unmuteAria': 'Activar micrófono',
    'voice.toolbarAria': 'Controles de conversación de voz',
    'voice.indicatorIdle': 'Escuchando',
    'voice.indicatorUser': 'Estás hablando',
    'voice.indicatorAgent': 'Habla el coach',
    'voice.indicatorMuted': 'Micrófono silenciado',
    'voice.micPermission': 'Se necesita acceso al micrófono. Revisá la configuración del navegador.',
    'voice.sessionEnded': 'Sesión de voz finalizada',
    'voice.connecting': 'Conectando…',
    'voice.reconnecting': 'Reconectando…',
    'voice.coachTitle': 'Coach de voz',
    'voice.languagePill.esAR': 'ES-AR',
    'voice.languagePill.enNZ': 'EN-NZ',
    'voice.startCoachmark': 'Pregúntale al coach',
    'voice.statusListening': 'Escuchando…',
    'voice.statusMuted': 'Silenciado',
    'voice.regionAria': 'Sesión con el coach de voz',
    'voice.connectedAnnouncement': 'Coach de voz conectado',
    'voice.connectingAnnouncement': 'Conectando con el coach de voz',
    'voice.shortcutHint': 'Esc para finalizar · Espacio para silenciar',
    'voice.tryAgain': 'Reintentar',
    'voice.muteLabel': 'Silenciar',
    'voice.unmuteLabel': 'Activar',
    'voice.endLabel': 'Finalizar',
  },
}
