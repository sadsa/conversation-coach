import '@testing-library/jest-dom'

// Patch makeNormalizer to default trim=false so that leading/trailing spaces in
// text queries are preserved. This lets getByText(' al mercado.') find a text
// node whose content is literally ' al mercado.' (with a leading space).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const matchesModule = require('@testing-library/dom/dist/matches.js')
const _origMakeNormalizer = matchesModule.makeNormalizer
matchesModule.makeNormalizer = function (opts: { trim?: boolean; collapseWhitespace?: boolean; normalizer?: (s: string) => string } | undefined) {
  return _origMakeNormalizer({ trim: opts?.trim ?? false, collapseWhitespace: opts?.collapseWhitespace ?? true, normalizer: opts?.normalizer })
}

// JSDOM ships without `window.matchMedia`. Components that branch on viewport
// size or `prefers-reduced-motion` crash without this stub. Default to
// "desktop, motion enabled" — individual tests can override per-file if
// they need the opposite.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
