// components/FlashcardDeck.tsx
'use client'
import { useState, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
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
  const [isNoteExpanded, setIsNoteExpanded] = useState(false)
  const isSwiping = useRef(false)

  const item = items[currentIndex]

  function advance() {
    setCurrentIndex(prev => (prev + 1) % items.length)
    setIsFlipped(false)
    setIsNoteExpanded(false)
  }

  const handlers = useSwipeable({
    delta: 30,
    trackMouse: false,
    onSwiping: () => { isSwiping.current = true },
    onSwipedLeft: (e) => {
      if (e.absX > 80) advance()
      setTimeout(() => { isSwiping.current = false }, 0)
    },
    onSwiped: () => { setTimeout(() => { isSwiping.current = false }, 0) },
  })

  function handleCardClick() {
    if (isSwiping.current) return
    if (isFlipped) setIsNoteExpanded(false)
    setIsFlipped(prev => !prev)
  }

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-6 select-none">
      {/* Progress counter */}
      <p className="text-xs text-gray-500 mb-4">Card {currentIndex + 1} of {items.length}</p>

      <div
        {...handlers}
        data-testid="flashcard-card"
        onClick={handleCardClick}
        style={{ touchAction: 'pan-y' }}
        className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 min-h-[260px] flex flex-col justify-between cursor-pointer"
      >
        {!isFlipped ? (
          <div data-testid="flashcard-front" className="flex flex-col flex-1 justify-between">
            <p className="text-base text-gray-100 leading-relaxed text-center flex-1 flex items-center justify-center">
              {renderHighlighted(item.flashcard_front!, 'purple')}
            </p>
            <p className="text-xs text-gray-600 text-center mt-4">Tap to reveal Spanish</p>
          </div>
        ) : (
          <div data-testid="flashcard-back" className="flex flex-col flex-1 justify-between gap-4">
            <p className="text-base text-gray-100 leading-relaxed text-center flex-1 flex items-center justify-center">
              {renderHighlighted(item.flashcard_back!, 'green')}
            </p>
            {item.flashcard_note !== null && (
              <div className="bg-indigo-950 border border-indigo-900 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
                    <span className="text-red-400 line-through truncate">{item.original}</span>
                    {item.correction !== null ? (
                      <span className="text-green-400 truncate">→ {item.correction}</span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setIsNoteExpanded(prev => !prev) }}
                    aria-label={isNoteExpanded ? 'Hide explanation' : 'Why?'}
                    className="text-xs text-indigo-400 hover:text-indigo-200 flex-shrink-0 px-1"
                  >
                    Why? {isNoteExpanded ? '▴' : '▾'}
                  </button>
                </div>
                {isNoteExpanded && (
                  <p className="text-xs text-indigo-300 mt-2 leading-relaxed">{item.flashcard_note}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

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
