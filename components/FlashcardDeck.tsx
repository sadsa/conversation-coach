// components/FlashcardDeck.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, useAnimationControls, useMotionValue, useTransform } from 'framer-motion'
import Link from 'next/link'
import type { PracticeItem } from '@/lib/types'
import { ExplainSheet } from '@/components/ExplainSheet'
import { useTranslation } from '@/components/LanguageProvider'

function renderHighlighted(text: string, colour: 'purple' | 'green', onClick?: () => void): React.ReactNode {
  const parts = text.split(/\[\[|\]\]/)
  if (parts.length < 3) return <>{text}</>
  const cls = colour === 'purple'
    ? 'text-pill-violet bg-violet-500/20 rounded px-1'
    : 'text-correction bg-green-500/20 rounded px-1'
  const interactiveCls = onClick ? ' border-b border-dashed border-correction cursor-pointer' : ''
  return (
    <>
      {parts[0]}
      <span
        className={cls + interactiveCls}
        {...(onClick ? {
          'data-testid': 'flashcard-back-phrase',
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); onClick() },
        } : {})}
      >
        {parts[1]}
      </span>
      {parts.slice(2).join('')}
    </>
  )
}

function formatNextReview(isoString: string): { key: string; vars: Record<string, string> } {
  const reviewDate = new Date(isoString)
  const now = new Date()
  const time = reviewDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const reviewDay = new Date(reviewDate.getFullYear(), reviewDate.getMonth(), reviewDate.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (reviewDay.getTime() === today.getTime()) {
    return { key: 'flashcard.nextReviewAt', vars: { time } }
  }
  if (reviewDay.getTime() === tomorrow.getTime()) {
    return { key: 'flashcard.nextReviewTomorrowAt', vars: { time } }
  }
  const weekday = reviewDate.toLocaleDateString([], { weekday: 'short' })
  const day = String(reviewDate.getDate())
  const month = reviewDate.toLocaleDateString([], { month: 'short' })
  return { key: 'flashcard.nextReviewOnAt', vars: { weekday, day, month, time } }
}

interface Props {
  items: PracticeItem[]
  onDeleted?: (id: string) => void
  onRate?: (id: string, rating: 1 | 3) => void
  nextReviewAt?: string | null
  onCaughtUp?: () => void
}

export function FlashcardDeck({ items, onDeleted, onRate, nextReviewAt, onCaughtUp }: Props) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isExplainOpen, setIsExplainOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const cancelConfirmRef = useRef<HTMLButtonElement>(null)

  const controls = useAnimationControls()
  const x = useMotionValue(0)
  const isDragging = useRef(false)

  const gotItOpacity = useTransform(x, [20, 80], [0, 1])
  const againOpacity = useTransform(x, [-80, -20], [1, 0])

  const item = items[currentIndex]
  const caughtUp = currentIndex >= items.length

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (confirmOpen) {
        if (!isDeleting) setConfirmOpen(false)
        return
      }
      setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [confirmOpen, isDeleting])

  useEffect(() => {
    if (confirmOpen) cancelConfirmRef.current?.focus()
  }, [confirmOpen])

  function rateAndAdvance(rating: 1 | 3) {
    if (item) onRate?.(item.id, rating)
    const nextIndex = currentIndex + 1
    setCurrentIndex(nextIndex)
    setIsFlipped(false)
    setIsExplainOpen(false)
    if (nextIndex >= items.length) onCaughtUp?.()
  }

  function handleCardClick() {
    if (isDragging.current) return
    if (isFlipped) setIsExplainOpen(false)
    setIsFlipped(prev => !prev)
  }

  async function handleDeleteConfirm() {
    if (isDeleting) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/practice-items/${item.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('not ok')
      setConfirmOpen(false)
      onDeleted?.(item.id)
    } catch {
      setDeleteError(t('flashcard.deleteError'))
    } finally {
      setIsDeleting(false)
    }
  }

  if (caughtUp) {
    const nextReview = nextReviewAt ? formatNextReview(nextReviewAt) : null
    return (
      <div data-testid="caught-up-screen" className="flex flex-col items-center justify-center flex-1 px-4 py-6 gap-4">
        <p className="text-2xl font-semibold text-text-primary">{t('flashcard.allCaughtUp')}</p>
        <p className="text-sm text-text-tertiary text-center">{t('flashcard.allCaughtUpBody')}</p>
        {nextReview && (
          <p data-testid="next-review-line" className="text-sm text-text-secondary text-center">
            {t(nextReview.key, nextReview.vars)}
          </p>
        )}
        <Link href="/" className="mt-4 text-sm text-accent underline">{t('flashcard.goHome')}</Link>
      </div>
    )
  }

  const newCount = items.filter(i => i.fsrs_state === null).length
  const dueCount = items.length - newCount
  const remainingNew = Math.max(0, newCount - currentIndex)
  const remainingDue = Math.max(0, dueCount - Math.max(0, currentIndex - newCount))

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-6 select-none">
      {/* Progress counter */}
      <p className="text-xs text-text-tertiary mb-4">
        {t('flashcard.progress', { newCount: remainingNew, dueCount: remainingDue })}
      </p>

      <div className="relative w-full max-w-sm">
        {/* Drag overlays */}
        <motion.div
          data-testid="overlay-got-it"
          style={{ opacity: gotItOpacity }}
          className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center rounded-2xl border-4 border-green-500 bg-green-500/10"
        >
          <span className="text-2xl font-bold text-green-500">{t('flashcard.gotIt')}</span>
        </motion.div>
        <motion.div
          data-testid="overlay-again"
          style={{ opacity: againOpacity }}
          className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center rounded-2xl border-4 border-red-500 bg-red-500/10"
        >
          <span className="text-2xl font-bold text-red-500">{t('flashcard.again')}</span>
        </motion.div>

        <motion.div
          data-testid="flashcard-card"
          drag="x"
          style={{ x, touchAction: 'pan-y' }}
          animate={controls}
          onDragStart={() => {
            isDragging.current = true
            setMenuOpen(false)
          }}
          onDragEnd={(_, info) => {
            if (info.offset.x > 80) {
              controls.start({ x: 400, opacity: 0, transition: { duration: 0.2 } }).then(() => {
                rateAndAdvance(3)
                controls.set({ x: 0, opacity: 1 })
              })
            } else if (info.offset.x < -80) {
              controls.start({ x: -400, opacity: 0, transition: { duration: 0.2 } }).then(() => {
                rateAndAdvance(1)
                controls.set({ x: 0, opacity: 1 })
              })
            } else {
              controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } })
            }
            setTimeout(() => { isDragging.current = false }, 0)
          }}
          onClick={handleCardClick}
          className="relative w-full bg-surface border border-border-subtle rounded-2xl p-6 min-h-[260px] flex flex-col justify-between cursor-pointer"
        >
          <button
            type="button"
            data-testid="card-menu-btn"
            aria-label={t('flashcard.cardOptions')}
            aria-expanded={menuOpen}
            onClick={e => { e.stopPropagation(); setMenuOpen(prev => !prev) }}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-surface-elevated transition-colors z-10"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <div
              data-testid="card-menu-backdrop"
              className="fixed inset-0 z-20"
              aria-hidden="true"
              onClick={() => setMenuOpen(false)}
            />
          )}

          {menuOpen && (
            <div
              data-testid="card-menu-dropdown"
              className="absolute top-12 right-3 z-30 min-w-[148px] bg-surface-elevated border border-border rounded-xl overflow-hidden shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-text-primary hover:bg-border transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {t('flashcard.skipCard')}
              </button>
              <div className="h-px bg-border-subtle mx-2.5" />
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-950/40 transition-colors"
                onClick={() => {
                  setMenuOpen(false)
                  setDeleteError(null)
                  setConfirmOpen(true)
                }}
              >
                {t('flashcard.deleteCard')}
              </button>
            </div>
          )}

          <div
            className={`flex min-h-0 w-full flex-1 flex-col ${menuOpen ? 'pointer-events-none opacity-40' : ''}`}
          >
            {!isFlipped ? (
              <div data-testid="flashcard-front" className="flex min-h-0 flex-1 flex-col justify-between">
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-base text-text-primary leading-relaxed text-center">
                    {renderHighlighted(item.flashcard_front!, 'purple')}
                  </p>
                </div>
                <p className="text-xs text-text-tertiary text-center mt-4">{t('flashcard.tapToReveal')}</p>
              </div>
            ) : (
              <div data-testid="flashcard-back" className="flex min-h-0 flex-1 flex-col justify-between">
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-base text-text-primary leading-relaxed text-center">
                    {renderHighlighted(item.flashcard_back!, 'green', () => setIsExplainOpen(true))}
                  </p>
                </div>
                <p className="text-xs text-text-tertiary text-center mt-4">{t('flashcard.tapToExplain')}</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Bottom sheet */}
      <ExplainSheet
        isOpen={isExplainOpen}
        onClose={() => setIsExplainOpen(false)}
        original={item.original}
        correction={item.correction ?? null}
        note={item.flashcard_note ?? ''}
      />

      {confirmOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => { if (!isDeleting) setConfirmOpen(false) }}
          />
          <div
            data-testid="delete-confirm-sheet"
            className="fixed bottom-0 left-0 right-0 z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <div className="w-full max-w-sm mx-auto bg-surface-elevated border border-border rounded-2xl p-6 shadow-2xl">
              <p id="delete-confirm-title" className="text-base font-medium text-text-primary mb-2">
                {t('flashcard.deleteConfirmTitle')}
              </p>
              <p className="text-sm text-text-secondary leading-relaxed mb-5">
                {t('flashcard.deleteConfirmBody')}
              </p>
              {deleteError && (
                <p className="text-sm text-red-400 mb-3">{deleteError}</p>
              )}
              <div className="flex gap-3">
                <button
                  ref={cancelConfirmRef}
                  type="button"
                  className="flex-1 py-3 rounded-xl text-sm font-medium bg-surface-elevated text-text-secondary hover:bg-border transition-colors disabled:opacity-40"
                  onClick={() => setConfirmOpen(false)}
                  disabled={isDeleting}
                >
                  {t('flashcard.deleteConfirmCancel')}
                </button>
                <button
                  type="button"
                  className="flex-1 py-3 rounded-xl text-sm font-medium bg-red-900 text-red-300 hover:bg-red-800 transition-colors disabled:opacity-40"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  aria-busy={isDeleting}
                >
                  {isDeleting ? '…' : t('flashcard.deleteConfirmDelete')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Spacer to offset progress counter so the card is visually centred */}
      <div className="h-8" aria-hidden="true" />

      {/* Hidden test seam for triggering rate-good in tests */}
      <button
        data-testid="rate-good"
        className="sr-only"
        onClick={e => { e.stopPropagation(); rateAndAdvance(3) }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Hidden test seam for triggering rate-again in tests */}
      <button
        data-testid="rate-again"
        className="sr-only"
        onClick={e => { e.stopPropagation(); rateAndAdvance(1) }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}
