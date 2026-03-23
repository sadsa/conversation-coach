import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InsightsCardList } from '@/components/InsightsCardList'
import type { FocusCard } from '@/lib/insights'

const mockCards: FocusCard[] = [
  {
    subCategory: 'subjunctive',
    type: 'grammar',
    displayName: 'Subjunctive',
    totalCount: 10,
    sessionCount: 4,
    trend: 'needs-attention',
    examples: [
      { original: 'cuando vengas', correction: 'cuando venís', startChar: 8, endChar: 14, segmentText: 'cuando vengas a casa', sessionTitle: 'Chat with Sofía', sessionCreatedAt: '2026-03-18T10:00:00Z' },
    ],
  },
  {
    subCategory: 'ser-estar',
    type: 'grammar',
    displayName: 'Ser / Estar',
    totalCount: 5,
    sessionCount: 2,
    trend: 'keep-practicing',
    examples: [],
  },
]

describe('InsightsCardList', () => {
  it('renders focus cards with rank, name, count, and trend', () => {
    render(<InsightsCardList focusCards={mockCards} totalSessions={5} />)
    expect(screen.getByText('Subjunctive')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument()
    expect(screen.getByText('Ser / Estar')).toBeInTheDocument()
    expect(screen.getByText(/keep practicing/i)).toBeInTheDocument()
  })

  it('shows examples when a card is expanded', async () => {
    render(<InsightsCardList focusCards={mockCards} totalSessions={5} />)
    // Examples are not visible initially
    expect(screen.queryByText('Chat with Sofía')).not.toBeInTheDocument()
    // Click the first card to expand
    await userEvent.click(screen.getByText('Subjunctive'))
    // Examples now visible
    expect(screen.getByText('Chat with Sofía')).toBeInTheDocument()
  })

  it('hides trend chips when totalSessions < 4', () => {
    const cardsNoTrend = mockCards.map(c => ({ ...c, trend: null }))
    render(<InsightsCardList focusCards={cardsNoTrend} totalSessions={2} />)
    expect(screen.queryByText(/needs attention/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/keep practicing/i)).not.toBeInTheDocument()
  })
})
