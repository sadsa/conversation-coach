// components/ConditionalNav.tsx
'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { NavDrawer } from '@/components/NavDrawer'
import { BottomNav } from '@/components/BottomNav'
import type { AccountUser } from '@/components/AccountMenu'

const HIDDEN_ON = ['/login', '/access-denied', '/onboarding', '/auth']

interface Props {
  unreviewedCount: number
  user: AccountUser
}

export function ConditionalNav({ unreviewedCount, user }: Props) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  return (
    <>
      <AppHeader isOpen={isOpen} onOpen={() => setIsOpen(true)} user={user} />
      <NavDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} unreadCount={unreviewedCount} user={user} />
      <BottomNav unreadCount={unreviewedCount} />
    </>
  )
}
