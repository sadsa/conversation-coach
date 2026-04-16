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
      <span className="underline decoration-status-error decoration-2">{segmentText.slice(startChar, endChar)}</span>
      {segmentText.slice(endChar)}»
    </span>
  )
}

function FocusCardRow({ card, rank, totalSessions }: { card: FocusCard; rank: number; totalSessions: number }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`bg-surface-elevated border rounded-xl p-5 cursor-pointer transition-colors ${expanded ? 'border-accent-primary' : 'border-border hover:border-text-secondary'}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center gap-4">
        <span className={`font-bold w-7 flex-shrink-0 ${rank <= 2 ? 'text-status-error' : 'text-text-tertiary'}`}>{rank}</span>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-text-primary">{card.displayName}</p>
          <p className="text-sm text-text-tertiary mt-1">
            {card.type} · {t('insights.appearsIn', { n: card.sessionCount, m: totalSessions })}
          </p>
        </div>
        <div className="text-right flex-shrink-0 flex items-center gap-3">
          <p className="text-2xl font-bold text-text-primary">{card.totalCount}</p>
          <svg
            xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="w-4 h-4 text-text-tertiary flex-shrink-0 transition-transform duration-300"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Smooth expand/collapse via grid-template-rows */}
      <div
        className="grid transition-[grid-template-rows] duration-300"
        style={{
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="overflow-hidden min-h-0">
          <div className="mt-5 pt-5 border-t border-border">
            {card.examples.length > 0 ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent-primary mb-4">
                  {t('insights.fromConversations')}
                </p>
                <div className="space-y-4">
                  {card.examples.map((ex, i) => (
                    <div key={i} className="bg-surface rounded-lg p-5">
                      <p className="text-text-primary leading-relaxed">
                        {underlineInText(ex.segmentText, ex.startChar, ex.endChar, ex.original)}
                      </p>
                      {ex.correction && (
                        <p className="text-correction mt-2">→ {ex.correction}</p>
                      )}
                      <p className="text-sm text-text-tertiary mt-3">
                        <span>{ex.sessionTitle}</span>
                        {' · '}
                        <span>{new Date(ex.sessionCreatedAt).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}</span>
                      </p>
                    </div>
                  ))}
                </div>
                <a
                  href={`/practice?sub_category=${card.subCategory}`}
                  className="block text-center text-accent-primary mt-5 font-medium"
                  onClick={e => e.stopPropagation()}
                >
                  {t('insights.seeAll')}
                </a>
              </>
            ) : (
              <p className="text-text-tertiary">Add annotations to your practice list to see examples here.</p>
            )}
          </div>
        </div>
      </div>
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
