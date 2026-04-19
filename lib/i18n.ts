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
    // Navigation
    'nav.home': 'Home',
    'nav.write': 'Write',
    'nav.settings': 'Settings',
    'nav.skipToContent': 'Skip to content',
    'nav.back': 'Back',
    'nav.signOut': 'Sign out',

    // Auth — login page
    'auth.signInTitle': 'Conversation Coach',
    'auth.signInSubtitle': 'Sign in to review your recorded conversations.',
    'auth.emailLabel': 'Email',
    'auth.emailPlaceholder': 'you@example.com',
    'auth.submit': 'Email me a sign-in link',
    'auth.submitting': 'Sending…',
    'auth.invitedNote':
      "Access is invite-only. We'll email you a one-time link — no password needed.",
    'auth.linkSentTo': 'Sign-in link sent to {email}.',
    'auth.linkSentNote':
      "Open it on this device to continue. Check your spam folder if you don't see it within a minute.",
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
    'home.greetingEmoji': '🎧',
    'home.greetingMorning': 'Good morning',
    'home.greetingAfternoon': 'Good afternoon',
    'home.greetingEvening': 'Good evening',
    'home.uploadFabAria': 'Upload a new conversation',
    'home.uploadFabLabel': 'Upload',
    'home.dashboardSubtitle': 'A quiet place to review what you\'ve recorded.',
    'home.welcomeTitle': 'Welcome to Conversation Coach',
    'home.welcomeSubtitle': 'Record a Spanish conversation, get gentle corrections, and turn the keepers into flashcards.',
    'home.howItWorks': 'How it works',
    'home.step1.title': 'Record a conversation',
    'home.step1.desc': 'Capture yourself speaking — solo practice or a real chat. Anything you\'d like feedback on.',
    'home.step2.title': 'Upload the audio',
    'home.step2.desc': 'Use the round + button (mobile) or Upload (desktop). Your speech gets transcribed and gently annotated by a tutor.',
    'home.step3.title': 'Review the corrections',
    'home.step3.desc': 'Read through your transcript at your own pace. Star the corrections worth keeping.',
    'home.step4.title': 'Write them down',
    'home.step4.desc': 'Copy each saved phrase onto a paper flashcard. Writing helps the language stick.',
    'home.remindersAria': 'Saved corrections',
    'home.allCaughtUp': 'All caught up — nothing to write down right now.',
    'home.recentSessionsTitle': 'Recent conversations',
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

    // Drop zone
    'dropzone.title': 'Upload conversation',
    'dropzone.formats': 'MP3, M4A, WAV, OPUS',
    'dropzone.browse': 'Browse',
    'dropzone.ariaLabel': 'Upload audio file',
    'dropzone.errorFormat': 'Unsupported format. Use MP3, M4A, WAV, or OPUS.',
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
    'session.deleteWarning': 'will be permanently deleted, along with all its annotations and any saved corrections from it. This can\'t be undone.',
    'session.deleteButton': 'Delete',
    'session.cancelButton': 'Cancel',
    'session.noSessions': 'No sessions yet — tap Upload to add your first conversation.',
    'session.deleteError': 'Couldn\'t delete session — try again.',
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

    // Identify page
    'identify.loading': 'Loading…',
    'identify.title': 'Select all speakers that are you',
    'identify.subtitle': 'Tap a speaker to select it. You can select both if they\'re all you.',
    'identify.confirm': 'Confirm →',

    // Speaker card
    'speaker.label': 'Speaker {label}',

    // Annotation card
    'annotation.helpfulAria': 'Helpful — save this correction',
    'annotation.helpfulUndoAria': 'Undo helpful — remove from saved',
    'annotation.markUnhelpfulAria': 'Not helpful — mark this correction as unhelpful',
    'annotation.unmarkUnhelpfulAria': 'Undo not helpful — restore this correction',
    'annotation.stateNeutral': 'No feedback yet',
    'annotation.stateSaved': 'Saved as helpful',
    'annotation.stateUnhelpful': 'Marked unhelpful',
    'annotation.saveError': 'Couldn\'t save — try again.',
    'annotation.unhelpfulError': 'Couldn\'t save your feedback — try again.',
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
    'write.subtitle': 'Saved corrections waiting to be written down.',
    'write.loading': 'Loading…',
    'write.error': 'Error: {msg}',

    // Write list — segmented Write / Written view
    'writeList.viewLabel': 'Saved corrections',
    'writeList.tabWrite': 'Write',
    'writeList.tabWritten': 'Written',
    'writeList.emptyWriteCaption': 'Saved corrections look like this.',
    'writeList.emptyWriteCta': 'Start a session to save more →',
    'writeList.emptyWritten': 'Nothing here yet. Items show up here once you mark them as written.',
    'writeList.markRowAria': 'Mark "{original}" as written',
    'writeList.movedToWritten': 'Moved to Written',
    'writeList.movedToWrite': 'Moved back to your list',
    'writeList.movedToTrash': 'Item deleted',
    'writeList.undo': 'Undo',
    'writeList.deleteError': 'Couldn\'t delete item — try again.',
    'writeList.markWrittenError': 'Couldn\'t update — try again.',
    'writeList.importanceToggleAria': 'Toggle importance explanation',

    // Write review sheet (docked)
    'writeSheet.aria': 'Review saved correction',
    'writeSheet.titleWrite': 'To write',
    'writeSheet.titleWritten': 'Written',
    'writeSheet.markWritten': 'Mark as written',
    'writeSheet.moveBack': 'Move back',
    'writeSheet.deleteAria': 'Delete this item',

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
    'settings.app': 'App',
    'settings.version': 'Version',

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
  },

  es: {
    // Navigation
    'nav.home': 'Inicio',
    'nav.write': 'Anotar',
    'nav.settings': 'Configuración',
    'nav.skipToContent': 'Saltar al contenido',
    'nav.back': 'Atrás',
    'nav.signOut': 'Cerrar sesión',

    // Auth — login page
    'auth.signInTitle': 'Entrenador de conversación',
    'auth.signInSubtitle': 'Iniciá sesión para revisar tus conversaciones grabadas.',
    'auth.emailLabel': 'Correo electrónico',
    'auth.emailPlaceholder': 'vos@ejemplo.com',
    'auth.submit': 'Enviame un enlace de inicio',
    'auth.submitting': 'Enviando…',
    'auth.invitedNote':
      'El acceso es por invitación. Te enviamos un enlace de un solo uso — sin contraseña.',
    'auth.linkSentTo': 'Enlace de inicio enviado a {email}.',
    'auth.linkSentNote':
      'Abrilo en este dispositivo para continuar. Revisá la carpeta de spam si no lo ves en un minuto.',
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
    'home.greetingEmoji': '🎧',
    'home.greetingMorning': 'Buenos días',
    'home.greetingAfternoon': 'Buenas tardes',
    'home.greetingEvening': 'Buenas noches',
    'home.uploadFabAria': 'Subir una conversación nueva',
    'home.uploadFabLabel': 'Subir',
    'home.dashboardSubtitle': 'Un lugar tranquilo para repasar lo que grabaste.',
    'home.welcomeTitle': 'Bienvenido a Conversation Coach',
    'home.welcomeSubtitle': 'Grabá una conversación en español, recibí correcciones suaves y convertí las útiles en flashcards.',
    'home.howItWorks': 'Cómo funciona',
    'home.step1.title': 'Grabá una conversación',
    'home.step1.desc': 'Capturate hablando — solo o en una charla real. Lo que quieras que te corrijan.',
    'home.step2.title': 'Subí el audio',
    'home.step2.desc': 'Usá el botón redondo + (celular) o Subir (escritorio). Tu habla se transcribe y un tutor te deja anotaciones suaves.',
    'home.step3.title': 'Revisá las correcciones',
    'home.step3.desc': 'Leé tu transcripción a tu ritmo. Marcá con estrella las correcciones que valga la pena guardar.',
    'home.step4.title': 'Anotalas a mano',
    'home.step4.desc': 'Copiá cada frase guardada en una tarjeta de papel. Escribir ayuda a fijar el idioma.',
    'home.remindersAria': 'Correcciones guardadas',
    'home.allCaughtUp': 'Todo al día — nada para anotar por ahora.',
    'home.recentSessionsTitle': 'Conversaciones recientes',
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

    // Drop zone
    'dropzone.title': 'Subir conversación',
    'dropzone.formats': 'MP3, M4A, WAV, OPUS',
    'dropzone.browse': 'Explorar',
    'dropzone.ariaLabel': 'Subir archivo de audio',
    'dropzone.errorFormat': 'Formato no compatible. Usá MP3, M4A, WAV, u OPUS.',
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
    'session.deleteWarning': 'se eliminará permanentemente, junto con todas sus anotaciones y las correcciones guardadas de esta sesión. Esta acción no se puede deshacer.',
    'session.deleteButton': 'Eliminar',
    'session.cancelButton': 'Cancelar',
    'session.noSessions': 'Todavía no hay sesiones — tocá Subir para agregar tu primera conversación.',
    'session.deleteError': 'No se pudo eliminar la sesión — intentá de nuevo.',
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
    'transcript.markState.written': 'anotado',
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

    // Identify page
    'identify.loading': 'Cargando…',
    'identify.title': 'Seleccioná todos los hablantes que sos vos',
    'identify.subtitle': 'Tocá un hablante para seleccionarlo. Podés seleccionar ambos si sos vos en todos.',
    'identify.confirm': 'Confirmar →',

    // Speaker card
    'speaker.label': 'Hablante {label}',

    // Annotation card
    'annotation.helpfulAria': 'Útil — guardar esta corrección',
    'annotation.helpfulUndoAria': 'Deshacer útil — quitar de guardados',
    'annotation.markUnhelpfulAria': 'Poco útil — marcar esta corrección',
    'annotation.unmarkUnhelpfulAria': 'Deshacer poco útil — restaurar esta corrección',
    'annotation.stateNeutral': 'Sin marcar',
    'annotation.stateSaved': 'Guardada como útil',
    'annotation.stateUnhelpful': 'Marcada como poco útil',
    'annotation.saveError': 'No se pudo guardar — intentá de nuevo.',
    'annotation.unhelpfulError': 'No se pudo guardar tu feedback — intentá de nuevo.',
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
    'write.subtitle': 'Correcciones guardadas para anotar.',
    'write.loading': 'Cargando…',
    'write.error': 'Error: {msg}',

    // Write list — segmented Anotar / Escritos view
    'writeList.viewLabel': 'Correcciones guardadas',
    'writeList.tabWrite': 'Anotar',
    'writeList.tabWritten': 'Escritos',
    'writeList.emptyWriteCaption': 'Las correcciones guardadas se ven así.',
    'writeList.emptyWriteCta': 'Empezá una sesión para guardar más →',
    'writeList.emptyWritten': 'Todavía no hay nada acá. Los ítems aparecen acá cuando los marcás como escritos.',
    'writeList.markRowAria': 'Marcar "{original}" como escrito',
    'writeList.movedToWritten': 'Movido a Escritos',
    'writeList.movedToWrite': 'Vuelto a tu lista',
    'writeList.movedToTrash': 'Ítem eliminado',
    'writeList.undo': 'Deshacer',
    'writeList.deleteError': 'No se pudo eliminar el ítem — intentá de nuevo.',
    'writeList.markWrittenError': 'No se pudo actualizar — intentá de nuevo.',
    'writeList.importanceToggleAria': 'Alternar explicación de importancia',

    // Write review sheet (docked)
    'writeSheet.aria': 'Revisar corrección guardada',
    'writeSheet.titleWrite': 'Para anotar',
    'writeSheet.titleWritten': 'Escritos',
    'writeSheet.markWritten': 'Marcar como escrito',
    'writeSheet.moveBack': 'Volver atrás',
    'writeSheet.deleteAria': 'Eliminar este ítem',

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
    'settings.app': 'App',
    'settings.version': 'Versión',

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
  },
}
