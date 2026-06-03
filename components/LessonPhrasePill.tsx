// components/LessonPhrasePill.tsx
//
// Anchored phrase display shown below the phase rail throughout a lesson.
// Eyebrow "Studying" + correction in Source Serif 4 with the [[bracketed]]
// phrase tinted in --color-correction-text.

import { Fragment } from 'react'
import { useTranslation } from '@/components/LanguageProvider'

// Splits a flashcard string on EVERY [[…]] pair and tints each bracketed
// segment. parseFlashcard() only resolves the first pair, which leaks
// literal "[[…]]" markup onto the line when Claude emits more than one
// (e.g. "What it [[was missing]] at the end [[was]] the salt."). Here we
// render all of them and strip any stray, unclosed brackets so raw
// markup never reaches the user.
const BRACKET_SEGMENT_RE = /\[\[([\s\S]+?)\]\]/g

function renderTinted(text: string) {
  const out: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0
  BRACKET_SEGMENT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BRACKET_SEGMENT_RE.exec(text)) !== null) {
    const start = match.index
    if (start > lastIndex) out.push(<Fragment key={key++}>{text.slice(lastIndex, start)}</Fragment>)
    out.push(<em key={key++} className="text-correction not-italic">{match[1]}</em>)
    lastIndex = start + match[0].length
  }
  // Trailing remainder, with any leftover loose brackets scrubbed.
  if (lastIndex < text.length) {
    out.push(<Fragment key={key++}>{text.slice(lastIndex).replace(/\[\[|\]\]/g, '')}</Fragment>)
  }
  return out
}

interface Props {
  /** The corrected phrase, e.g. "Fui al mercado ayer". */
  correction: string
  /**
   * Optional flashcard_back with [[double-bracket]] phrase marker,
   * e.g. "[[Fui]] al mercado ayer".
   * When present, the bracketed segment is tinted on the correction line.
   */
  flashcard_back: string | null
}

export function LessonPhrasePill({ correction, flashcard_back }: Props) {
  const { t } = useTranslation()
  const hasMarkup = flashcard_back ? BRACKET_SEGMENT_RE.test(flashcard_back) : false
  // matchAll/test share the global regex; reset lastIndex after the probe.
  BRACKET_SEGMENT_RE.lastIndex = 0

  return (
    <div className="mx-4 mt-3 px-3 py-2.5 bg-surface border border-border-subtle rounded-[10px] flex-shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary mb-1">
        {t('lesson.studying')}
      </p>
      <p className="font-display text-[15px] text-text-primary leading-snug">
        {hasMarkup && flashcard_back ? renderTinted(flashcard_back) : correction}
      </p>
    </div>
  )
}
