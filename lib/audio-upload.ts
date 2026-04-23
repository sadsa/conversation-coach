// lib/audio-upload.ts
//
// Shared file-picker constants + validation for audio uploads. Lives here
// so both the always-on `HomeUploadFab` and the first-run "Upload audio"
// CTA inside `DashboardOnboarding` enforce the same rules without drift.

export const ACCEPTED_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a',
  'audio/ogg',
  'audio/opus',
] as const

export const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.opus'] as const

export const MAX_BYTES = 500 * 1024 * 1024

export type Translator = (key: string, vars?: Record<string, string | number>) => string

export function validateAudioFile(file: File, t: Translator): string | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  const validType =
    (ACCEPTED_TYPES as readonly string[]).includes(file.type) ||
    (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)
  if (!validType) return t('dropzone.errorFormat')
  if (file.size > MAX_BYTES) return t('dropzone.errorSize')
  return null
}
