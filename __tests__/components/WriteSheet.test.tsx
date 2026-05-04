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
  it('renders the session title as a small source link in the body, not an h2 in the header', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
    const link = screen.getByTestId('sheet-source-link')
    expect(link).toHaveTextContent(/cafe with maría/i)
    expect(link).toHaveAttribute('href', `/sessions/${baseItem.session_id}`)
    expect(link.textContent ?? '').not.toMatch(/^from /i)
    expect(link.textContent ?? '').not.toMatch(/["\u201C\u201D]/)
  })

  it('does not render a decorative status dot anywhere in the sheet', () => {
    const { container } = render(<WriteSheet item={baseItem} {...noopProps} />)
    const dots = container.querySelectorAll(
      'aside span.w-2.h-2.rounded-full, aside span[class*="w-2"][class*="h-2"][class*="rounded-full"]',
    )
    expect(dots.length).toBe(0)
  })

  it('omits the source link when the item has no session title', () => {
    render(<WriteSheet item={itemWithoutSession} {...noopProps} />)
    expect(screen.queryByTestId('sheet-source-link')).not.toBeInTheDocument()
  })

  it('switches the primary action label in the Written variant', () => {
    render(
      <WriteSheet
        item={{ ...itemWithoutSession, written_down: true }}
        {...noopProps}
        isWritten
      />,
    )
    expect(screen.getByRole('button', { name: /move.+correction back/i })).toBeInTheDocument()
  })

  it('renders the position pill in the header', () => {
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

  it('renders the correction in context without a border frame', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    // The left-border wrapper was removed (Option C layout pass) — the
    // correction block now relies on spacing + weight contrast alone.
    const inner = screen.getByTestId(`correction-in-context-sheet-${baseItem.id}`)
    expect(inner).toBeInTheDocument()
    expect(inner.parentElement!.className).not.toMatch(/border-l/)
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

describe('WriteSheet — explanation', () => {
  it('renders the explanation in the body', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })
})


describe('WriteSheet — ImportancePill', () => {
  it('renders nothing when importance_score is null', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.queryByText(/worth remembering/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/high priority/i)).not.toBeInTheDocument()
  })

  it('renders nothing when importance_score is 1 (suppressed)', () => {
    render(<WriteSheet item={{ ...baseItem, importance_score: 1 }} {...noopProps} />)
    expect(screen.queryByText(/worth remembering/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/high priority/i)).not.toBeInTheDocument()
  })

  it('renders "Worth remembering" pill for score 2', () => {
    render(<WriteSheet item={{ ...baseItem, importance_score: 2 }} {...noopProps} />)
    expect(screen.getByText(/worth remembering/i)).toBeInTheDocument()
  })

  it('renders "High priority" pill for score 3', () => {
    render(<WriteSheet item={{ ...baseItem, importance_score: 3 }} {...noopProps} />)
    expect(screen.getByText(/high priority/i)).toBeInTheDocument()
  })

  it('renders a static span (not a button) when note is null', () => {
    render(<WriteSheet item={{ ...baseItem, importance_score: 2, importance_note: null }} {...noopProps} />)
    const pill = screen.getByText(/worth remembering/i).closest('span')
    expect(pill).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /toggle importance/i })).not.toBeInTheDocument()
  })

  it('renders a toggle button when note is present, expands note on click', async () => {
    const note = 'Dropping subject pronouns is standard in Rioplatense.'
    render(
      <WriteSheet
        item={{ ...baseItem, importance_score: 2, importance_note: note }}
        {...noopProps}
      />,
    )
    const toggle = screen.getByRole('button', { name: /toggle importance/i })
    expect(toggle).toBeInTheDocument()
    expect(screen.queryByText(note)).not.toBeInTheDocument()

    await act(async () => { await userEvent.click(toggle) })
    expect(screen.getByText(note)).toBeInTheDocument()

    await act(async () => { await userEvent.click(toggle) })
    expect(screen.queryByText(note)).not.toBeInTheDocument()
  })

  it('resets note expansion when navigating to a new item', async () => {
    const note = 'Important note.'
    const itemWithNote = { ...baseItem, importance_score: 2, importance_note: note }
    const { rerender } = render(<WriteSheet item={itemWithNote} {...noopProps} />)

    const toggle = screen.getByRole('button', { name: /toggle importance/i })
    await act(async () => { await userEvent.click(toggle) })
    expect(screen.getByText(note)).toBeInTheDocument()

    const item2 = { ...baseItem, id: 'item-2', importance_score: 2, importance_note: note }
    rerender(<WriteSheet item={item2} {...noopProps} />)
    expect(screen.queryByText(note)).not.toBeInTheDocument()
  })
})


describe('WriteSheet — error recovery', () => {
  it('shows an error message and retry button when toggle fails', async () => {
    const onToggleWritten = vi.fn().mockResolvedValue(false)
    render(<WriteSheet item={baseItem} {...noopProps} onToggleWritten={onToggleWritten} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/couldn't update/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('shows an error message when delete fails', async () => {
    const onDelete = vi.fn().mockResolvedValue(false)
    render(<WriteSheet item={baseItem} {...noopProps} onDelete={onDelete} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-delete'))
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/couldn't/i)).toBeInTheDocument()
  })

  it('retry button re-runs the failed action', async () => {
    const onToggleWritten = vi.fn().mockResolvedValue(false)
    render(<WriteSheet item={baseItem} {...noopProps} onToggleWritten={onToggleWritten} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })

    expect(onToggleWritten).toHaveBeenCalledTimes(1)

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    })

    expect(onToggleWritten).toHaveBeenCalledTimes(2)
  })

  it('clears the error message on a subsequent successful toggle', async () => {
    const onToggleWritten = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    render(<WriteSheet item={baseItem} {...noopProps} onToggleWritten={onToggleWritten} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-toggle-written'))
    })
    expect(screen.getByText(/couldn't update/i)).toBeInTheDocument()

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    })
    expect(screen.queryByText(/couldn't update/i)).not.toBeInTheDocument()
  })
})

