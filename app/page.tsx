// app/page.tsx
//
// Practise home — the first impression. Server Component: streams the
// user's auth check and hands a minimal payload to `<PractiseClient>` for
// the three doors and the share-target pickup.
//
// The home itself owns no dashboard data (that moved to /review) — the
// ONLY server load here is the two-probe "has the user crossed Review or
// Study yet?" check that gates the methodology eyebrow's locked-pillar
// state. Empty accounts shouldn't see clickable Review/Study links that
// teleport into placeholder empty states.

import { redirect } from 'next/navigation'
import { PractiseClient } from '@/components/PractiseClient'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadEmptyAccountFlags } from '@/lib/loaders'
import type { Pillar } from '@/components/MethodologyEyebrow'

export default async function HomePage() {
  const user = await getAuthenticatedUser()
  // Defence in depth — middleware should already have redirected, but a
  // misconfigured matcher shouldn't leak data.
  if (!user) redirect('/login')

  const { hasSessions, hasPracticeItems } = await loadEmptyAccountFlags(user.id)
    .catch(() => ({ hasSessions: true, hasPracticeItems: true }))
  // On failure we fail OPEN — render both pillars as real links. A
  // transient query error shouldn't lock a user out of their own data.
  const lockedPillars: Pillar[] = []
  if (!hasSessions) lockedPillars.push('review')
  if (!hasPracticeItems) lockedPillars.push('study')

  return <PractiseClient lockedPillars={lockedPillars} />
}
