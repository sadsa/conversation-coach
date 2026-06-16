// components/ConditionalNav.tsx
'use client'
import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { BottomNav } from '@/components/BottomNav'
import type { AccountUser } from '@/components/AccountMenu'

const HIDDEN_ON = ['/login', '/access-denied', '/onboarding', '/auth']

interface Props {
  unreviewedCount: number
  user: AccountUser
}

export function ConditionalNav({ unreviewedCount, user }: Props) {
  const pathname = usePathname()

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  return (
    <>
      <AppHeader user={user} />
      <BottomNav unreadCount={unreviewedCount} />
    </>
  )
}
