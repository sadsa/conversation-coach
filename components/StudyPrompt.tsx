'use client'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  count: number
  onLaunchStudy: () => void
}

export function StudyPrompt({ count, onLaunchStudy }: Props) {
  const { t } = useTranslation()
  const prefersReducedMotion = useReducedMotion()

  if (count === 0) return null

  // Singular vs plural status — no plural engine in t(), so branch on count.
  const status = count === 1
    ? t('transcript.phraseSaved')
    : t('transcript.phrasesSaved', { n: count })

  return (
    <AnimatePresence>
      <motion.div
        key="study-prompt"
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.25, 1, 0.5, 1] }}
        // Detached elevated bar: side insets (px-4) keep it off the edges so
        // it never merges with the bg-surface BottomNav directly below. On md+
        // the bar centres and stops at the content column (max-w-prose).
        className="fixed left-0 right-0 flex justify-center z-50 px-4 pointer-events-none"
        style={{ bottom: 'var(--toast-bottom)' }}
      >
        <div
          className="
            pointer-events-auto w-full max-w-prose
            flex items-center justify-between gap-3
            pl-4 pr-2 py-2
            bg-accent-chip border border-accent-chip-border rounded-2xl shadow-lg
          "
        >
          {/* key={count} re-triggers the micro-entrance on each save — a quiet
              acknowledgment that something was just added to the queue. */}
          <motion.span
            key={count}
            initial={{ opacity: prefersReducedMotion ? 1 : 0.5, scale: prefersReducedMotion ? 1 : 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
            className="min-w-0 truncate text-sm text-on-accent-chip"
          >
            {status}
          </motion.span>
          <motion.button
            type="button"
            onClick={onLaunchStudy}
            aria-label={t('transcript.studyPromptAria', { n: count })}
            whileHover={prefersReducedMotion ? {} : { y: -1 }}
            whileTap={prefersReducedMotion ? {} : { scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="
              shrink-0 inline-flex items-center gap-1.5
              px-4 py-2 rounded-xl
              bg-accent-primary text-on-accent text-sm font-medium
              hover:bg-accent-primary-hover
              transition-colors duration-100
            "
          >
            <span>{t('transcript.study')}</span>
            {/* Arrow shifts right on hover — a directional hint without fanfare. */}
            <motion.span
              className="inline-flex items-center"
              whileHover={prefersReducedMotion ? {} : { x: 2 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <Icon name="arrow-right" className="w-4 h-4 shrink-0" />
            </motion.span>
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
