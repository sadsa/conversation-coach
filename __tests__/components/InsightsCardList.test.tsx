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
    examples: [],
  },
]

describe('InsightsCardList', () => {
  it('renders focus cards with rank, name, and count', () => {
    render(<InsightsCardList focusCards={mockCards} totalSessions={5} />)
    expect(screen.getByText('Subjunctive')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('Ser / Estar')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows examples when a card is expanded', async () => {
    render(<InsightsCardList focusCards={mockCards} totalSessions={5} />)
    expect(screen.queryByText('Chat with Sofía')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Subjunctive'))
    expect(screen.getByText('Chat with Sofía')).toBeInTheDocument()
  })
})
