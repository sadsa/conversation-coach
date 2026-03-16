// components/DropZone.tsx
'use client'
import { useRef, useState } from 'react'

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/ogg']
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
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
          ${dragOver ? 'border-violet-500 bg-violet-500/10' : 'border-gray-700 hover:border-gray-500'}`}
      >
        <div className="text-4xl mb-3">🎙️</div>
        <p className="font-medium">Drop audio file here</p>
        <p className="text-sm text-gray-500 mt-1">MP3, M4A, WAV, OPUS · up to 500 MB / 2 hours</p>
        <button
          type="button"
          className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
          onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
        >
          Browse file
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
