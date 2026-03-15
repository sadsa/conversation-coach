// components/SessionList.tsx
'use client'
import Link from 'next/link'
import { InlineEdit } from '@/components/InlineEdit'
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

interface Props {
  sessions: SessionListItem[]
  onRename: (id: string, title: string) => Promise<void>
}

export function SessionList({ sessions, onRename }: Props) {
  if (sessions.length === 0) {
    return <p className="text-gray-500 text-sm">No sessions yet — upload your first conversation above.</p>
  }

  return (
    <ul className="divide-y divide-gray-800">
      {sessions.map(s => (
        <li key={s.id} className="flex items-center justify-between py-3">
          <InlineEdit
            value={s.title}
            onSave={title => onRename(s.id, title)}
            className="font-medium"
          />
          <Link
            href={s.status === 'ready' ? `/sessions/${s.id}` : `/sessions/${s.id}/status`}
            className="ml-4 shrink-0"
          >
            <span className="flex items-center gap-4 text-sm text-gray-400">
              <span className={STATUS_COLOUR[s.status] ?? 'text-gray-400'}>
                {STATUS_LABEL[s.status] ?? s.status}
              </span>
              <span>{new Date(s.created_at).toLocaleDateString()}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
