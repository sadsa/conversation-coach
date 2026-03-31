'use client'

import { useState, useEffect } from 'react'
import { InsightsCardList } from '@/components/InsightsCardList'
import { useTranslation } from '@/components/LanguageProvider'
import type { FocusCard } from '@/lib/insights'

export default function InsightsPage() {
  const [totalReadySessions, setTotalReadySessions] = useState(0)
  const [focusCards, setFocusCards] = useState<FocusCard[]>([])
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()

  useEffect(() => {
    fetch('/api/insights')
      .then((r) => r.json())
      .then((data) => {
        setTotalReadySessions(data.totalReadySessions ?? 0)
        setFocusCards(data.focusCards ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('insights.title')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('insights.subtitle')}</p>
      </div>

      {totalReadySessions === 0 ? (
        <p className="text-gray-500 text-sm">{t('insights.empty')}</p>
      ) : focusCards.length === 0 ? (
        <p className="text-gray-500 text-sm">{t('insights.noMistakes')}</p>
      ) : (
        <InsightsCardList
          focusCards={focusCards}
          totalSessions={totalReadySessions}
        />
      )}
    </div>
  )
}
