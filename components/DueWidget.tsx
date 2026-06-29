import Link from 'next/link'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  dueCount: number
}

export function DueWidget({ dueCount }: Props) {
  const { t } = useTranslation()

  if (dueCount === 0) return null

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3"
      data-testid="due-widget"
    >
      <p className="text-sm font-medium text-text-primary">
        {t('vocabulary.dueCount', { n: dueCount })}
      </p>
      <Link
        href="/study"
        className="shrink-0 rounded-lg bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        data-testid="due-widget-study-link"
      >
        {t('vocabulary.studyNow')}
      </Link>
    </div>
  )
}
