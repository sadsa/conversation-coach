// components/ConditionalNav.tsx
'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { NavDrawer } from '@/components/NavDrawer'
import { BottomNav } from '@/components/BottomNav'
import { VoiceWidget } from '@/components/VoiceWidget'
import type { PracticeItem } from '@/lib/types'

const HIDDEN_ON = ['/login', '/access-denied', '/onboarding', '/auth']

export function ConditionalNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [voiceItems, setVoiceItems] = useState<PracticeItem[]>([])

  // Fetch unwritten practice items for the voice widget — only on the write page.
  useEffect(() => {
    if (pathname !== '/write') return
    fetch('/api/practice-items')
      .then(r => r.ok ? r.json() : [])
      .then((items: PracticeItem[]) => {
        setVoiceItems(items.filter(i => !i.written_down))
      })
      .catch(() => {/* widget stays hidden */})
  }, [pathname])

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  return (
    <>
      <AppHeader isOpen={isOpen} onOpen={() => setIsOpen(true)} />
      <NavDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <BottomNav />
      {pathname === '/write' && <VoiceWidget initialItems={voiceItems} />}
    </>
  )
}
