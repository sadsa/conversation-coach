// components/StatusPageMenu.tsx
//
// Direct delete button for the in-flight Status page header. Originally this
// hid behind a one-item overflow menu (•••), but a single destructive action
// doesn't earn a menu — it earns a visible button. Confirmation is still
// gated by a modal, so accidental taps stay recoverable.
//
// Filename kept (StatusPageMenu) for git churn reasons; the export remains
// the same so the calling page didn't have to change. If we add more
// session-level actions later, this is the place to grow them back into a
// menu.
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/Modal'
import { Toast } from '@/components/Toast'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/IconButton'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  sessionId: string
  /** Session title — shown inside the confirm modal so the user knows what
   *  they're deleting. */
  title: string
}

export function StatusPageMenu({ sessionId, title }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!toastMessage) return
    const timer = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(timer)
  }, [toastMessage])

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
    if (res.ok) {
      // router.replace so the user can't hit Back and land on a 404.
      setConfirmOpen(false)
      router.replace('/')
    } else {
      setDeleting(false)
      setConfirmOpen(false)
      setToastMessage(t('pipeline.deleteError'))
    }
  }

  return (
    <>
      <IconButton
        icon="trash"
        size="lg"
        onClick={() => setConfirmOpen(true)}
        aria-label={t('pipeline.deleteSession')}
        title={t('pipeline.deleteSession')}
        className="text-text-tertiary hover:text-status-error"
      />

      <Modal
        isOpen={confirmOpen}
        title={
          <div className="flex items-center gap-2 text-status-error">
            <Icon name="alert" className="w-5 h-5" />
            <span>{t('pipeline.deleteTitle')}</span>
          </div>
        }
        onClose={() => { if (!deleting) setConfirmOpen(false) }}
      >
        <div className="space-y-5">
          <p className="text-text-secondary leading-relaxed">
            <strong className="text-text-primary">{title}</strong>
            {' — '}
            {t('pipeline.deleteBody')}
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
              className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg disabled:opacity-50 transition-colors"
            >
              {t('pipeline.deleteCancel')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-lg bg-status-error text-white hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
            >
              {deleting && <Icon name="spinner" className="w-4 h-4" />}
              {t('pipeline.deleteConfirm')}
            </button>
          </div>
        </div>
      </Modal>

      {toastMessage && <Toast message={toastMessage} />}
    </>
  )
}
