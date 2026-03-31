// app/sessions/[id]/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TranscriptView } from '@/components/TranscriptView'
import { InlineEdit } from '@/components/InlineEdit'
import { useTranslation } from '@/components/LanguageProvider'
import type { SessionDetail } from '@/lib/types'

export default function TranscriptPage({ params }: { params: { id: string } }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [title, setTitle] = useState('')
  const [addedAnnotations, setAddedAnnotations] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    fetch(`/api/sessions/${params.id}`)
      .then(r => r.json())
      .then((d: SessionDetail) => {
        setDetail(d)
        setTitle(d.session.title)
        setAddedAnnotations(new Map(Object.entries(d.addedAnnotations)))
      })
  }, [params.id])

  async function handleRename(newTitle: string) {
    await fetch(`/api/sessions/${params.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    })
    setTitle(newTitle)
  }

  function handleAnnotationAdded(annotationId: string, practiceItemId: string) {
    setAddedAnnotations(prev => { const next = new Map(prev); next.set(annotationId, practiceItemId); return next })
  }

  function handleAnnotationRemoved(annotationId: string) {
    setAddedAnnotations(prev => { const next = new Map(prev); next.delete(annotationId); return next })
  }

  async function handleReanalyse() {
    const res = await fetch(`/api/sessions/${params.id}/analyse`, { method: 'POST' })
    if (res.ok) router.push(`/sessions/${params.id}/status`)
  }

  if (!detail) return <p className="text-gray-400">{t('transcript.loading')}</p>

  const { session, segments, annotations } = detail
  const counts = { grammar: 0, naturalness: 0 }
  annotations.forEach(a => counts[a.type as keyof typeof counts]++)

  const durationLabel = session.duration_seconds
    ? `${Math.floor(session.duration_seconds / 60)} ${t('transcript.min')}`
    : ''

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <InlineEdit value={title} onSave={handleRename} className="text-xl font-bold break-words" />
          <p className="text-sm text-gray-400 mt-1">
            {durationLabel} · {counts.grammar} {t('transcript.grammar')} · {counts.naturalness}{' '}
            {t('transcript.naturalness')}
          </p>
        </div>
        <button
          onClick={handleReanalyse}
          className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-3 py-1 shrink-0"
        >
          {t('transcript.reanalyse')}
        </button>
      </div>

      <TranscriptView
        segments={segments}
        annotations={annotations}
        userSpeakerLabels={session.user_speaker_labels ?? null}
        sessionId={params.id}
        addedAnnotations={addedAnnotations}
        onAnnotationAdded={handleAnnotationAdded}
        onAnnotationRemoved={handleAnnotationRemoved}
      />
    </div>
  )
}
