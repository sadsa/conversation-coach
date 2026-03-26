// components/PendingUploadCard.tsx
'use client'

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
  return (
    <div className="border border-violet-900 rounded-xl bg-violet-950 p-4 space-y-4">
      {/* File info */}
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5 flex-shrink-0" aria-hidden="true">📎</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100 truncate">{file.name}</p>
          <p className="text-xs text-violet-300 mt-0.5">{formatBytes(file.size)}</p>
        </div>
      </div>

      {/* Recording type toggle */}
      <div>
        <p className="text-xs text-gray-400 font-medium mb-2">Recording type:</p>
        <div className="inline-flex rounded-lg overflow-hidden border border-violet-900">
          <button
            type="button"
            onClick={() => onModeChange('solo')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              speakerMode === 'solo'
                ? 'bg-violet-600 text-white'
                : 'bg-transparent text-violet-300 hover:text-white'
            }`}
          >
            Solo
          </button>
          <button
            type="button"
            onClick={() => onModeChange('conversation')}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${
              speakerMode === 'conversation'
                ? 'bg-violet-600 text-white'
                : 'bg-transparent text-violet-300 hover:text-white'
            }`}
          >
            Conversation
          </button>
        </div>
      </div>

      {/* Speaker count (conversation only) */}
      {speakerMode === 'conversation' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-medium">Speakers:</span>
          <div className="flex gap-1.5">
            {SPEAKER_COUNTS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => onSpeakersChange(value)}
                className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                  speakersExpected === value
                    ? 'bg-violet-600 text-white'
                    : 'bg-transparent border border-violet-900 text-violet-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="px-3 py-1.5 text-xs text-gray-400 border border-gray-700 rounded-lg hover:text-gray-200 transition-colors"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-4 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
        >
          Upload →
        </button>
      </div>
    </div>
  )
}
