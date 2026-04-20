// __tests__/components/WriteSheet.test.tsx
//
// Focused coverage for the WriteSheet body — the bits that don't go through
// WriteList (header structure, primary-button focus contract, importance
// pill, overflow menu mechanics, busy label flips). End-to-end auto-advance,
// optimistic updates, and toast behaviour are still covered in
// WriteList.test.tsx because they're owned by the parent.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WriteSheet } from '@/components/WriteSheet'
import type { PracticeItem } from '@/lib/types'

const baseItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'Yo fui', correction: 'Fui',
  explanation: 'Drop the subject pronoun.', sub_category: 'subjunctive',
  reviewed: false, written_down: false,
  created_at: '2026-03-15', updated_at: '2026-03-15',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
  importance_score: null, importance_note: null,
  segment_text: 'Ayer Yo fui al mercado.', start_char: 5, end_char: 11,
  session_title: 'Cafe with María',
}

// Used to exercise the legacy fallback path (deleted session / pre-enrichment row).
const itemWithoutSession: PracticeItem = { ...baseItem, session_title: null }

const noopProps = {
  position: { current: 1, total: 1 },
  hasPrev: false,
  hasNext: false,
  isWritten: false,
  onClose: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onToggleWritten: vi.fn().mockResolvedValue(true),
  onDelete: vi.fn().mockResolvedValue(true),
}

describe('WriteSheet — header structure', () => {
  it('renders the bare session title as an h2 linking back to the source session', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    const heading = screen.getByRole('heading', { level: 2 })
    // The eyebrow surfaces the source session as the item's identity.
    // Distilled to the bare title — no "From " prefix, no surrounding
    // quotes, no relative date — those were noise crowding the row.
    expect(heading).toHaveTextContent(/cafe with maría/i)
    expect(heading.textContent ?? '').not.toMatch(/^from /i)
    expect(heading.textContent ?? '').not.toMatch(/[“"]/)
    const link = within(heading).getByTestId('sheet-source-link')
    expect(link).toHaveAttribute('href', `/sessions/${baseItem.session_id}`)
  })

  it('does not render a decorative status dot in the header', () => {
    // The state (to-write vs written) is already conveyed by the surface
    // the user came from, the primary action label, and the row muting in
    // the Written view. A color-only dot was decoration repeating signal.
    const { container } = render(<WriteSheet item={baseItem} {...noopProps} />)
    const sheet = screen.getByRole('complementary')
    // No <span> sized like the old dot (`w-2 h-2 rounded-full`) — match
    // by class so the check is shape-based rather than tied to a testid
    // we never added.
    const dots = container.querySelectorAll(
      'aside span.w-2.h-2.rounded-full, aside span[class*="w-2"][class*="h-2"][class*="rounded-full"]',
    )
    expect(dots.length).toBe(0)
    // And belt-and-braces: nothing ahead of the heading inside the
    // header lead row.
    const heading = within(sheet).getByRole('heading', { level: 2 })
    expect(heading.previousElementSibling).toBeNull()
  })

  it('falls back to the status caption when the item has no session title', () => {
    render(<WriteSheet item={itemWithoutSession} {...noopProps} />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent(/to write/i)
    // No source link rendered when there's nothing to point at.
    expect(screen.queryByTestId('sheet-source-link')).not.toBeInTheDocument()
  })

  it('switches the fallback caption and primary action in the Written variant', () => {
    render(
      <WriteSheet
        item={{ ...itemWithoutSession, written_down: true }}
        {...noopProps}
        isWritten
      />,
    )
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/written/i)
    // Primary now reads "Move back to Write list"
    expect(screen.getByRole('button', { name: /move.+correction back/i })).toBeInTheDocument()
  })

  it('renders the position pill in the header lead', () => {
    render(<WriteSheet item={baseItem} {...noopProps} position={{ current: 3, total: 7 }} />)
    expect(screen.getByText('3 of 7')).toBeInTheDocument()
  })
})

describe('WriteSheet — primary action focus + label flip', () => {
  it('marks the primary button with data-initial-focus', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.getByTestId('sheet-toggle-written')).toHaveAttribute('data-initial-focus')
  })

  it('focuses the primary button once the sheet opens', async () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    // Focus is parked by DockedSheet's effect, which runs after commit.
    // RTL's `render` flushes effects synchronously, but we still await a
    // microtask tick to be safe across React 18 batching changes.
    await act(async () => {})
    expect(screen.getByTestId('sheet-toggle-written')).toHaveFocus()
  })

  it('flips to the busy label while the toggle is in flight', async () => {
    let resolveToggle: (value: boolean) => void = () => {}
    const onToggleWritten = vi.fn(
      () => new Promise<boolean>(resolve => { resolveToggle = resolve }),
    )
    render(
      <WriteSheet item={baseItem} {...noopProps} onToggleWritten={onToggleWritten} />,
    )

    const primary = screen.getByTestId('sheet-toggle-written')
    await act(async () => {
      await userEvent.click(primary)
    })

    expect(primary).toHaveTextContent(/marking/i)
    expect(primary).toBeDisabled()

    await act(async () => {
      resolveToggle(true)
    })
  })
})

