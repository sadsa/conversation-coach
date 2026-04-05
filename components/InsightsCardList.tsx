'use client'
import { useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import type { FocusCard } from '@/lib/insights'

function underlineInText(segmentText: string, startChar: number, endChar: number, original: string): React.ReactNode {
  const isValid = startChar >= 0 && endChar <= segmentText.length && startChar < endChar
  if (!isValid) return <span>«{original}»</span>
  return (
    <span>
      «{segmentText.slice(0, startChar)}
      <span className="underline decoration-red-400 decoration-2">{segmentText.slice(startChar, endChar)}</span>
      {segmentText.slice(endChar)}»
    </span>
  )
}

function FocusCardRow({ card, rank, totalSessions }: { card: FocusCard; rank: number; totalSessions: number }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`bg-surface-elevated border rounded-xl p-4 cursor-pointer transition-colors ${expanded ? 'border-indigo-500' : 'border-border hover:border-text-secondary'}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold w-5 flex-shrink-0 ${rank <= 2 ? 'text-red-400' : 'text-text-tertiary'}`}>{rank}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-text-primary">{card.displayName}</p>
          <p className="text-xs text-text-tertiary mt-0.5">
            {card.type} · {t('insights.appearsIn', { n: card.sessionCount, m: totalSessions })}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-bold text-text-primary">{card.totalCount}</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border" onClick={e => e.stopPropagation()}>
          {card.examples.length > 0 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-3">
                {t('insights.fromConversations')}
              </p>
              <div className="space-y-2">
                {card.examples.map((ex, i) => (
                  <div key={i} className="bg-surface rounded-lg p-3">
                    <p className="text-sm text-text-primary">
                      {underlineInText(ex.segmentText, ex.startChar, ex.endChar, ex.original)}
                    </p>
                    {ex.correction && (
                      <p className="text-sm text-green-400 mt-1">→ {ex.correction}</p>
                    )}
                    <p className="text-xs text-text-tertiary mt-1">
                      <span>{ex.sessionTitle}</span>
                      {' · '}
                      <span>{new Date(ex.sessionCreatedAt).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}</span>
                    </p>
                  </div>
                ))}
              </div>
              <a
                href={`/practice?sub_category=${card.subCategory}`}
                className="block text-center text-sm text-indigo-400 mt-3"
                onClick={e => e.stopPropagation()}
              >
                {t('insights.seeAll')}
              </a>
            </>
          ) : (
            <p className="text-sm text-text-tertiary">Add annotations to your practice list to see examples here.</p>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  focusCards: FocusCard[]
  totalSessions: number
}

export function InsightsCardList({ focusCards, totalSessions }: Props) {
  return (
    <div className="space-y-2">
      {focusCards.map((card, i) => (
        <FocusCardRow key={card.subCategory} card={card} rank={i + 1} totalSessions={totalSessions} />
      ))}
    </div>
  )
}
