// components/HomeUploadFab.tsx
//
// Gmail-style floating compose control: one obvious tap target for starting
// a new upload without dedicating vertical space to a drop zone on the home
// screen. Desktop keeps a compact text button in the header row instead.

'use client'
import { useRef } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Icon } from '@/components/Icon'
import { validateAudioFile } from '@/lib/audio-upload'

interface Props {
  onFile: (file: File) => void
  onPickInvalid?: (message: string) => void
  disabled?: boolean
}

export function HomeUploadFab({ onFile, onPickInvalid, disabled }: Props) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = !!disabled
  const label = busy ? t('home.uploading') : t('home.uploadFabLabel')

  function pick() {
    if (busy) return
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
          const err = validateAudioFile(f, t)
          if (err) {
            onPickInvalid?.(err)
            return
          }
          onFile(f)
        }}
      />
      {/* Mobile: extended FAB above bottom nav — labelled so the action is unambiguous.
          min-w prevents the pill from jiggling between "Upload audio" and "Uploading…". */}
      <div className="md:hidden fixed right-4 z-40" style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          aria-busy={busy}
          aria-live="polite"
          className="flex h-14 min-w-[10.5rem] items-center justify-center gap-2 rounded-full bg-accent-primary pl-4 pr-5 text-white shadow-lg transition-transform hover:bg-accent-primary-hover active:scale-95 disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {busy
            ? <Icon name="spinner" className="w-5 h-5" aria-hidden />
            : <Icon name="plus" className="w-6 h-6" aria-hidden />}
          <span className="text-base font-medium">{label}</span>
        </button>
      </div>
      {/* Desktop: inline control in the page header */}
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        aria-busy={busy}
        className="hidden md:inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition-colors hover:border-accent-primary hover:text-accent-primary disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
      >
        {busy
          ? <Icon name="spinner" className="w-4 h-4" aria-hidden />
          : <Icon name="plus" className="w-4 h-4" aria-hidden />}
        {label}
      </button>
    </>
  )
}
