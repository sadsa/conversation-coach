// app/sessions/[id]/page.tsx
//
// Transcript view. Server Component: loads the full session detail
// (session row + segments + annotations + saved/written flags) in
// parallel from Postgres, then hands it to the client component for
// interactive edits.
//
// While the server is rendering, Next.js shows the colocated
// `loading.tsx` skeleton — the previous client-side "loading" state
// that flashed AFTER hydration is gone, so the user no longer sees a
// blank screen between clicking a session card and seeing real content.

import { notFound, redirect } from 'next/navigation'
import { TranscriptClient } from '@/components/TranscriptClient'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadSessionDetail } from '@/lib/loaders'

export default async function TranscriptPage({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const detail = await loadSessionDetail(user.id, params.id)
  if (!detail) notFound()

  return <TranscriptClient sessionId={params.id} initialDetail={detail} />
}