describe('WriteSheet — importance pill', () => {
  it('renders nothing when score is 1 (suppressed signal)', () => {
    render(<WriteSheet item={{ ...baseItem, importance_score: 1 }} {...noopProps} />)
    expect(screen.queryByText(/worth remembering/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/high priority/i)).not.toBeInTheDocument()
  })

  it('renders the standard pill for score 2', () => {
    render(<WriteSheet item={{ ...baseItem, importance_score: 2 }} {...noopProps} />)
    expect(screen.getByText(/worth remembering/i)).toBeInTheDocument()
  })

  it('renders the high-priority pill for score 3', () => {
    render(<WriteSheet item={{ ...baseItem, importance_score: 3 }} {...noopProps} />)
    expect(screen.getByText(/high priority/i)).toBeInTheDocument()
  })
})

describe('WriteSheet — overflow menu', () => {
  it('does not show the destructive Delete by default', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.queryByTestId('sheet-delete')).not.toBeInTheDocument()
  })

  it('reveals Delete inside a popover after the overflow trigger is tapped', async () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })

    const menuItem = screen.getByTestId('sheet-delete')
    expect(menuItem).toBeInTheDocument()
    expect(menuItem).toHaveTextContent(/delete/i)
    // The undo reassurance lives only in the aria-label now — the visible
    // helper line was distilled out (the toast is the immediate
    // confirmation). Pin both halves of that decision so a regression
    // would either re-add visible noise or quietly drop the SR copy.
    expect(menuItem.getAttribute('aria-label')).toMatch(/undo/i)
    expect(menuItem.textContent ?? '').not.toMatch(/undo/i)
    expect(menuItem.textContent ?? '').not.toMatch(/seconds/i)
  })

  it('calls onDelete when the menu item is selected', async () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    render(<WriteSheet item={baseItem} {...noopProps} onDelete={onDelete} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-delete'))
    })

    expect(onDelete).toHaveBeenCalledWith(baseItem)
  })

  it('closes the menu when Escape is pressed without dismissing the sheet', async () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    expect(screen.getByTestId('sheet-delete')).toBeInTheDocument()

    // The menu's Escape handler stops propagation BEFORE the sheet's
    // document-level Escape handler runs, so the sheet stays open and
    // only the popover dismisses.
    await act(async () => {
      await userEvent.keyboard('{Escape}')
    })
    expect(screen.queryByTestId('sheet-delete')).not.toBeInTheDocument()
    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })
})

