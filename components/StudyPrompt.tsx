'use client'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Icon } from '@/components/Icon'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  count: number
}

export function StudyPrompt({ count }: Props) {
  const { t } = useTranslation()
  const prefersReducedMotion = useReducedMotion()

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="study-prompt"
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.25, 1, 0.5, 1] }}
          className="fixed left-0 right-0 flex justify-center z-50 pointer-events-none"
          style={{ bottom: 'var(--toast-bottom)' }}
        >
          <Link
            href="/write"
            aria-label={t('transcript.studyPromptAria', { n: count })}
            className="
              pointer-events-auto flex items-center gap-2
              px-5 py-3 rounded-full
              bg-accent-primary text-on-accent
              shadow-lg text-sm font-medium
              hover:bg-accent-primary-hover active:scale-95
              transition-colors duration-100
              max-w-[calc(100%-2rem)]
            "
          >
            <Icon name="book" className="w-4 h-4 shrink-0" />
            <span className="truncate">{t('transcript.studyPrompt', { n: count })}</span>
            <Icon name="arrow-right" className="w-4 h-4 shrink-0" />
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
