import { redirect } from 'next/navigation'
import { VocabularyClient } from '@/components/VocabularyClient'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadPracticeItems } from '@/lib/loaders'

export default async function VocabularyPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const { items: initialItems, dueCount } = await loadPracticeItems(user.id)

  return <VocabularyClient initialItems={initialItems} dueCount={dueCount} />
}