describe('WriteSheet — Enter shortcut on the primary action', () => {
  it('fires the primary action when Enter is pressed and the primary has focus', async () => {
    const onToggleWritten = vi.fn().mockResolvedValue(true)
    render(<WriteSheet item={baseItem} {...noopProps} onToggleWritten={onToggleWritten} />)

    // The primary already has focus on open (data-initial-focus). Enter
    // activates the focused button — this is browser-native, but the test
    // documents the contract so a future regression in DockedSheet's focus
    // wiring fails loudly.
    await act(async () => {
      await userEvent.keyboard('{Enter}')
    })

    expect(onToggleWritten).toHaveBeenCalledWith(baseItem)
  })
})

describe('WriteSheet — correction in context (combined block)', () => {
  it('renders the sheet-scoped correction-in-context block when segment data is present', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    const block = screen.getByTestId(`correction-in-context-sheet-${baseItem.id}`)
    // Sentence (struck wrong + inline rewrite) all in one paragraph: this
    // is the layout change that lets us drop the standalone context block.
    expect(block).toBeInTheDocument()
    expect(within(block).getByText('Yo fui')).toBeInTheDocument()
    expect(within(block).getByText('Fui')).toBeInTheDocument()
  })

  it('frames the correction block with a left rule so it does not blur into the explanation paragraph', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    // Walk up from the inner <p> to the framing wrapper. This is the layout
    // pin: without the wrapper the sentence and the explanation read as one
    // continuous block of muted prose with a bright correction word
    // floating in the middle (the squint test fails).
    const inner = screen.getByTestId(`correction-in-context-sheet-${baseItem.id}`)
    const frame = inner.parentElement!
    expect(frame.className).toMatch(/border-l/)
    expect(frame.className).toMatch(/border-border\b/)
    expect(frame.className).toMatch(/pl-/)
  })

  it('falls back to the bare strike pair when segment data is null', () => {
    render(
      <WriteSheet
        item={{ ...baseItem, segment_text: null, start_char: null, end_char: null }}
        {...noopProps}
      />,
    )
    expect(screen.queryByTestId(`correction-in-context-sheet-${baseItem.id}`)).not.toBeInTheDocument()
    // Both halves of the correction still surface so the user sees the fix
    // even without the surrounding sentence to anchor on.
    const sheet = screen.getByRole('complementary')
    expect(within(sheet).getByText('Yo fui')).toBeInTheDocument()
    expect(within(sheet).getByText('Fui')).toBeInTheDocument()
  })
})

describe('WriteSheet — closed state', () => {
  it('renders nothing when item is null', () => {
    const { container } = render(<WriteSheet item={null} {...noopProps} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('WriteSheet — header inversion (regression)', () => {
  it('places the position counter in a smaller, quieter visual class than the title', () => {
    render(<WriteSheet item={baseItem} {...noopProps} position={{ current: 2, total: 5 }} />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveClass('font-semibold')
    expect(heading).toHaveClass('text-text-primary')
    const position = screen.getByText('2 of 5')
    // Position is text-xs; title is the louder element. Together this
    // catches the inverted-hierarchy regression flagged in the critique.
    expect(position).toHaveClass('text-xs')
    expect(position).toHaveClass('text-text-tertiary')
  })
})

describe('WriteSheet — explanation', () => {
  it('renders the explanation in the body', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })
})

describe('WriteSheet — sub-category label', () => {
  it('renders the human-readable sub-category as a quiet eyebrow (not a chip)', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    const label = screen.getByTestId('sheet-sub-category')
    expect(label).toHaveTextContent('Subjunctive')
    // Pin the visual demotion: the sub-category is metadata, not an
    // accent chip competing with the framed correction. Uppercase
    // tertiary text is the shape we want it to land in.
    expect(label.className).toMatch(/uppercase/)
    expect(label.className).toMatch(/text-text-tertiary/)
    // And explicitly NOT the loud chip background it had previously.
    expect(label.className).not.toMatch(/bg-accent-chip/)
    expect(label.className).not.toMatch(/border/)
  })
})
