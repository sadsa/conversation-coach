// app/settings/page.tsx
'use client'
import { useState } from 'react'

const MIN = 14
const MAX = 22
const STEP = 2
const KEY = 'fontSize'

export default function SettingsPage() {
  const [size, setSize] = useState<number>(() => {
    if (typeof window === 'undefined') return 16
    return parseInt(localStorage.getItem(KEY) ?? '16', 10)
  })

  function apply(newSize: number) {
    setSize(newSize)
    document.documentElement.style.fontSize = newSize + 'px'
    localStorage.setItem(KEY, String(newSize))
  }

  return (
    <div className="space-y-8 max-w-sm">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Text Size</h2>

        <div className="flex items-center gap-4">
          <button
            onClick={() => apply(size - STEP)}
            disabled={size <= MIN}
            aria-label="−"
            className="w-9 h-9 rounded border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            −
          </button>
          <span className="text-base font-mono w-12 text-center">{size}px</span>
          <button
            onClick={() => apply(size + STEP)}
            disabled={size >= MAX}
            aria-label="+"
            className="w-9 h-9 rounded border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            +
          </button>
        </div>

        <div className="mt-4 border border-gray-800 rounded-lg p-4 space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Preview</p>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">You</p>
            <span className="text-sm leading-relaxed">
              Hoy fui al mercado y compré muchas cosas para la semana.
            </span>
          </div>
          <div className="opacity-40">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Them</p>
            <span className="text-sm leading-relaxed">¿Y qué compraste?</span>
          </div>
        </div>
      </div>
    </div>
  )
}
