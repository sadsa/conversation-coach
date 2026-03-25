import { fetchInsightsData } from '@/lib/insights'
import { InsightsCardList } from '@/components/InsightsCardList'

export default async function InsightsPage() {
  const { totalReadySessions, focusCards } = await fetchInsightsData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Where you&rsquo;re struggling</h1>
        <p className="text-sm text-gray-400 mt-1">Your recurring mistakes, ranked by frequency</p>
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
          totalSessions={totalReadySessions}
        />
      )}
    </div>
  )
}
