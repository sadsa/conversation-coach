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
    'nav.practice': 'Practice',
    'nav.flashcards': 'Flashcards',
    'nav.insights': 'Insights',
    'nav.settings': 'Settings',

    // Home page
    'home.title': 'Conversation Coach',
    'home.subtitle': 'Upload a recorded conversation to get feedback on your speech.',
    'home.uploading': 'Uploading…',
    'home.uploadFailed': 'Upload failed — please try again',
    'home.pastSessions': 'Past Sessions',

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
    'session.deleteWarning': 'will be permanently deleted, along with all its annotations and any practice items you\'ve saved from it. This can\'t be undone.',
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
    'transcript.loading': 'Loading…',
    'transcript.grammar': 'grammar',
    'transcript.naturalness': 'naturalness',
    'transcript.min': 'min',
    'transcript.reanalyse': 'Re-analyse',

    // Identify page
    'identify.loading': 'Loading…',
    'identify.title': 'Select all speakers that are you',
    'identify.subtitle': 'Tap a speaker to select it. You can select both if they\'re all you.',
    'identify.confirm': 'Confirm →',

    // Speaker card
    'speaker.label': 'Speaker {label}',

    // Annotation card
    'annotation.addToPractice': 'Add to practice list',
    'annotation.addedToPractice': '✓ Added to practice list',
    'type.grammar': '🔴 Grammar',
    'type.naturalness': '🟡 Naturalness',

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

    // Flashcard deck
    'flashcard.counter': 'Card {n} of {m}',
    'flashcard.tapToReveal': 'Tap to reveal Spanish',
    'flashcard.explainThis': 'Explain this →',
    'flashcard.tapToExplain': 'tap green to explain',
    'flashcard.cardOptions': 'Card options',
    'flashcard.skipCard': 'Skip card',
    'flashcard.deleteCard': 'Delete card',
    'flashcard.deleteConfirmTitle': 'Delete this flashcard?',
    'flashcard.deleteConfirmBody': "This will permanently remove the practice item. This can't be undone.",
    'flashcard.deleteConfirmDelete': 'Delete',
    'flashcard.deleteConfirmCancel': 'Cancel',
    'flashcard.deleteError': "Couldn't delete — please try again",

    // Practice page
    'practice.title': 'Practice Items',
    'practice.subtitle': '{n} item across all sessions',
    'practice.subtitlePlural': '{n} items across all sessions',
    'practice.loading': 'Loading…',
    'practice.error': 'Error: {msg}',

    // Practice list
    'practiceList.all': 'All',
    'practiceList.noItems': 'No items match this filter.',
    'practiceList.selected': '{n} selected',
    'practiceList.deleteError': 'Couldn\'t delete item — try again.',
    'practiceList.deletePartialError': 'Some items couldn\'t be deleted — try again.',
    'practiceList.moreCategories': 'More +{n}',
    'practiceList.selectItem': 'Select item',
    'practiceList.exitSelection': 'Exit selection mode',
    'practiceList.selectAll': 'Select all',
    'practiceList.deleteSelectedAria': 'Delete {n} selected items',

    // Flashcards page
    'flashcards.loading': 'Loading…',
    'flashcards.error': 'Error: {msg}',
    'flashcards.empty': 'No flashcards yet — complete a session to generate cards.',

    // Insights page
    'insights.title': 'Where you\'re struggling',
    'insights.subtitle': 'Your recurring mistakes, ranked by frequency',
    'insights.empty': 'Insights will appear once you\'ve recorded and analysed some conversations.',
    'insights.noMistakes': 'No categorised mistakes yet. Re-analyse a session to generate insights.',
    'insights.appearsIn': 'appears in {n} of {m} sessions',
    'insights.fromConversations': 'From your conversations',
    'insights.seeAll': 'See all examples →',

    // Settings page
    'settings.title': 'Settings',
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
    'nav.practice': 'Práctica',
    'nav.flashcards': 'Tarjetas',
    'nav.insights': 'Estadísticas',
    'nav.settings': 'Configuración',

    // Home page
    'home.title': 'Entrenador de conversación',
    'home.subtitle': 'Subí una conversación grabada para recibir retroalimentación sobre tu habla.',
    'home.uploading': 'Subiendo…',
    'home.uploadFailed': 'Error al subir — por favor intentá de nuevo',
    'home.pastSessions': 'Sesiones anteriores',

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
    'session.deleteWarning': 'se eliminará permanentemente, junto con todas sus anotaciones y los ítems de práctica que hayas guardado. Esta acción no se puede deshacer.',
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
    'transcript.loading': 'Cargando…',
    'transcript.grammar': 'gramática',
    'transcript.naturalness': 'naturalidad',
    'transcript.min': 'min',
    'transcript.reanalyse': 'Re-analizar',

    // Identify page
    'identify.loading': 'Cargando…',
    'identify.title': 'Seleccioná todos los hablantes que sos vos',
    'identify.subtitle': 'Tocá un hablante para seleccionarlo. Podés seleccionar ambos si sos vos en todos.',
    'identify.confirm': 'Confirmar →',

    // Speaker card
    'speaker.label': 'Hablante {label}',

    // Annotation card
    'annotation.addToPractice': 'Agregar a la lista de práctica',
    'annotation.addedToPractice': '✓ Agregado a la lista de práctica',
    'type.grammar': '🔴 Gramática',
    'type.naturalness': '🟡 Naturalidad',

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

    // Flashcard deck
    'flashcard.counter': 'Tarjeta {n} de {m}',
    'flashcard.tapToReveal': 'Toca para ver el inglés',
    'flashcard.explainThis': 'Explicar esto →',
    'flashcard.tapToExplain': 'toca el verde para explicar',
    'flashcard.cardOptions': 'Opciones de tarjeta',
    'flashcard.skipCard': 'Saltar tarjeta',
    'flashcard.deleteCard': 'Eliminar tarjeta',
    'flashcard.deleteConfirmTitle': '¿Eliminar esta tarjeta?',
    'flashcard.deleteConfirmBody': 'Esto eliminará el ítem de práctica permanentemente.',
    'flashcard.deleteConfirmDelete': 'Eliminar',
    'flashcard.deleteConfirmCancel': 'Cancelar',
    'flashcard.deleteError': 'No se pudo eliminar — intentá de nuevo',

    // Practice page
    'practice.title': 'Ítems de práctica',
    'practice.subtitle': '{n} ítem en todas las sesiones',
    'practice.subtitlePlural': '{n} ítems en todas las sesiones',
    'practice.loading': 'Cargando…',
    'practice.error': 'Error: {msg}',

    // Practice list
    'practiceList.all': 'Todos',
    'practiceList.noItems': 'Ningún ítem coincide con este filtro.',
    'practiceList.selected': '{n} seleccionados',
    'practiceList.deleteError': 'No se pudo eliminar el ítem — intentá de nuevo.',
    'practiceList.deletePartialError': 'Algunos ítems no se pudieron eliminar — intentá de nuevo.',
    'practiceList.moreCategories': 'Más +{n}',
    'practiceList.selectItem': 'Seleccionar ítem',
    'practiceList.exitSelection': 'Salir del modo selección',
    'practiceList.selectAll': 'Seleccionar todo',
    'practiceList.deleteSelectedAria': 'Eliminar {n} ítems seleccionados',

    // Flashcards page
    'flashcards.loading': 'Cargando…',
    'flashcards.error': 'Error: {msg}',
    'flashcards.empty': 'Todavía no hay tarjetas — completá una sesión para generarlas.',

    // Insights page
    'insights.title': 'Dónde tenés dificultades',
    'insights.subtitle': 'Tus errores recurrentes, ordenados por frecuencia',
    'insights.empty': 'Las estadísticas aparecerán cuando hayas grabado y analizado algunas conversaciones.',
    'insights.noMistakes': 'Todavía no hay errores categorizados. Re-analizá una sesión para generar estadísticas.',
    'insights.appearsIn': 'aparece en {n} de {m} sesiones',
    'insights.fromConversations': 'De tus conversaciones',
    'insights.seeAll': 'Ver todos los ejemplos →',

    // Settings page
    'settings.title': 'Configuración',
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
