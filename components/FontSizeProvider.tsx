// components/FontSizeProvider.tsx
'use client'
import { useEffect } from 'react'

export function FontSizeProvider() {
  useEffect(() => {
    const stored = localStorage.getItem('fontSize')
    if (stored) {
      document.documentElement.style.fontSize = stored + 'px'
    }
  }, [])
  return null
}
