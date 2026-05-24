import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { ElevenLabsDebugClient } from './ElevenLabsDebugClient'

export default async function ElevenLabsDebugPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')
  return <ElevenLabsDebugClient />
}
