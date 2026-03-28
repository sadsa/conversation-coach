// components/SessionList.tsx
import Link from 'next/link'
import type { SessionListItem } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  uploading: 'Uploading…',
  transcribing: 'Transcribing…',
  identifying: 'Awaiting speaker ID',
  analysing: 'Analysing…',
  ready: 'Ready',
  error: 'Error',
}

const STATUS_COLOUR: Record<string, string> = {
  ready: 'text-green-400',
  error: 'text-red-400',
}

const TERMINAL_STATUSES = new Set(['ready', 'error'])

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

interface Props {
  sessions: SessionListItem[]
}

export function SessionList({ sessions }: Props) {
  if (sessions.length === 0) {
    return <p className="text-gray-500 text-sm">No sessions yet — upload your first conversation above.</p>
  }

  return (
    <ul className="divide-y divide-gray-800">
      {sessions.map(s => {
        const isProcessing = !TERMINAL_STATUSES.has(s.status)
        const processingSeconds =
          s.status === 'ready' && s.processing_completed_at
            ? Math.round(
                (new Date(s.processing_completed_at).getTime() - new Date(s.created_at).getTime()) / 1000
              )
            : null

        return (
          <li key={s.id}>
            <Link
              href={s.status === 'ready' ? `/sessions/${s.id}` : `/sessions/${s.id}/status`}
              className={`flex items-center gap-3 py-3 min-w-0 ${isProcessing ? 'border-l-2 border-indigo-600 pl-3 -ml-3 bg-[#0d0f1e]' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-gray-100">{s.title}</p>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5 flex-wrap">
                  <span className={`flex items-center gap-1 ${STATUS_COLOUR[s.status] ?? 'text-gray-400'}`}>
                    {isProcessing && (
                      <svg
                        className="w-3 h-3 animate-spin text-indigo-400"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    )}
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                  <span>·</span>
                  <span>{new Date(s.created_at).toLocaleDateString()}</span>
                  {s.duration_seconds != null && (
                    <>
                      <span>·</span>
                      <span>{formatDuration(s.duration_seconds)}</span>
                    </>
                  )}
                  {processingSeconds != null && (
                    <>
                      <span>·</span>
                      <span className="text-indigo-400">⚡ {formatDuration(processingSeconds)}</span>
                    </>
                  )}
                </div>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                className="w-4 h-4 text-gray-600 flex-shrink-0" aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
