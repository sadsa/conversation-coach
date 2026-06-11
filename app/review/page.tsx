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
import { loadEmptyAccountFlags, loadSessions } from '@/lib/loaders'
import type { Pillar } from '@/components/MethodologyEyebrow'

export default async function ReviewPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  // Sessions list + Study-pillar lock probe in parallel. We could derive
  // `hasSessions` from `initialSessions.length` and skip the sessions
  // half of `loadEmptyAccountFlags`, but the probe is a single-row
  // limit(1) and the code stays simpler when every page calls the same
  // loader. The Study pillar lock IS load-bearing here — a user with
  // recordings but no saved corrections should see Study dashed-locked.
  const [initialSessions, flags] = await Promise.all([
    loadSessions(user.id).catch(() => []),
    loadEmptyAccountFlags(user.id).catch(() => ({
      hasSessions: true,
      hasPracticeItems: true,
    })),
  ])

  const lockedPillars: Pillar[] = []
  // Review itself is the active surface, so it never locks here. We
  // still respect the Study lock — same rule across the methodology.
  if (!flags.hasPracticeItems) lockedPillars.push('refine')

  return (
    <ReviewClient
      initialSessions={initialSessions}
      lockedPillars={lockedPillars}
    />
  )
}
