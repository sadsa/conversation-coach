import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { PracticeClient } from '@/components/PracticeClient'
import type { TargetLanguage } from '@/lib/types'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Practice — Conversation Coach',
}

export default async function PracticePage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  // targetLanguage from the auth header is typed string | null; default to es-AR
  const targetLanguage: TargetLanguage =
    (user.targetLanguage as TargetLanguage) ?? 'es-AR'
  return <PracticeClient targetLanguage={targetLanguage} />
}
