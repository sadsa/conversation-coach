// components/DropZone.tsx
'use client'
import { useRef, useState } from 'react'

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/ogg', 'audio/opus']
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.opus']
const MAX_BYTES = 500 * 1024 * 1024 // 500 MB

interface Props {
  onFile: (file: File) => void
}

export function DropZone({ onFile }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function validate(file: File): string | null {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    const validType = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext)
    if (!validType) return `Unsupported format. Use MP3, M4A, WAV, or OPUS.`
    if (file.size > MAX_BYTES) return `File too large. Maximum is 500 MB.`
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
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        onClick={() => inputRef.current?.click()}
        className={`border rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-colors
          ${dragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-500'}`}
      >
        <span className="text-2xl flex-shrink-0" aria-hidden="true">🎙️</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-100 text-sm">Upload conversation</p>
          <p className="text-xs text-gray-500 mt-0.5">MP3, M4A, WAV, OPUS</p>
        </div>
        <button
          type="button"
          className="flex-shrink-0 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
          onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
        >
          Browse
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.m4a,.wav,.opus"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  )
}
