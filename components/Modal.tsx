// components/Modal.tsx
'use client'
import { useEffect, useRef } from 'react'

interface Props {
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}

export function Modal({ title, onClose, children }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [onClose])

  return (
    <div
      data-testid="modal-backdrop"
      className="fixed inset-0 bg-black/65 flex items-center justify-center p-5 z-50"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-surface-elevated rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
          <div id="modal-title" className="text-sm font-semibold">{title}</div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors text-sm"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
