// app/write/page.tsx
//
// "To write down" surface. Server Component: fetches the user's
// outstanding practice items in one round-trip and hands them to the
// client component, so the page lands with real content (or an empty
// state) instead of skeleton -> fetch -> render.
//
// While the server is rendering, Next.js shows `loading.tsx` in this
// folder, which mirrors the page's actual shape so the transition
// doesn't jar the eye.

import { redirect } from 'next/navigation'
import { WriteClient } from '@/components/WriteClient'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadEmptyAccountFlags, loadPracticeItems } from '@/lib/loaders'
import type { Pillar } from '@/components/MethodologyEyebrow'

export default async function WritePage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  // Practice items + Review-pillar lock probe in parallel. Review locks
  // when the user has no sessions yet — that case is rare in practice
  // (you almost certainly have a session before any practice item lands
  // here) but the eyebrow stays consistent across surfaces.
  const [initialItems, flags] = await Promise.all([
    loadPracticeItems(user.id),
    loadEmptyAccountFlags(user.id).catch(() => ({
      hasSessions: true,
      hasPracticeItems: true,
    })),
  ])

  const lockedPillars: Pillar[] = []
  if (!flags.hasSessions) lockedPillars.push('review')

  return <WriteClient initialItems={initialItems} lockedPillars={lockedPillars} />
}
