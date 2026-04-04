// components/WriteItDownSheet.tsx
'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Annotation } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  isOpen: boolean
  annotation: Annotation
  onConfirm: () => Promise<void>
  onClose: () => void
}

const PROMPT_KEYS = [
  'writeItDown.prompt1',
  'writeItDown.prompt2',
  'writeItDown.prompt3',
] as const

export function WriteItDownSheet({ isOpen, annotation, onConfirm, onClose }: Props) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setChecked(false)
      setSuccess(false)
    }
  }, [isOpen])

  async function handleConfirm() {
    try {
      await onConfirm()
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch {
      // onConfirm failed — keep sheet open so user can try again
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            data-testid="write-it-down-backdrop"
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            data-testid="write-it-down-sheet"
            className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border border-gray-800 rounded-t-2xl px-5 pb-10 pt-4"
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
            <div className="w-9 h-1 bg-gray-700 rounded-full mx-auto mb-5" />

            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-800">
              <span className="text-lg" aria-hidden="true">✏️</span>
              <div>
                <p className="text-base font-bold text-white">{t('writeItDown.title')}</p>
                <p className="text-xs text-gray-500">{t('writeItDown.subtitle')}</p>
              </div>
            </div>

            <div className="bg-gray-950 rounded-xl px-4 py-3 mb-4">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="bg-[#3b1a1a] text-[#fca5a5] px-2 py-0.5 rounded text-sm">
                  {annotation.original}
                </span>
                <span className="text-gray-500 text-sm">→</span>
                <span className="font-semibold text-[#86efac]">{annotation.correction}</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{annotation.explanation}</p>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              {t('writeItDown.promptsLabel')}
            </p>
            <ul className="space-y-2 mb-4">
              {PROMPT_KEYS.map((key, i) => (
                <li
                  key={key}
                  className="flex items-start gap-2 bg-gray-950 rounded-lg px-3 py-2 text-sm text-gray-300"
                >
                  <span className="text-indigo-400 font-bold text-xs mt-0.5" aria-hidden="true">
                    {i + 1}
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>

            <button
              data-testid="write-it-down-checkbox"
              onClick={() => setChecked(c => !c)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-4 border transition-colors ${
                checked ? 'border-indigo-600 bg-indigo-950/30' : 'border-gray-700 bg-gray-950'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  checked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'
                }`}
              >
                {checked && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-gray-300">{t('writeItDown.checkboxLabel')}</span>
            </button>

            <button
              data-testid="write-it-down-confirm"
              disabled={!checked || success}
              onClick={handleConfirm}
              className={`w-full py-4 rounded-xl font-semibold text-base transition-colors ${
                success
                  ? 'bg-green-900 text-green-300'
                  : checked
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              {success ? t('writeItDown.successLabel') : t('writeItDown.confirmLabel')}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
