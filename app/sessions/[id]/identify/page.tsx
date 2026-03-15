// app/sessions/[id]/identify/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SpeakerCard } from '@/components/SpeakerCard'
import type { SessionDetail } from '@/lib/types'

export default function IdentifyPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`/api/sessions/${params.id}`)
      .then(r => r.json())
      .then(setDetail)
  }, [params.id])

  async function handleSelect(label: 'A' | 'B') {
    setSubmitting(true)
    const res = await fetch(`/api/sessions/${params.id}/speaker`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ speaker_label: label }),
    })
    if (res.status === 409) {
      // Session status changed — redirect to status page for re-evaluation
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
        <h1 className="text-xl font-semibold">Who are you?</h1>
        <p className="text-sm text-gray-400 mt-1">
          Two speakers detected. Pick the one that sounds like you.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {speakers.map(label => (
          <SpeakerCard
            key={label}
            label={label}
            samples={speakerSamples[label]}
            onSelect={handleSelect}
            disabled={submitting}
          />
        ))}
      </div>
    </div>
  )
}
