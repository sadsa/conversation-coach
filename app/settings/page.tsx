// app/settings/page.tsx
import { getAuthenticatedUser } from '@/lib/auth'
import { SettingsClient } from '@/components/SettingsClient'

export default async function SettingsPage() {
  const authUser = await getAuthenticatedUser()
  const user = {
    name: authUser?.displayName ?? null,
    email: authUser?.email ?? null,
    avatarUrl: authUser?.avatarUrl ?? null,
  }
  return <SettingsClient user={user} />
}
