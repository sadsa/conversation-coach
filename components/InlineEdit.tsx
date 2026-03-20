// components/InlineEdit.tsx
'use client'
import { useState, useRef, useEffect } from 'react'

interface Props {
  value: string
  onSave: (value: string) => Promise<void>
  className?: string
}

export function InlineEdit({ value, onSave, className = '' }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

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
      <span
        className={`cursor-pointer hover:underline decoration-dotted min-w-0 ${className}`}
        onClick={() => setEditing(true)}
        title="Click to rename"
      >
        {value}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      className={`bg-transparent border-b border-gray-400 outline-none min-w-0 w-full ${className}`}
    />
  )
}
