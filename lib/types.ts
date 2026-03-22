// lib/types.ts

export type SessionStatus =
  | 'uploading' | 'transcribing' | 'identifying'
  | 'analysing' | 'ready' | 'error'

export type ErrorStage = 'uploading' | 'transcribing' | 'analysing'

export type AnnotationType = 'grammar' | 'naturalness' | 'strength'

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
  'voseo', 'natural-expressions', 'fluency', 'other',
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
  'voseo': 'strength',
  'natural-expressions': 'strength',
  'fluency': 'strength',
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
  'voseo': 'Voseo',
  'natural-expressions': 'Natural expressions',
  'fluency': 'Fluency',
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
  created_at: string
  updated_at: string
}

// API response shapes
export interface SessionListItem {
  id: string
  title: string
  status: SessionStatus
  duration_seconds: number | null
  created_at: string
}

export interface SessionDetail {
  session: Pick<Session,
    'id' | 'title' | 'status' | 'error_stage' | 'duration_seconds' |
    'detected_speaker_count' | 'user_speaker_labels' | 'created_at'
  >
  segments: TranscriptSegment[]
  annotations: Annotation[]
  addedAnnotationIds: string[]
}

export interface StatusResponse {
  status: SessionStatus
  error_stage: ErrorStage | null
}
