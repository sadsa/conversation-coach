// components/FlashcardDeck.tsx
'use client'
import { useState, useRef } from 'react'
import { motion, useAnimationControls, useMotionValue } from 'framer-motion'
import type { PracticeItem } from '@/lib/types'

function renderHighlighted(text: string, colour: 'purple' | 'green'): React.ReactNode {
  const parts = text.split(/\[\[|\]\]/)
  if (parts.length < 3) return <>{text}</>
  const cls = colour === 'purple'
    ? 'text-violet-300 bg-violet-500/20 rounded px-1'
    : 'text-green-300 bg-green-500/20 rounded px-1'
  return (
    <>
      {parts[0]}
      <span className={cls}>{parts[1]}</span>
      {parts.slice(2).join('')}
    </>
  )
}

interface Props {
  items: PracticeItem[]
}

export function FlashcardDeck({ items }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isExplainOpen, setIsExplainOpen] = useState(false)
  const item = items[currentIndex]

  const controls = useAnimationControls()
  const x = useMotionValue(0)
  const isDragging = useRef(false)

  function advance() {
    setCurrentIndex(prev => (prev + 1) % items.length)
    setIsFlipped(false)
    setIsExplainOpen(false)
  }

  function handleCardClick() {
    if (isDragging.current) return
    if (isFlipped) setIsExplainOpen(false)
    setIsFlipped(prev => !prev)
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-6 select-none">
      {/* Progress counter */}
      <p className="text-xs text-gray-500 mb-4">Card {currentIndex + 1} of {items.length}</p>

      <motion.div
        data-testid="flashcard-card"
        drag="x"
        style={{ x, touchAction: 'pan-y' }}
        animate={controls}
        onDragStart={() => { isDragging.current = true }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -80) {
            controls.start({ x: -400, opacity: 0, transition: { duration: 0.2 } }).then(() => {
              advance()
              controls.set({ x: 0, opacity: 1 })
            })
          } else {
            controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } })
          }
          setTimeout(() => { isDragging.current = false }, 0)
        }}
        onClick={handleCardClick}
        className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 min-h-[260px] flex flex-col justify-between cursor-pointer"
      >
        {!isFlipped ? (
          <div data-testid="flashcard-front" className="flex flex-col flex-1 justify-between">
            <div className="flex-1 flex items-center justify-center">
              <p className="text-base text-gray-100 leading-relaxed text-center">
                {renderHighlighted(item.flashcard_front!, 'purple')}
              </p>
            </div>
            <p className="text-xs text-gray-600 text-center mt-4">Tap to reveal Spanish</p>
          </div>
        ) : (
          <div data-testid="flashcard-back" className="flex flex-col flex-1 justify-between gap-4">
            <div className="flex-1 flex items-center justify-center">
              <p className="text-base text-gray-100 leading-relaxed text-center">
                {renderHighlighted(item.flashcard_back!, 'green')}
              </p>
            </div>
            {item.flashcard_note !== null && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); setIsExplainOpen(prev => !prev) }}
                  className="w-full py-2 text-sm text-indigo-400 bg-indigo-950/50 border border-indigo-900 rounded-lg"
                >
                  Explain this →
                </button>
                {isExplainOpen && (
                  <div data-testid="explain-panel" className="bg-indigo-950 border border-indigo-900 rounded-xl px-3 py-3">
                    <p className="text-base">
                      <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
                        {item.original}
                      </span>
                      {' → '}
                      {item.correction !== null
                        ? <span className="font-semibold text-lg text-[#86efac]">{item.correction}</span>
                        : <span className="text-gray-500">—</span>
                      }
                    </p>
                    <hr className="border-indigo-900/40 my-2" />
                    <p className="text-sm text-gray-400 leading-relaxed">{item.flashcard_note}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </motion.div>

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
    </div>
  )
}
