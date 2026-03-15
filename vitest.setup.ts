import '@testing-library/jest-dom'
import * as matchesModule from '@testing-library/dom/dist/matches.js'

// Patch makeNormalizer to default trim=false so that leading/trailing spaces in
// text queries are preserved. This lets getByText(' al mercado.') find a text
// node whose content is literally ' al mercado.' (with a leading space).
const _origMakeNormalizer = matchesModule.makeNormalizer
;(matchesModule as unknown as Record<string, unknown>).makeNormalizer = function (opts: Parameters<typeof _origMakeNormalizer>[0]) {
  return _origMakeNormalizer({ trim: opts?.trim ?? false, collapseWhitespace: opts?.collapseWhitespace ?? true, normalizer: opts?.normalizer })
}
