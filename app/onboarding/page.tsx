'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import type { TargetLanguage } from '@/lib/types'

const LANGUAGE_OPTIONS: { value: TargetLanguage; name: string; variant: string; flag: string }[] = [
  { value: 'es-AR', name: 'Spanish', variant: 'Rioplatense · Argentine', flag: '🇦🇷' },
  { value: 'en-NZ', name: 'English', variant: 'New Zealand English', flag: '🇳🇿' },
]

export default function OnboardingPage() {
  const [selected, setSelected] = useState<TargetLanguage | null>(null)
  const router = useRouter()
  const { setTargetLanguage } = useTranslation()

  async function handleConfirm() {
    if (!selected) return
    setTargetLanguage(selected)
    router.push('/')
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-7rem)] px-6">
      <div className="w-full max-w-sm space-y-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary text-center">
          Conversation Coach
        </p>

        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            What are you learning?
          </h1>
          <p className="text-sm text-text-secondary">
            Pick the language you want to practise. You can change this later in Settings.
          </p>
        </div>

        <div className="space-y-3" role="radiogroup" aria-label="Target language">
          {LANGUAGE_OPTIONS.map(opt => {
            const isSelected = selected === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(opt.value)}
                className={`w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-colors ${
                  isSelected
                    ? 'border-accent-primary bg-accent-chip'
                    : 'border-border bg-surface hover:border-accent-primary/40 hover:bg-surface-elevated'
                }`}
              >
                <span className="text-4xl leading-none flex-shrink-0">{opt.flag}</span>
                <div className="flex-1">
                  <p className="font-semibold text-text-primary">{opt.name}</p>
                  <p className="text-sm text-text-tertiary mt-0.5">{opt.variant}</p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-accent-primary border-accent-primary'
                      : 'border-border'
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={selected === null}
          className="w-full py-3 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Get started →
        </button>
      </div>
    </div>
  )
}
