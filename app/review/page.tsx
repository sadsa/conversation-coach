// app/review/page.tsx
//
// Review tab — the inbox of recorded conversations. This route was created
// when the Practise-as-home redesign moved the methodology entry point to
// `/`; the dashboard of past sessions lives here now.
//
// Server Component: streams the initial sessions list from Postgres so
// the browser sees the inbox on first paint. All interactive behaviour —
// polling, optimistic delete, swipe-to-toggle-read — lives in `<ReviewClient>`.
//
// The dashboard-summary fetch that used to sit alongside the sessions
// load was retired with the page-level write-down reminder card. The
// bottom-nav Study tab is now the only surface that carries the
// "items waiting" signal.

import { redirect } from 'next/navigation'
import { ReviewClient } from '@/components/ReviewClient'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadSessions } from '@/lib/loaders'

export default async function ReviewPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const initialSessions = await loadSessions(user.id).catch(() => [])

  return <ReviewClient initialSessions={initialSessions} />
}
