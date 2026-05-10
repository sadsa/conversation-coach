import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { PracticeClient } from '@/components/PracticeClient'
import type { TargetLanguage } from '@/lib/types'

export default async function PracticePage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  // targetLanguage from the auth header is typed string | null; default to es-AR
  const targetLanguage: TargetLanguage =
    (user.targetLanguage as TargetLanguage) ?? 'es-AR'
  return <PracticeClient targetLanguage={targetLanguage} />
}
