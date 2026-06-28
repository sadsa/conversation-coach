// components/WildCaptureSheet.tsx
//
// A DockedSheet form that lets users add a phrase they heard outside the app
// to their Vocabulary. Two fields: the phrase itself and the context in which
// it was used. On submit the row is created immediately; background enrichment
// populates flashcard fields separately.

'use client'
import { useRef, useState, useEffect } from 'react'
import { useTranslation } from '@/components/LanguageProvider'
import { DockedSheet } from '@/components/DockedSheet'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Called with the new item id and phrase after the row is created. */
  onCapture: (id: string, phrase: string) => void
}

export function WildCaptureSheet({ isOpen, onClose, onCapture }: Props) {
  const { t } = useTranslation()
  const [phrase, setPhrase] = useState('')
  const [context, setContext] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const phraseRef = useRef<HTMLTextAreaElement>(null)

  // Reset form when sheet opens
  useEffect(() => {
    if (isOpen) {
      setPhrase('')
      setContext('')
      setError(null)
      setSubmitting(false)
    }
  }, [isOpen])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedPhrase = phrase.trim()
    if (!trimmedPhrase) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/practice-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phrase: trimmedPhrase, context: context.trim(), source: 'manual' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Failed to save')
      }
      const data = await res.json() as { id: string }
      onCapture(data.id, trimmedPhrase)
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  const canSubmit = phrase.trim().length > 0 && !submitting

  const footer = (
    <div className="px-5 py-4 flex flex-col gap-2">
      {error && (
        <p className="text-sm text-error-text text-center">{error}</p>
      )}
      <Button
        type="submit"
        form="wild-capture-form"
        variant="primary"
        size="md"
        fullWidth
        disabled={!canSubmit}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Icon name="spinner" className="w-4 h-4" />
            {t('vocabulary.captureSubmit')}
          </span>
        ) : (
          t('vocabulary.captureSubmit')
        )}
      </Button>
    </div>
  )

  return (
    <DockedSheet
      isOpen={isOpen}
      ariaLabel={t('vocabulary.captureSheet')}
      onClose={onClose}
      mobileMaxHeight="85vh"
      headerLead={
        <span className="text-sm font-medium text-text-secondary">
          {t('vocabulary.captureSheet')}
        </span>
      }
      footer={footer}
    >
      <form
        id="wild-capture-form"
        onSubmit={handleSubmit}
        className="px-5 py-4 flex flex-col gap-6"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="wc-phrase"
            className="text-sm font-medium text-text-secondary"
          >
            {t('vocabulary.phraseLabel')}
          </label>
          <textarea
            id="wc-phrase"
            ref={phraseRef}
            data-initial-focus
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
            placeholder={t('vocabulary.phrasePlaceholder')}
            rows={2}
            disabled={submitting}
            required
            className="resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-base leading-snug placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary disabled:opacity-50 transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="wc-context"
            className="text-sm font-medium text-text-secondary"
          >
            {t('vocabulary.contextLabel')}
          </label>
          <textarea
            id="wc-context"
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder={t('vocabulary.contextPlaceholder')}
            rows={3}
            disabled={submitting}
            className="resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-base leading-snug placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary disabled:opacity-50 transition-colors"
          />
        </div>
      </form>
    </DockedSheet>
  )
}
