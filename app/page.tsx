// app/page.tsx
//
// Practise home — the first impression. Server Component: streams the
// user's auth check and hands a minimal payload to `<PractiseClient>` for
// the three doors and the share-target pickup.

import { redirect } from 'next/navigation'
import { PractiseClient } from '@/components/PractiseClient'
import { getAuthenticatedUser } from '@/lib/auth'

export default async function HomePage() {
  const user = await getAuthenticatedUser()
  // Defence in depth — middleware should already have redirected, but a
  // misconfigured matcher shouldn't leak data.
  if (!user) redirect('/login')

  return <PractiseClient displayName={user.displayName} />
}
