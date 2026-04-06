// components/ConditionalNav.tsx
'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { NavDrawer } from '@/components/NavDrawer'

const HIDDEN_ON = ['/login', '/access-denied', '/onboarding']

export function ConditionalNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  return (
    <>
      <AppHeader isOpen={isOpen} onOpen={() => setIsOpen(true)} />
      <NavDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
