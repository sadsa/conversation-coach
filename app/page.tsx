// app/page.tsx
//
// Practise home — the first impression. Server Component: streams the
// user's auth check and hands an empty payload to `<PractiseClient>` for
// the three doors and the share-target pickup.
//
// Note: this route only needs the user. The conversations dashboard
// lives at /review now; we deliberately don't fetch it here to keep
// the home as light as possible. The old dashboard-summary fetch was
// retired with the methodology eyebrow's Study count badge — there is
// no dashboard data on this page anymore.

import { redirect } from 'next/navigation'
import { PractiseClient } from '@/components/PractiseClient'
import { getAuthenticatedUser } from '@/lib/auth'

export default async function HomePage() {
  const user = await getAuthenticatedUser()
  // Defence in depth — middleware should already have redirected, but a
  // misconfigured matcher shouldn't leak data.
  if (!user) redirect('/login')

  return <PractiseClient />
}
