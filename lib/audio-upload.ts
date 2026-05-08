// lib/audio-upload.ts
//
// Shared file-picker constants + validation for audio uploads. Used by the
// always-on `HomeUploadFab` (and any future picker) so validation rules
// don't drift across entry points.

export const ACCEPTED_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a',
  'audio/ogg',
  'audio/opus',
  'audio/aac',
] as const

export const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.ogg', '.opus', '.aac'] as const

export const MAX_BYTES = 500 * 1024 * 1024

export type Translator = (key: string, replacements?: Record<string, string | number>) => string

export function validateAudioFile(file: File, t: Translator): string | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  const validType =
    (ACCEPTED_TYPES as readonly string[]).includes(file.type) ||
    (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)
  if (!validType) return t('dropzone.errorFormat')
  if (file.size > MAX_BYTES) return t('dropzone.errorSize')
  return null
}
