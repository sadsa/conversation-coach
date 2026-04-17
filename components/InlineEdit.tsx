// components/InlineEdit.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { Icon } from '@/components/Icon'

interface Props {
  value: string
  onSave: (value: string) => Promise<void>
  className?: string
  /** Accessible label for both the trigger and the text input. */
  ariaLabel?: string
}

export function InlineEdit({ value, onSave, className = '', ariaLabel = 'Rename' }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(value) }, [value])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) {
      setDraft(value)
      setEditing(false)
      return
    }
    await onSave(trimmed)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={ariaLabel}
        className={`group inline-flex items-baseline gap-2 text-left min-w-0 cursor-text rounded-md -mx-1 px-1 hover:bg-surface-elevated transition-colors ${className}`}
      >
        <span className="break-words min-w-0">{value}</span>
        <Icon
          name="pencil"
          className="w-4 h-4 self-center shrink-0 text-text-tertiary opacity-60 group-hover:opacity-100 transition-opacity"
        />
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      aria-label={ariaLabel}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      className={`bg-transparent border-b-2 border-accent-primary outline-none min-w-0 w-full ${className}`}
    />
  )
}
