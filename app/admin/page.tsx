import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/auth'
import { loadAllowedUsers } from '@/lib/loaders'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL?.toLowerCase()
  if (!OWNER_EMAIL || user.email?.toLowerCase() !== OWNER_EMAIL) notFound()

  const users = await loadAllowedUsers()
  return <AdminClient users={users} ownerEmail={OWNER_EMAIL} />
}
