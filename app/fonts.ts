// app/fonts.ts
//
// Brand typography. Loaded once at the root layout via the `variable`
// strategy so the rest of the app references stable CSS custom properties
// (`--font-body`, `--font-display`) — no per-component imports, no hydration
// flicker, no extra `<link>` tags.
//
// Pairing rationale (see /critique → /typeset pass):
//
//   • Hanken Grotesk for body text. Humanist sans designed explicitly for
//     digital reading at 14–18px. Calm, neutral, with enough warmth to feel
//     friendly without slipping into Duolingo territory. Excellent Spanish
//     diacritic coverage (lowercase í, é, ñ, ¿, ¡ all sit cleanly on their
//     baselines). Three weights: 400 body, 500 button labels, 600 emphasis.
//
//   • Source Serif 4 for display headings (greetings + page H1s). Adobe's
//     transitional serif with an optical-size axis — at large sizes it reads
//     bookish and quietly authoritative, exactly the "patient tutor"
//     register the .impeccable.md brief calls for. Three weights mirror the
//     body so we never need to load a serif Bold we don't use.
//
// Both faces are deliberately NOT from the impeccable reflex-reject list
// (Inter, IBM Plex, Fraunces, Crimson, etc.) — those would have silently
// recreated the AI-app monoculture the rest of the codebase carefully
// avoids. The pairing also respects the typography rule against two similar
// sans-serifs: serif display + humanist sans body is genuine contrast.

import { Hanken_Grotesk, Source_Serif_4 } from 'next/font/google'

export const fontBody = Hanken_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-body',
  // Apple metric-matched fallback so the layout doesn't shift when the
  // webfont arrives over the network — Hanken's metrics are close to
  // SF Pro / Helvetica, which is what most users see during the swap.
  fallback: [
    'ui-sans-serif',
    'system-ui',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'sans-serif',
  ],
})

export const fontDisplay = Source_Serif_4({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-display',
  fallback: [
    'ui-serif',
    'Georgia',
    'Cambria',
    'Times New Roman',
    'serif',
  ],
})
