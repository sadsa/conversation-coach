// components/HomeUploadFab.tsx
//
// Inline header control for starting a new upload. Renders the same compact
// outlined button on all viewport sizes — the mobile floating FAB was
// replaced by the voice coach FAB (BottomBar). Desktop never changed.

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
      {/* Inline header button — same style on all viewport sizes.
          Touch-friendly height (h-11) on mobile; the home header's
          flex-wrap layout keeps it beside the greeting on wide screens
          and stacks it below on narrow ones. */}
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        aria-busy={busy}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 h-11 text-sm font-medium text-text-primary shadow-sm transition-colors hover:border-accent-primary hover:text-accent-primary disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
      >
        {busy
          ? <Icon name="spinner" className="w-4 h-4" aria-hidden />
          : <Icon name="plus" className="w-4 h-4" aria-hidden />}
        {label}
      </button>
    </>
  )
}
