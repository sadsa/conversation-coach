// lib/types.ts

export type TargetLanguage = 'es-AR' | 'en-NZ'

export const TARGET_LANGUAGES: Record<TargetLanguage, string> = {
  'es-AR': 'Spanish (Rioplatense)',
  'en-NZ': 'English (New Zealand)',
}

export type SessionStatus =
  | 'uploading' | 'transcribing' | 'identifying'
  | 'analysing' | 'ready' | 'error'

export type ErrorStage = 'uploading' | 'transcribing' | 'analysing'

export type AnnotationType = 'grammar' | 'naturalness'

export interface Session {
  id: string
  title: string
  status: SessionStatus
  error_stage: ErrorStage | null
  duration_seconds: number | null
  audio_r2_key: string | null
  assemblyai_job_id: string | null
  detected_speaker_count: number | null
  user_speaker_labels: ('A' | 'B')[] | null
  processing_completed_at: string | null
  created_at: string
  updated_at: string
  original_filename: string | null
}

export interface TranscriptSegment {
  id: string
  session_id: string
  speaker: 'A' | 'B'
  text: string
  start_ms: number
  end_ms: number
  position: number
}

export const SUB_CATEGORIES = [
  'verb-conjugation', 'subjunctive', 'gender-agreement', 'number-agreement',
  'ser-estar', 'por-para', 'tense-selection', 'article-usage', 'word-order',
  'vocabulary-choice', 'register', 'phrasing',
  'other',
] as const

export type SubCategory = typeof SUB_CATEGORIES[number]

// Maps each non-other sub-category to its annotation type.
export const SUB_CATEGORY_TYPE_MAP: Partial<Record<SubCategory, AnnotationType>> = {
  'verb-conjugation': 'grammar',
  'subjunctive': 'grammar',
  'gender-agreement': 'grammar',
  'number-agreement': 'grammar',
  'ser-estar': 'grammar',
  'por-para': 'grammar',
  'tense-selection': 'grammar',
  'article-usage': 'grammar',
  'word-order': 'grammar',
  'vocabulary-choice': 'naturalness',
  'register': 'naturalness',
  'phrasing': 'naturalness',
}

export const SUB_CATEGORY_DISPLAY: Record<SubCategory, string> = {
  'verb-conjugation': 'Verb conjugation',
  'subjunctive': 'Subjunctive',
  'gender-agreement': 'Gender agreement',
  'number-agreement': 'Number agreement',
  'ser-estar': 'Ser / Estar',
  'por-para': 'Por / Para',
  'tense-selection': 'Tense selection',
  'article-usage': 'Article usage',
  'word-order': 'Word order',
  'vocabulary-choice': 'Vocabulary choice',
  'register': 'Register',
  'phrasing': 'Phrasing',
  'other': 'Other',
}

export interface Annotation {
  id: string
  session_id: string
  segment_id: string
  type: AnnotationType
  original: string
  start_char: number
  end_char: number
  correction: string | null
  explanation: string
  sub_category: SubCategory
  flashcard_front: string | null
  flashcard_back: string | null
  flashcard_note: string | null
  importance_score: number | null
  importance_note: string | null
}

export interface PracticeItem {
  id: string
  session_id: string
  annotation_id: string | null
  type: AnnotationType
  original: string
  correction: string | null
  explanation: string
  sub_category: SubCategory
  reviewed: boolean
  written_down: boolean
  created_at: string
  updated_at: string
  flashcard_front: string | null
  flashcard_back: string | null
  flashcard_note: string | null
  importance_score: number | null
  importance_note: string | null
}


// API response shapes
export interface SessionListItem {
  id: string
  title: string
  status: SessionStatus
  duration_seconds: number | null
  created_at: string
  processing_completed_at: string | null
}

export interface SessionDetail {
  session: Pick<Session,
    'id' | 'title' | 'status' | 'error_stage' | 'duration_seconds' |
    'detected_speaker_count' | 'user_speaker_labels' | 'created_at'
  >
  segments: TranscriptSegment[]
  annotations: Annotation[]
  addedAnnotations: Record<string, string>   // annotationId -> practiceItemId
}

export interface StatusResponse {
  status: SessionStatus
  error_stage: ErrorStage | null
}
