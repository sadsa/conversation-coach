// components/FlashcardDeck.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, useAnimationControls, useMotionValue } from 'framer-motion'
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

interface Props {
  items: PracticeItem[]
  onDeleted?: (id: string) => void
}

export function FlashcardDeck({ items, onDeleted }: Props) {
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

  // When `items` shrinks (e.g. parent deletes), `currentIndex` may be stale until the next navigation — clamp for display
  const cardIndex = items.length > 0 ? Math.min(currentIndex, items.length - 1) : 0
  const item = items[cardIndex]

  useEffect(() => {
    if (items.length > 0 && currentIndex >= items.length) {
      setCurrentIndex(items.length - 1)
    }
  }, [items.length, currentIndex])

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

  function advance() {
    setCurrentIndex(prev => (prev + 1) % items.length)
    setIsFlipped(false)
    setIsExplainOpen(false)
  }

  function goBack() {
    setCurrentIndex(prev => (prev - 1 + items.length) % items.length)
    setIsFlipped(false)
    setIsExplainOpen(false)
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

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-6 select-none">
      {/* Progress counter */}
      <p className="text-xs text-text-tertiary mb-4">
        {t('flashcard.counter', { n: cardIndex + 1, m: items.length })}
      </p>

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
          if (info.offset.x < -80) {
            controls.start({ x: -400, opacity: 0, transition: { duration: 0.2 } }).then(() => {
              advance()
              controls.set({ x: 0, opacity: 1 })
            })
          } else if (info.offset.x > 80) {
            controls.start({ x: 400, opacity: 0, transition: { duration: 0.2 } }).then(() => {
              goBack()
              controls.set({ x: 0, opacity: 1 })
            })
          } else {
            controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } })
          }
          setTimeout(() => { isDragging.current = false }, 0)
        }}
        onClick={handleCardClick}
        className="relative w-full max-w-sm bg-surface border border-border-subtle rounded-2xl p-6 min-h-[260px] flex flex-col justify-between cursor-pointer"
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

      {/* Hidden test seam for triggering advance in tests */}
      <button
        data-testid="advance-card"
        className="sr-only"
        onClick={e => { e.stopPropagation(); advance() }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Hidden test seam for triggering go-back in tests */}
      <button
        data-testid="go-back-card"
        className="sr-only"
        onClick={e => { e.stopPropagation(); goBack() }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}
