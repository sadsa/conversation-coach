'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/Icon'

export interface RowAction {
  label: string
  /** Client-side navigation href. When provided, renders as a link instead of a button. */
  href?: string
  onSelect?: () => void
  /** Renders the item in the error colour (e.g. Delete). */
  destructive?: boolean
  testId?: string
}

interface Props {
  actions: RowAction[]
  /** Accessible label for the ⋮ trigger. */
  triggerLabel: string
  triggerTestId?: string
}

// Trailing ⋮ menu for list rows. Floats over the row's trailing padding —
// no divider, no reserved column. Faint and always present on mobile;
// hover/focus-revealed on desktop (parent row owns the `group` class).
// The dropdown escapes the card's `overflow-hidden` because this component
// is positioned against the <li>, which does not clip.
export function RowActionsMenu({ actions, triggerLabel, triggerTestId }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleScroll() { setOpen(false) }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('scroll', handleScroll, { capture: true })
    }
  }, [open])

  return (
    <div ref={ref} className="absolute inset-y-0 right-0 flex items-center pr-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={triggerTestId}
        className={`
          flex items-center justify-center h-11 w-11 rounded-lg
          text-text-tertiary hover:text-text-primary hover:bg-surface-elevated
          transition-[color,background-color,opacity]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background
          md:opacity-40 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100
          ${open ? 'text-text-primary bg-surface-elevated md:opacity-100' : ''}
        `}
      >
        <Icon name="more-vertical" className="w-4 h-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-2 top-full mt-1 z-30 bg-surface border border-border-subtle rounded-lg shadow-md py-1 min-w-[160px]"
        >
          {actions.map((action, i) => {
            const itemClass = `w-full text-left px-4 py-2 text-sm hover:bg-surface-elevated transition-colors ${
              action.destructive ? 'text-status-error' : 'text-text-primary'
            }`
            if (action.href) {
              return (
                <Link
                  key={i}
                  href={action.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  data-testid={action.testId}
                  className={`block ${itemClass}`}
                >
                  {action.label}
                </Link>
              )
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                onClick={() => { action.onSelect?.(); setOpen(false) }}
                data-testid={action.testId}
                className={itemClass}
              >
                {action.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
