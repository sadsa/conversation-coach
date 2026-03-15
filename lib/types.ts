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
  user_speaker_label: 'A' | 'B' | null
  created_at: string
  updated_at: string
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
}

export interface PracticeItem {
  id: string
  session_id: string
  annotation_id: string | null
  type: AnnotationType
  original: string
  correction: string | null
  explanation: string
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
    'detected_speaker_count' | 'user_speaker_label' | 'created_at'
  >
  segments: TranscriptSegment[]
  annotations: Annotation[]
}

export interface StatusResponse {
  status: SessionStatus
  error_stage: ErrorStage | null
}
