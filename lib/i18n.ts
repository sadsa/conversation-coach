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
    'nav.session': 'Session',
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
    'home.greetingMorning': 'Good morning',
    'home.greetingAfternoon': 'Good afternoon',
    'home.greetingEvening': 'Good evening',
    'home.dashboardSubtitle': 'A quiet place to review what you\'ve recorded.',
    'home.welcomeTitle': 'Welcome to Conversation Coach',
    'home.welcomeSubtitle': 'Record a Spanish conversation, get gentle corrections, and turn the keepers into flashcards.',
    'home.howItWorks': 'How it works',
    'home.step1.title': 'Record a conversation',
    'home.step1.desc': 'Capture yourself speaking — solo practice or a real chat. Anything you\'d like feedback on.',
    'home.step2.title': 'Upload the audio',
    'home.step2.desc': 'Drop the file in below. Your speech gets transcribed and gently annotated by a tutor.',
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
    'home.newSessionTitle': 'Start a new session',
    'home.newSessionSubtitle': 'Upload a recorded conversation to get fresh feedback.',
    'home.sessionCountOne': '1 conversation analysed so far.',
    'home.sessionCountMany': '{n} conversations analysed so far.',
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
    'session.noSessions': 'No sessions yet — upload your first conversation above.',
    'session.deleteError': 'Couldn\'t delete session — try again.',

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
    'pipeline.retry': 'Retry',
    'pipeline.estimatedTime': 'Estimated time: ~{n} min',
    'pipeline.takingLong': 'Taking longer than expected.',
    'pipeline.retryAnalysis': 'Retry analysis',
    'pipeline.retrying': 'Retrying…',

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
    'transcript.moreActions': 'More actions',
    'transcript.editTitle': 'Rename session',
    'transcript.progress': '{n} of {total} reviewed',
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
    'annotation.starAria': 'Save this correction',
    'annotation.unstarAria': 'Remove from saved',
    'annotation.markWrittenAria': 'Mark as written down',
    'annotation.unmarkWrittenAria': 'Unmark as written',
    'annotation.stateUnsaved': 'Not saved',
    'annotation.stateSaved': 'Saved',
    'annotation.stateWritten': 'Written ✓',
    'annotation.saveError': 'Couldn\'t save — try again.',
    'annotation.writtenError': 'Couldn\'t update — try again.',
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
    'nav.session': 'Sesión',
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
    'home.greetingMorning': 'Buenos días',
    'home.greetingAfternoon': 'Buenas tardes',
    'home.greetingEvening': 'Buenas noches',
    'home.dashboardSubtitle': 'Un lugar tranquilo para repasar lo que grabaste.',
    'home.welcomeTitle': 'Bienvenido a Conversation Coach',
    'home.welcomeSubtitle': 'Grabá una conversación en español, recibí correcciones suaves y convertí las útiles en flashcards.',
    'home.howItWorks': 'Cómo funciona',
    'home.step1.title': 'Grabá una conversación',
    'home.step1.desc': 'Capturate hablando — solo o en una charla real. Lo que quieras que te corrijan.',
    'home.step2.title': 'Subí el audio',
    'home.step2.desc': 'Arrastrá el archivo abajo. Tu habla se transcribe y un tutor te deja anotaciones suaves.',
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
    'home.newSessionTitle': 'Empezar una sesión nueva',
    'home.newSessionSubtitle': 'Subí una conversación grabada para recibir nuevas correcciones.',
    'home.sessionCountOne': '1 conversación analizada hasta ahora.',
    'home.sessionCountMany': '{n} conversaciones analizadas hasta ahora.',
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
    'session.noSessions': 'Todavía no hay sesiones — subí tu primera conversación arriba.',
    'session.deleteError': 'No se pudo eliminar la sesión — intentá de nuevo.',

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
    'pipeline.retry': 'Reintentar',
    'pipeline.estimatedTime': 'Tiempo estimado: ~{n} min',
    'pipeline.takingLong': 'Está tardando más de lo esperado.',
    'pipeline.retryAnalysis': 'Reintentar análisis',
    'pipeline.retrying': 'Reintentando…',

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
    'transcript.moreActions': 'Más acciones',
    'transcript.editTitle': 'Renombrar sesión',
    'transcript.progress': '{n} de {total} revisadas',
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
    'annotation.starAria': 'Guardar esta corrección',
    'annotation.unstarAria': 'Quitar de guardados',
    'annotation.markWrittenAria': 'Marcar como escrito',
    'annotation.unmarkWrittenAria': 'Desmarcar como escrito',
    'annotation.stateUnsaved': 'No guardado',
    'annotation.stateSaved': 'Guardado',
    'annotation.stateWritten': 'Escrito ✓',
    'annotation.saveError': 'No se pudo guardar — intentá de nuevo.',
    'annotation.writtenError': 'No se pudo actualizar — intentá de nuevo.',
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
