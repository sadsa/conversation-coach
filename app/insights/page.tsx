import { fetchInsightsData } from '@/lib/insights'
import { InsightsCardList } from '@/components/InsightsCardList'

export default async function InsightsPage() {
  const { totalReadySessions, focusCards, strengthChips } = await fetchInsightsData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Insights</h1>
        <p className="text-sm text-gray-400 mt-1">Patterns across all your sessions</p>
      </div>

      {totalReadySessions === 0 ? (
        <p className="text-gray-500 text-sm">
          Insights will appear once you&rsquo;ve recorded and analysed some conversations.
        </p>
      ) : focusCards.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No categorised mistakes yet. Re-analyse a session to generate insights.
        </p>
      ) : (
        <InsightsCardList
          focusCards={focusCards}
          strengthChips={strengthChips}
          totalSessions={totalReadySessions}
        />
      )}
    </div>
  )
}
