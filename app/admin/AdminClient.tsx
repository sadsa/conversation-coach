'use client'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { Toast } from '@/components/Toast'
import type { AllowedUserRow } from '@/lib/loaders'

const UNDO_MS = 5000

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
      <Image
        src={avatar_url}
        alt={name ?? email}
        width={40}
        height={40}
        className="rounded-full object-cover bg-surface-raised flex-shrink-0"
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
  return (
    <span className="text-xs px-2 py-0.5 rounded-full border border-border text-text-tertiary bg-surface">
      {label}
    </span>
  )
}

interface UserCardProps {
  user: AllowedUserRow
  onApprove?: (email: string) => Promise<void>
  onDeny?: (email: string) => void
}

function UserCard({ user, onApprove, onDeny }: UserCardProps) {
  const { t } = useTranslation()
  const [approving, setApproving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const hasBothActions = !!(onApprove && onDeny)

  async function handleApprove() {
    if (!onApprove) return
    setApproving(true)
    setLocalError(null)
    try {
      await onApprove(user.email)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed')
      setApproving(false)
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
          {(user.geo_city || user.geo_country) && (
            <p className="text-xs text-text-tertiary mt-0.5">
              {[user.geo_city, user.geo_country].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      </div>
      {localError && (
        <p className="text-xs text-on-error-surface bg-error-surface px-3 py-1.5 rounded-lg">
          {localError}
        </p>
      )}
      {(onApprove || onDeny) && (
        <div className="flex items-center gap-2">
          {onApprove && (
            <Button
              type="button"
              size="sm"
              disabled={approving}
              className={hasBothActions ? 'flex-1' : 'w-full'}
              onClick={handleApprove}
            >
              {approving
                ? <Icon name="spinner" className="w-4 h-4 mx-auto" />
                : t('admin.approve')}
            </Button>
          )}
          {onDeny && hasBothActions && (
            <button
              type="button"
              disabled={approving}
              onClick={() => onDeny(user.email)}
              className="text-sm text-text-tertiary hover:text-text-secondary px-2 py-1 rounded transition-colors disabled:opacity-40"
            >
              {t('admin.deny')}
            </button>
          )}
          {onDeny && !hasBothActions && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => onDeny(user.email)}
            >
              {t('admin.deny')}
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
        <Icon
          name="caret-down"
          className={`w-3.5 h-3.5 text-text-tertiary ml-auto motion-safe:transition-transform motion-safe:duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 pt-0.5">
            {count === 0 && emptyLabel
              ? <p className="text-sm text-text-tertiary px-1">{emptyLabel}</p>
              : children}
          </div>
        </div>
      </div>
    </div>
  )
}

interface AdminClientProps {
  users: AllowedUserRow[]
}

export default function AdminClient({ users: initialUsers }: AdminClientProps) {
  const { t } = useTranslation()
  const [users, setUsers] = useState(initialUsers)
  const [toast, setToast] = useState<{ key: number; message: string; onUndo?: () => void } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(message: string, onUndo?: () => void) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ key: Date.now(), message, onUndo })
    toastTimerRef.current = setTimeout(() => setToast(null), UNDO_MS)
  }

  const pending = users.filter(u => u.status === 'pending')
  const approved = users.filter(u => u.status === 'approved')
  const denied = users.filter(u => u.status === 'denied')

  async function handleApprove(email: string) {
    const prevStatus = users.find(u => u.email === email)?.status ?? 'pending'
    setUsers(us => us.map(u => u.email === email ? { ...u, status: 'approved' } : u))
    const res = await fetch(`/api/admin/access/${encodeURIComponent(email)}/approve`, { method: 'POST' })
    if (!res.ok) {
      setUsers(us => us.map(u => u.email === email ? { ...u, status: prevStatus } : u))
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? 'approve failed')
    }
  }

  function handleDeny(email: string) {
    const prevStatus = users.find(u => u.email === email)?.status ?? 'pending'
    setUsers(us => us.map(u => u.email === email ? { ...u, status: 'denied' } : u))

    let cancelled = false
    let denyTimer: ReturnType<typeof setTimeout> | null = null

    function restore() {
      setUsers(us => us.map(u => u.email === email ? { ...u, status: prevStatus } : u))
    }

    showToast(t('admin.denyToast'), () => {
      cancelled = true
      if (denyTimer) clearTimeout(denyTimer)
      restore()
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      setToast(null)
    })

    denyTimer = setTimeout(async () => {
      if (cancelled) return
      const res = await fetch(`/api/admin/access/${encodeURIComponent(email)}/deny`, { method: 'POST' })
      if (!res.ok) {
        restore()
        showToast('Failed to deny access')
      }
    }, UNDO_MS)
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 pt-6 pb-4 space-y-1">
        <p className="text-xs font-semibold tracking-widest uppercase text-accent-primary">
          {t('admin.eyebrow')}
        </p>
        <h1 className="text-page-title">
          {t('admin.title')}
        </h1>
      </div>

      <div className="flex-1 px-4 pb-8 space-y-6">
        {/* Pending — always expanded, this is the action surface */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-eyebrow text-text-secondary">{t('admin.pending')}</h2>
            {pending.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full border bg-[--annotation-unreviewed-bg] text-[--annotation-unreviewed-text] border-[--annotation-unreviewed-border]">
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
                  onApprove={handleApprove}
                  onDeny={handleDeny}
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
            <UserCard key={u.email} user={u} onDeny={handleDeny} />
          ))}
        </CollapsibleGroup>

        {/* Denied */}
        <CollapsibleGroup
          label={t('admin.denied')}
          count={denied.length}
          emptyLabel={t('admin.emptyDenied')}
        >
          {denied.map(u => (
            <UserCard key={u.email} user={u} onApprove={handleApprove} />
          ))}
        </CollapsibleGroup>
      </div>

      {toast && (
        <Toast
          toastKey={toast.key}
          message={toast.message}
          action={toast.onUndo ? { label: t('writeList.undo'), onClick: toast.onUndo } : undefined}
        />
      )}
    </div>
  )
}
