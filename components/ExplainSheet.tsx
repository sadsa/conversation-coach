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
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            data-testid="explain-sheet"
            className="fixed bottom-0 left-0 right-0 z-50 bg-indigo-950 border border-indigo-800 rounded-t-2xl px-5 pb-10 pt-4"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
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
            <div className="w-9 h-1 bg-indigo-700 rounded-full mx-auto mb-5" />

            {/* Original → correction */}
            <div className="bg-[#2d1515] rounded-xl px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
              <span className="bg-[#3b1a1a] text-[#fca5a5] px-2 py-0.5 rounded text-sm">
                {original}
              </span>
              <span className="text-gray-500 text-sm">→</span>
              {correction !== null
                ? <span className="font-semibold text-[#86efac]">{correction}</span>
                : <span className="text-gray-500">—</span>
              }
            </div>

            {/* Divider */}
            <hr className="border-indigo-900/40 mb-4" />

            {/* Note */}
            <p className="text-sm text-gray-400 leading-relaxed">{note}</p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
