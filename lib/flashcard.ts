// lib/flashcard.ts
//
// Tiny parser for the [[double-bracket]] convention Claude uses in
// `flashcard_front` / `flashcard_back` (see lib/claude.ts prompts):
//
//   "I [[went]] to the market yesterday."
//   "[[Fui]] al mercado ayer."
//
// One [[…]] pair per string. We split on the first match and return the
// three slices around it so the renderer can wrap the phrase in its own
// element without ever injecting HTML.
//
// Defensive behaviour:
//   - No brackets at all (legacy or malformed flashcards): the whole
//     string lands in `before`, `phrase` is empty, `after` is empty.
//     Callers should treat an empty `phrase` as "render the sentence
//     without a tinted highlight" rather than hiding the row.
//   - Unclosed brackets (`"foo [[bar"`): same fallback — single regex
//     match required, partial brackets don't count.
//   - Multiple [[…]] pairs: only the FIRST pair is treated as the
//     focus; subsequent brackets fall into `after` unparsed. The Claude
//     prompt asks for one pair per string, so this is a defensive
//     position rather than a feature.

export interface ParsedFlashcard {
  /** Text before the bracketed phrase. */
  before: string
  /** The bracketed phrase, brackets stripped. Empty when no [[…]] found. */
  phrase: string
  /** Text after the bracketed phrase. */
  after: string
}

const BRACKET_RE = /^([\s\S]*?)\[\[([\s\S]+?)\]\]([\s\S]*)$/

export function parseFlashcard(input: string): ParsedFlashcard {
  const match = input.match(BRACKET_RE)
  if (!match) return { before: input, phrase: '', after: '' }
  return { before: match[1], phrase: match[2], after: match[3] }
}
