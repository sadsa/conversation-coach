import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadStudyItems } from '@/lib/loaders'
import { StudyClient } from './StudyClient'

interface SearchParams {
  session_id?: string
  item_ids?: string
}

export default async function StudyPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const { session_id, item_ids } = searchParams

  if (session_id) {
    const phrases = await loadStudyItems(user.id, { mode: 'session', sessionId: session_id })
    if (phrases.length === 0) redirect(`/sessions/${session_id}`)
    return <StudyClient phrases={phrases} mode="session" />
  }

  if (item_ids) {
    const itemIds = item_ids.split(',').filter(Boolean)
    const phrases = await loadStudyItems(user.id, { mode: 'items', itemIds })
    if (phrases.length === 0) redirect('/vocabulary')
    return <StudyClient phrases={phrases} mode="items" />
  }

  // SRS mode — all due items
  const phrases = await loadStudyItems(user.id, { mode: 'srs' })
  if (phrases.length === 0) redirect('/vocabulary')
  return <StudyClient phrases={phrases} mode="srs" />
}
