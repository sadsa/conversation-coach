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
import { loadPracticeItems } from '@/lib/loaders'

export default async function WritePage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  const initialItems = await loadPracticeItems(user.id)
  return <WriteClient initialItems={initialItems} />
}
