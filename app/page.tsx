// app/page.tsx
//
// Home dashboard. Server Component: streams the initial sessions list
// and dashboard summary from Postgres in one server render, so the
// browser sees real content (or "first time" empty state) on the first
// paint instead of a skeleton followed by two `useEffect` round-trips.
//
// All interactive behaviour — uploads, polling, share-target pickup —
// lives in `<HomeClient>` and runs after hydration with the data we
// passed in as props.

import { redirect } from 'next/navigation'
import { HomeClient } from '@/components/HomeClient'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadSessions, loadDashboardSummary } from '@/lib/loaders'

export default async function HomePage() {
  const user = await getAuthenticatedUser()
  // Defence in depth — middleware should already have redirected, but
  // a misconfigured matcher shouldn't leak data.
  if (!user) redirect('/login')

  // Fire both reads in parallel; the home page can't render either
  // section without both, and they have no data dependency on each
  // other. Don't await sequentially.
  const [initialSessions, initialSummary] = await Promise.all([
    loadSessions(user.id).catch(() => []),
    loadDashboardSummary(user.id).catch(() => null),
  ])

  return (
    <HomeClient
      initialSessions={initialSessions}
      initialSummary={initialSummary}
    />
  )
}
