// app/sessions/[id]/identify/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SpeakerCard } from '@/components/SpeakerCard'
import type { SessionDetail } from '@/lib/types'

export default function IdentifyPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [selectedLabels, setSelectedLabels] = useState<Set<'A' | 'B'>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/sessions/${params.id}`)
      .then(r => r.json())
      .then(setDetail)
  }, [params.id])

  function handleToggle(label: 'A' | 'B') {
    setSelectedLabels(prev => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  async function handleConfirm() {
    setSubmitting(true)
    const res = await fetch(`/api/sessions/${params.id}/speaker`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ speaker_labels: [...selectedLabels] }),
    })
    if (res.status === 409) {
      router.push(`/sessions/${params.id}/status`)
      return
    }
    router.push(`/sessions/${params.id}/status`)
  }

  if (!detail) return <p className="text-gray-400">Loading…</p>

  const speakerSamples = (['A', 'B'] as const).reduce((acc, label) => {
    acc[label] = detail.segments
      .filter(s => s.speaker === label && s.text.trim())
      .slice(0, 3)
      .map(s => s.text)
    return acc
  }, {} as Record<'A' | 'B', string[]>)

  const speakers = (['A', 'B'] as const).filter(l => speakerSamples[l].length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Select all speakers that are you</h1>
        <p className="text-sm text-gray-400 mt-1">
          Tap a speaker to select it. You can select both if they&apos;re all you.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {speakers.map(label => (
          <SpeakerCard
            key={label}
            label={label}
            samples={speakerSamples[label]}
            onToggle={handleToggle}
            selected={selectedLabels.has(label)}
            disabled={submitting}
          />
        ))}
      </div>
      <div className="flex justify-end">
        <button
          onClick={handleConfirm}
          disabled={selectedLabels.size === 0 || submitting}
          className="px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          Confirm →
        </button>
      </div>
    </div>
  )
}
