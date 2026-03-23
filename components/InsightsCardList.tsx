'use client'
import { useState } from 'react'
import type { FocusCard, TrendResult } from '@/lib/insights'

const TREND_CONFIG: Record<TrendResult, { label: string; arrow: string; className: string }> = {
  'making-progress': { label: 'making progress', arrow: '↑', className: 'text-green-400' },
  'keep-practicing': { label: 'keep practicing', arrow: '→', className: 'text-gray-400' },
  'needs-attention': { label: 'needs attention', arrow: '↓', className: 'text-red-400' },
}

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

function TrendChip({ trend }: { trend: TrendResult }) {
  const { label, arrow, className } = TREND_CONFIG[trend]
  return (
    <span className={`text-xs font-semibold ${className}`}>
      {arrow} {label}
    </span>
  )
}

function FocusCardRow({ card, rank, totalSessions }: { card: FocusCard; rank: number; totalSessions: number }) {
  const [expanded, setExpanded] = useState(false)
  const showTrend = card.trend !== null

  return (
    <div
      className={`bg-gray-800 border rounded-xl p-4 cursor-pointer transition-colors ${expanded ? 'border-indigo-500' : 'border-gray-700 hover:border-gray-500'}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold w-5 flex-shrink-0 ${rank <= 2 ? 'text-red-400' : 'text-gray-500'}`}>{rank}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-100">{card.displayName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{card.type} · appears in {card.sessionCount} of {totalSessions} sessions</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-bold text-gray-100">{card.totalCount}</p>
          {showTrend && <TrendChip trend={card.trend!} />}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-700" onClick={e => e.stopPropagation()}>
          {card.examples.length > 0 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-3">From your conversations</p>
              <div className="space-y-2">
                {card.examples.map((ex, i) => (
                  <div key={i} className="bg-gray-900 rounded-lg p-3">
                    <p className="text-sm text-gray-200">
                      {underlineInText(ex.segmentText, ex.startChar, ex.endChar, ex.original)}
                    </p>
                    {ex.correction && (
                      <p className="text-sm text-green-400 mt-1">→ {ex.correction}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
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
                See all {card.totalCount} examples →
              </a>
            </>
          ) : (
            <p className="text-sm text-gray-500">Add annotations to your practice list to see examples here.</p>
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
    <div className="space-y-8">
      {/* Where to Focus */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Where to focus</h2>
        <div className="space-y-2">
          {focusCards.map((card, i) => (
            <FocusCardRow key={card.subCategory} card={card} rank={i + 1} totalSessions={totalSessions} />
          ))}
        </div>
      </section>
    </div>
  )
}
