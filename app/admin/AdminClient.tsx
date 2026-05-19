'use client'
import { useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Button } from '@/components/Button'
import type { AllowedUserRow } from '@/lib/loaders'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function Avatar({ name, avatar_url, email }: { name: string | null; avatar_url: string | null; email: string }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : email[0].toUpperCase()
  if (avatar_url) {
    return (
      <img
        src={avatar_url}
        alt={name ?? email}
        className="w-10 h-10 rounded-full object-cover bg-surface-raised flex-shrink-0"
      />
    )
  }
  return (
    <div className="w-10 h-10 rounded-full bg-accent-primary/10 flex items-center justify-center flex-shrink-0">
      <span className="text-sm font-semibold text-accent-primary">{initials}</span>
    </div>
  )
}

function ProviderPill({ source }: { source: string | null }) {
  const { t } = useTranslation()
  const label = source === 'google' ? t('admin.viaGoogle') : t('admin.viaEmail')
  const isGoogle = source === 'google'
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${isGoogle ? 'border-blue-200 text-blue-600 bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-950/30' : 'border-border text-text-tertiary bg-surface'}`}>
      {label}
    </span>
  )
}

interface UserCardProps {
  user: AllowedUserRow
  onApprove?: (email: string) => Promise<void>
  onDeny?: (email: string) => Promise<void>
}

function UserCard({ user, onApprove, onDeny }: UserCardProps) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState<'approve' | 'deny' | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  async function handle(action: 'approve' | 'deny') {
    setLoading(action)
    setLocalError(null)
    try {
      if (action === 'approve') await onApprove?.(user.email)
      else await onDeny?.(user.email)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed')
      setLoading(null)
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Avatar name={user.name} avatar_url={user.avatar_url} email={user.email} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-primary text-sm truncate">
            {user.name ?? <span className="text-text-tertiary italic">{t('admin.nameUnknown')}</span>}
          </p>
          <p className="text-xs text-text-secondary truncate">{user.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-text-tertiary">
              {t('admin.requestedAgo', { ago: timeAgo(user.requested_at) })}
            </span>
            <ProviderPill source={user.source} />
          </div>
        </div>
      </div>
      {localError && (
        <p className="text-xs text-on-error-surface bg-error-surface px-3 py-1.5 rounded-lg">
          {localError}
        </p>
      )}
      {(onApprove || onDeny) && (
        <div className="flex gap-2">
          {onApprove && (
            <Button
              type="button"
              size="sm"
              fullWidth
              disabled={loading !== null}
              onClick={() => handle('approve')}
            >
              {loading === 'approve' ? '…' : t('admin.approve')}
            </Button>
          )}
          {onDeny && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              fullWidth
              disabled={loading !== null}
              onClick={() => handle('deny')}
            >
              {loading === 'deny' ? '…' : t('admin.deny')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

interface CollapsibleGroupProps {
  label: string
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
  emptyLabel?: string
}

function CollapsibleGroup({ label, count, children, defaultOpen = false, emptyLabel }: CollapsibleGroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className="text-sm font-semibold text-text-primary">{label}</span>
        <span className="text-xs text-text-tertiary bg-surface-raised px-2 py-0.5 rounded-full border border-border-subtle">
          {count}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 256 256"
          fill="currentColor" stroke="none"
          className={`text-text-tertiary ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/>
        </svg>
      </button>
      {open && (
        <div className="space-y-2">
          {count === 0 && emptyLabel ? (
            <p className="text-sm text-text-tertiary px-1">{emptyLabel}</p>
          ) : children}
        </div>
      )}
    </div>
  )
}

interface AdminClientProps {
  users: AllowedUserRow[]
  ownerEmail: string
}

export default function AdminClient({ users: initialUsers, ownerEmail: _ownerEmail }: AdminClientProps) {
  const { t } = useTranslation()
  const [users, setUsers] = useState(initialUsers)

  const pending = users.filter(u => u.status === 'pending')
  const approved = users.filter(u => u.status === 'approved')
  const denied = users.filter(u => u.status === 'denied')

  async function callAction(email: string, action: 'approve' | 'deny') {
    const encoded = encodeURIComponent(email)
    const res = await fetch(`/api/admin/access/${encoded}/${action}`, { method: 'POST' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `${action} failed`)
    }
    setUsers(prev => prev.map(u =>
      u.email === email
        ? { ...u, status: action === 'approve' ? 'approved' : 'denied' }
        : u
    ))
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 pt-6 pb-4 space-y-1">
        <p className="text-xs font-semibold tracking-widest uppercase text-accent-primary">
          {t('admin.eyebrow')}
        </p>
        <h1 className="font-display text-2xl font-medium text-text-primary">
          {t('admin.title')}
        </h1>
      </div>

      <div className="flex-1 px-4 pb-8 space-y-6">
        {/* Pending */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text-primary">{t('admin.pending')}</h2>
            {pending.length > 0 && (
              <span className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                {t('admin.waiting', { n: String(pending.length) })}
              </span>
            )}
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-text-tertiary px-1">—</p>
          ) : (
            <div className="space-y-2">
              {pending.map(u => (
                <UserCard
                  key={u.email}
                  user={u}
                  onApprove={email => callAction(email, 'approve')}
                  onDeny={email => callAction(email, 'deny')}
                />
              ))}
            </div>
          )}
        </div>

        {/* Approved */}
        <CollapsibleGroup
          label={t('admin.approved')}
          count={approved.length}
          emptyLabel="—"
        >
          {approved.map(u => (
            <UserCard key={u.email} user={u} onDeny={email => callAction(email, 'deny')} />
          ))}
        </CollapsibleGroup>

        {/* Denied */}
        <CollapsibleGroup
          label={t('admin.denied')}
          count={denied.length}
          emptyLabel={t('admin.emptyDenied')}
        >
          {denied.map(u => (
            <UserCard key={u.email} user={u} onApprove={email => callAction(email, 'approve')} />
          ))}
        </CollapsibleGroup>
      </div>
    </div>
  )
}
