'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'
import type { TargetLanguage } from '@/lib/types'

const LANGUAGE_OPTIONS: { value: TargetLanguage; name: string; variant: string; flag: string }[] = [
  { value: 'es-AR', name: 'Spanish', variant: 'Rioplatense · Argentine', flag: '🇦🇷' },
  { value: 'en-NZ', name: 'English', variant: 'New Zealand English', flag: '🇳🇿' },
]

export default function OnboardingPage() {
  const [selected, setSelected] = useState<TargetLanguage | null>(null)
  const router = useRouter()

  async function handleConfirm() {
    if (!selected) return
    await getSupabaseBrowserClient().auth.updateUser({ data: { target_language: selected } })
    router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-6">
      <div className="w-full max-w-sm space-y-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 text-center">
          Conversation Coach
        </p>

        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">What are you learning?</h1>
          <p className="text-sm text-gray-400">
            Choose the language you want to practise. You can change this later in Settings.
          </p>
        </div>

        <div className="space-y-3">
          {LANGUAGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={`w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-colors ${
                selected === opt.value
                  ? 'border-indigo-500 bg-indigo-950/30'
                  : 'border-gray-800 bg-gray-900 hover:border-gray-600'
              }`}
            >
              <span className="text-4xl leading-none flex-shrink-0">{opt.flag}</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-100">{opt.name}</p>
                <p className="text-sm text-gray-500 mt-0.5">{opt.variant}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                selected === opt.value ? 'bg-indigo-500 border-indigo-500' : 'border-gray-600'
              }`}>
                {selected === opt.value && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={selected === null}
          className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Get started →
        </button>
      </div>
    </div>
  )
}
