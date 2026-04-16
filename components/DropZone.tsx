// components/DropZone.tsx
'use client'
import { useRef, useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/ogg', 'audio/opus']
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.opus']
const MAX_BYTES = 500 * 1024 * 1024 // 500 MB

interface Props {
  onFile: (file: File) => void
}

export function DropZone({ onFile }: Props) {
  const { t } = useTranslation()
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function validate(file: File): string | null {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    const validType = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext)
    if (!validType) return t('dropzone.errorFormat')
    if (file.size > MAX_BYTES) return t('dropzone.errorSize')
    return null
  }

  function handleFile(file: File) {
    const err = validate(file)
    if (err) { setError(err); return }
    setError(null)
    onFile(file)
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={t('dropzone.ariaLabel')}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        onClick={() => inputRef.current?.click()}
        className={`border rounded-xl p-5 flex items-center gap-4 cursor-pointer transition-colors
          ${dragOver ? 'border-accent-primary bg-accent-chip' : 'border-border hover:border-text-secondary'}`}
      >
        <span className="text-3xl flex-shrink-0" aria-hidden="true">🎙️</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-text-primary">{t('dropzone.title')}</p>
          <p className="text-sm text-text-tertiary mt-1">{t('dropzone.formats')}</p>
        </div>
        <button
          type="button"
          className="flex-shrink-0 px-4 py-2 bg-accent-primary hover:bg-accent-primary-hover rounded-lg font-medium transition-colors text-white"
          onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
        >
          {t('dropzone.browse')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.m4a,.wav,.opus"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>
      {error && <p className="mt-3 text-status-error">{error}</p>}
    </div>
  )
}
