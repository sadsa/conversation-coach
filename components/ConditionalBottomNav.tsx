'use client'
import { usePathname } from 'next/navigation'
import { BottomNav } from '@/components/BottomNav'

const HIDDEN_ON = ['/login', '/access-denied']

export function ConditionalBottomNav() {
  const pathname = usePathname()
  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null
  return <BottomNav />
}
