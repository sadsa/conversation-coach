// app/sessions/[id]/status/page.tsx
import { createServerClient } from '@/lib/supabase-server'
import { PipelineStatus } from '@/components/PipelineStatus'
import { notFound, redirect } from 'next/navigation'

export default async function StatusPage({ params }: { params: { id: string } }) {
  const db = createServerClient()
  const { data: session } = await db
    .from('sessions')
    .select('id, title, status, error_stage, duration_seconds, created_at')
    .eq('id', params.id)
    .single()

  if (!session) notFound()
  if (session.status === 'ready') redirect(`/sessions/${params.id}`)
  if (session.status === 'identifying') redirect(`/sessions/${params.id}/identify`)

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary">
          {session.title}
        </h1>
      </header>
      <PipelineStatus
        sessionId={params.id}
        initialStatus={session.status}
        initialErrorStage={session.error_stage}
        durationSeconds={session.duration_seconds}
        createdAt={session.created_at}
      />
    </div>
  )
}
