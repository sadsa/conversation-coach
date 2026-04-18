// components/Modal.tsx
'use client'
import { useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { IconButton } from '@/components/IconButton'

interface Props {
  isOpen?: boolean
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}

function ModalContent({ title, onClose, children }: Omit<Props, 'isOpen'>) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const prefersReducedMotion = useReducedMotion()

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

  const backdropTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.18 }
  const dialogTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.25, 1, 0.5, 1] as const }
  const dialogInitial = prefersReducedMotion
    ? { opacity: 1, scale: 1, y: 0 }
    : { opacity: 0, scale: 0.96, y: 8 }
  const dialogExit = prefersReducedMotion
    ? { opacity: 1, scale: 1, y: 0 }
    : { opacity: 0, scale: 0.96, y: 8 }

  return (
    <motion.div
      data-testid="modal-backdrop"
      className="fixed inset-0 flex items-center justify-center p-5 z-50"
      style={{ background: 'var(--color-scrim)' }}
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={backdropTransition}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-surface-elevated rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        initial={dialogInitial}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={dialogExit}
        transition={dialogTransition}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div id="modal-title" className="font-semibold">{title}</div>
          <IconButton
            ref={closeButtonRef}
            icon="close"
            shape="circle"
            size="sm"
            aria-label="Close"
            onClick={onClose}
          />
        </div>
        <div className="p-5">
          {children}
        </div>
      </motion.div>
    </motion.div>
  )
}

/**
 * Modal supports two usage patterns:
 * 1. Controlled: <Modal isOpen={bool} ...> — handles enter/exit animations automatically
 * 2. Legacy conditional: {bool && <Modal ...>} — entry animation plays, exit is instant
 */
export function Modal({ isOpen, title, onClose, children }: Props) {
  if (isOpen !== undefined) {
    return (
      <AnimatePresence>
        {isOpen && <ModalContent title={title} onClose={onClose}>{children}</ModalContent>}
      </AnimatePresence>
    )
  }
  return <ModalContent title={title} onClose={onClose}>{children}</ModalContent>
}
