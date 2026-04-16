// components/PendingUploadCard.tsx
'use client'
import { useTranslation } from '@/components/LanguageProvider'

export type SpeakerMode = 'solo' | 'conversation'

interface Props {
  file: File
  speakerMode: SpeakerMode
  speakersExpected: number
  onModeChange: (mode: SpeakerMode) => void
  onSpeakersChange: (count: number) => void
  onConfirm: () => void
  onDismiss: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const SPEAKER_COUNTS = [
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 5 },
]

export function PendingUploadCard({
  file,
  speakerMode,
  speakersExpected,
  onModeChange,
  onSpeakersChange,
  onConfirm,
  onDismiss,
}: Props) {
  const { t } = useTranslation()
  return (
    <div className="border border-accent-chip-border rounded-xl bg-accent-chip p-6 space-y-6">
      {/* File info */}
      <div className="flex items-start gap-4">
        <span className="text-3xl flex-shrink-0" aria-hidden="true">📎</span>
        <div className="min-w-0">
          <p className="font-semibold text-text-primary truncate">{file.name}</p>
          <p className="text-sm text-on-accent-chip mt-1">{formatBytes(file.size)}</p>
        </div>
      </div>

      {/* Recording type toggle */}
      <div>
        <p className="text-sm text-text-secondary font-medium mb-3">{t('upload.recordingType')}</p>
        <div className="inline-flex rounded-lg overflow-hidden border border-accent-chip-border">
          <button
            type="button"
            onClick={() => onModeChange('solo')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              speakerMode === 'solo'
                ? 'bg-accent-primary text-white'
                : 'bg-transparent text-on-accent-chip hover:text-text-primary'
            }`}
          >
            {t('upload.solo')}
          </button>
          <button
            type="button"
            onClick={() => onModeChange('conversation')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              speakerMode === 'conversation'
                ? 'bg-accent-primary text-white'
                : 'bg-transparent text-on-accent-chip hover:text-text-primary'
            }`}
          >
            {t('upload.conversation')}
          </button>
        </div>
      </div>

      {/* Speaker count (conversation only) */}
      {speakerMode === 'conversation' && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary font-medium">{t('upload.speakers')}</span>
          <div className="flex gap-2">
            {SPEAKER_COUNTS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => onSpeakersChange(value)}
                className={`w-10 h-10 rounded-lg text-sm font-semibold transition-colors ${
                  speakersExpected === value
                    ? 'bg-accent-primary text-white'
                    : 'bg-transparent border border-accent-chip-border text-on-accent-chip hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onDismiss}
          className="px-4 py-2 text-sm text-text-secondary border border-border rounded-lg hover:text-text-primary transition-colors"
        >
          {t('upload.dismiss')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-5 py-2 text-sm font-medium bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg transition-colors"
        >
          {t('upload.uploadBtn')}
        </button>
      </div>
    </div>
  )
}
