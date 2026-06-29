'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import Link from 'next/link'
import { LessonClient } from '@/components/LessonClient'
import { useTranslation } from '@/components/LanguageProvider'
import type { LessonPhrase } from '@/lib/voice-agent'

interface Props {
  phrases: LessonPhrase[]
  mode: 'session' | 'srs' | 'items'
}

export function StudyClient({ phrases, mode }: Props) {
  const router = useRouter()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const [showPrompt, setShowPrompt] = useState(false)

  function handleExit() {
    if (mode === 'session') {
      setShowPrompt(true)
    } else {
      router.push('/vocabulary')
    }
  }

  if (showPrompt) {
    const reveal = (delay: number) =>
      reducedMotion
        ? { initial: false as const }
        : {
            initial: { opacity: 0, y: 8 },
            animate: { opacity: 1, y: 0 },
            transition: { delay, duration: 0.4, ease: [0.25, 1, 0.5, 1] as const },
          }

    return (
      <div
        className="fixed flex flex-col items-center justify-center gap-5 bg-background z-10 px-8 text-center"
        style={{
          top: 'calc(var(--header-height) + env(safe-area-inset-top))',
          left: 0,
          right: 0,
          bottom: 'var(--bottom-nav-h)',
        }}
      >
        <motion.h2 className="text-2xl font-serif text-text-primary" {...reveal(0)}>
          {t('lesson.wantMoreHeading')}
        </motion.h2>
        <motion.p className="text-base text-text-secondary -mt-2" {...reveal(0.1)}>
          {t('lesson.wantMoreSub')}
        </motion.p>
        <motion.div {...reveal(0.2)}>
          <Link
            href="/vocabulary"
            className="inline-flex min-h-11 items-center px-6 py-2.5 text-sm font-medium rounded-xl bg-accent-primary text-on-accent hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 transition-colors"
          >
            {t('lesson.wantMoreCta')}
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <LessonClient
      phrases={phrases}
      onExit={handleExit}
      onCompletionAction={handleExit}
      completionLabel={mode === 'session' ? undefined : t('lesson.backToVocabulary')}
    />
  )
}
