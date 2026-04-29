'use client'
import { motion, AnimatePresence } from 'framer-motion'

interface ExplainSheetProps {
  isOpen: boolean
  onClose: () => void
  original: string
  correction: string | null
  note: string
}

export function ExplainSheet({ isOpen, onClose, original, correction, note }: ExplainSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            data-testid="explain-sheet-backdrop"
            className="fixed inset-0 z-40 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            data-testid="explain-sheet"
            className="fixed bottom-0 left-0 right-0 z-50 bg-accent-chip border border-accent-chip-border rounded-t-2xl px-5 pb-10 pt-4"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            dragDirectionLock
            style={{ touchAction: 'none' }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80) onClose()
            }}
          >
            {/* Drag handle */}
            <div className="w-9 h-1 bg-accent-handle rounded-full mx-auto mb-5" />

            {/* Original → correction */}
            <div className="bg-error-container rounded-xl px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
              <span className="bg-error-surface text-on-error-surface px-2 py-0.5 rounded text-sm">
                {original}
              </span>
              <span className="text-text-tertiary text-sm">→</span>
              {correction !== null
                ? <span className="font-semibold text-correction">{correction}</span>
                : <span className="text-text-tertiary">—</span>
              }
            </div>

            {/* Divider + Note — hidden when no note */}
            {note && (
              <>
                <hr className="border-accent-chip-border mb-4 opacity-40" />
                <p className="text-text-secondary leading-relaxed">{note}</p>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
