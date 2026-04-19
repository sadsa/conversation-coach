// components/HomeUploadFab.tsx
//
// Gmail-style floating compose control: one obvious tap target for starting
// a new upload without dedicating vertical space to a drop zone on the home
// screen. Desktop keeps a compact text button in the header row instead.

'use client'
import { useRef } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/ogg', 'audio/opus']
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.opus']
const MAX_BYTES = 500 * 1024 * 1024

interface Props {
  onFile: (file: File) => void
  onPickInvalid?: (message: string) => void
  disabled?: boolean
}

export function HomeUploadFab({ onFile, onPickInvalid, disabled }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  function validate(file: File): string | null {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    const validType = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext)
    if (!validType) return t('dropzone.errorFormat')
    if (file.size > MAX_BYTES) return t('dropzone.errorSize')
    return null
  }

  function pick() {
    if (disabled) return
    inputRef.current?.click()
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.m4a,.wav,.opus"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={e => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          const err = validate(f)
          if (err) {
            onPickInvalid?.(err)
            return
          }
          onFile(f)
        }}
      />
      {/* Mobile: fixed FAB above bottom nav */}
      <div className="md:hidden fixed right-4 z-40" style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={pick}
          disabled={disabled}
          aria-label={t('home.uploadFabAria')}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-primary text-white shadow-lg transition-transform hover:bg-accent-primary-hover active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          <Icon name="plus" className="w-7 h-7" aria-hidden />
        </button>
      </div>
      {/* Desktop: inline control in the page header */}
      <button
        type="button"
        onClick={pick}
        disabled={disabled}
        className="hidden md:inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition-colors hover:border-accent-primary hover:text-accent-primary disabled:opacity-50"
      >
        <Icon name="plus" className="w-4 h-4" aria-hidden />
        {t('home.uploadFabLabel')}
      </button>
    </>
  )
}
