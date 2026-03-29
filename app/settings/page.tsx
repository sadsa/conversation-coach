// app/settings/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import { TARGET_LANGUAGES, type TargetLanguage } from '@/lib/types'

const MIN = 14
const MAX = 22
const STEP = 2
const KEY = 'fontSize'

export default function SettingsPage() {
  const [size, setSize] = useState<number>(16)
  const [language, setLanguage] = useState<TargetLanguage>('es-AR')
  const router = useRouter()
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    const stored = localStorage.getItem(KEY)
    if (stored) setSize(parseInt(stored, 10))
  }, [])

  useEffect(() => {
    async function loadLanguage() {
      const { data } = await supabase!.auth.getUser()
      const lang = data.user?.user_metadata?.target_language as TargetLanguage | undefined
      if (lang && lang in TARGET_LANGUAGES) setLanguage(lang)
    }
    void loadLanguage()
  }, [])

  function apply(newSize: number) {
    setSize(newSize)
    document.documentElement.style.fontSize = newSize + 'px'
    localStorage.setItem(KEY, String(newSize))
  }

  async function updateLanguage(lang: TargetLanguage) {
    setLanguage(lang)
    await supabase.auth.updateUser({ data: { target_language: lang } })
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
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

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Target Language</h2>
        <select
          value={language}
          onChange={e => updateLanguage(e.target.value as TargetLanguage)}
          className="w-full px-3 py-2 rounded border border-gray-700 bg-gray-900 text-gray-100 text-sm focus:outline-none focus:border-gray-500"
        >
          {(Object.entries(TARGET_LANGUAGES) as [TargetLanguage, string][]).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Account</h2>
        <button
          onClick={signOut}
          className="w-full px-4 py-2 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 transition-colors text-sm text-left"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
