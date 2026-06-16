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
  it('does not render a session title source link', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.queryByTestId('sheet-source-link')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  })

  it('does not render a decorative status dot anywhere in the sheet', () => {
    const { container } = render(<WriteSheet item={baseItem} {...noopProps} />)
    const dots = container.querySelectorAll(
      'aside span.w-2.h-2.rounded-full, aside span[class*="w-2"][class*="h-2"][class*="rounded-full"]',
    )
    expect(dots.length).toBe(0)
  })

  it('does not render a source link even when session_title is present', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.queryByTestId('sheet-source-link')).not.toBeInTheDocument()
  })

  it('switches the primary action label in the Written variant', async () => {
    render(
      <WriteSheet
        item={{ ...itemWithoutSession, written_down: true }}
        {...noopProps}
        isWritten
      />,
    )
    // Toggle-written is now in the overflow menu
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    expect(screen.getByTestId('sheet-toggle-written')).toHaveTextContent(/move back/i)
  })
})


describe('WriteSheet — primary action focus + label flip', () => {
  it('marks the primary button with data-initial-focus', () => {
    // No onPractise → overflow trigger gets data-initial-focus
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.getByTestId('sheet-overflow')).toHaveAttribute('data-initial-focus')
  })

  it('focuses the primary button once the sheet opens', async () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    // Focus is parked by DockedSheet's effect, which runs after commit.
    // RTL's `render` flushes effects synchronously, but we still await a
    // microtask tick to be safe across React 18 batching changes.
    await act(async () => {})
    expect(screen.getByTestId('sheet-overflow')).toHaveFocus()
  })

  it('flips to the busy label while the toggle is in flight', async () => {
    let resolveToggle: (value: boolean) => void = () => {}
    const onToggleWritten = vi.fn(
      () => new Promise<boolean>(resolve => { resolveToggle = resolve }),
    )
    render(
      <WriteSheet item={baseItem} {...noopProps} onToggleWritten={onToggleWritten} />,
    )

    // Open overflow to access the toggle action
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })

    const toggle = screen.getByTestId('sheet-toggle-written')
    await act(async () => {
      await userEvent.click(toggle)
    })

    // After clicking, menu closes and busy state disables the overflow trigger
    expect(screen.getByTestId('sheet-overflow')).toBeDisabled()

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
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('WriteSheet — Enter shortcut on the primary action', () => {
  it('fires the practise action when Enter is pressed and the practise button has focus', async () => {
    const onPractise = vi.fn()
    render(<WriteSheet item={baseItem} {...noopProps} onPractise={onPractise} />)

    // When onPractise is provided, sheet-practise-btn gets data-initial-focus.
    // Enter activates the focused button — this is browser-native, but the test
    // documents the contract so a future regression in DockedSheet's focus
    // wiring fails loudly.
    await act(async () => {
      await userEvent.keyboard('{Enter}')
    })

    expect(onPractise).toHaveBeenCalledWith(baseItem)
  })
})

describe('WriteSheet — Hush stack body', () => {
  // The body renders the shared `<HushStack>` treatment — a tracked-uppercase
  // eyebrow, the italic struck original, and the large serif answer below.
  // The older CorrectionInContext block (with surrounding sentence context)
  // is gone: the sheet trades context for visual calm, and the source link
  // above is the user's path back to the full sentence on /sessions/[id].

  it('renders the "You said" eyebrow above the original for grammar items', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.getByText(/you said/i)).toBeInTheDocument()
  })

  it('flips the eyebrow to "Sounds off" for naturalness items (no rewrite)', () => {
    // Naturalness annotations have `correction === null`. The Hush stack
    // shows the flagged fragment with a quiet underline and no answer line,
    // so "You said" would promise a rewrite that doesn't exist. "Sounds off"
    // matches what the body actually shows.
    render(
      <WriteSheet
        item={{ ...baseItem, type: 'naturalness', correction: null }}
        {...noopProps}
      />,
    )
    expect(screen.getByText(/sounds off/i)).toBeInTheDocument()
    expect(screen.queryByText(/you said/i)).not.toBeInTheDocument()
  })

  it('renders the original and correction lines on segment-data-present items', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Yo fui')).toBeInTheDocument()
    expect(within(sheet).getByText('Fui')).toBeInTheDocument()
  })

  it('renders the original and correction lines on segment-data-null items', () => {
    // Hush stack doesn't depend on segment data — both branches render the
    // same shape. Kept as a regression guard: legacy / pre-enrichment rows
    // should still surface the wrong → right pair without the surrounding
    // sentence.
    render(
      <WriteSheet
        item={{ ...baseItem, segment_text: null, start_char: null, end_char: null }}
        {...noopProps}
      />,
    )
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('Yo fui')).toBeInTheDocument()
    expect(within(sheet).getByText('Fui')).toBeInTheDocument()
  })

  it('does not render a border-framed correction block (the old layout)', () => {
    const { container } = render(<WriteSheet item={baseItem} {...noopProps} />)
    // The body intentionally relies on spacing + weight contrast alone now;
    // a re-introduced border-l around the correction would be a regression.
    const borderLeftElements = container.querySelectorAll('aside [class*="border-l"]')
    // `md:border-l` on the aside itself is fine — that's the desktop sheet
    // chrome. Anything *inside* the aside with a border-left is suspect.
    borderLeftElements.forEach(el => {
      expect(el).toBe(container.querySelector('aside'))
    })
  })
})

describe('WriteSheet — source link', () => {
  it('does not render a session title link', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.queryByTestId('sheet-source-link')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /cafe with maría/i })).not.toBeInTheDocument()
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
  it('does not render an importance pill regardless of score', () => {
    render(<WriteSheet item={{ ...baseItem, importance_score: 3 }} {...noopProps} />)
    expect(screen.queryByText(/worth remembering/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/high priority/i)).not.toBeInTheDocument()
  })

  it('does not render an importance toggle button', () => {
    const note = 'Dropping subject pronouns is standard in Rioplatense.'
    render(<WriteSheet item={{ ...baseItem, importance_score: 2, importance_note: note }} {...noopProps} />)
    expect(screen.queryByRole('button', { name: /toggle importance/i })).not.toBeInTheDocument()
    expect(screen.queryByText(note)).not.toBeInTheDocument()
  })
})


describe('WriteSheet — error recovery', () => {
  it('shows an error message and retry button when toggle fails', async () => {
    const onToggleWritten = vi.fn().mockResolvedValue(false)
    render(<WriteSheet item={baseItem} {...noopProps} onToggleWritten={onToggleWritten} />)

    // Toggle is now in overflow menu — open it first
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
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

    // Toggle is now in overflow menu — open it first
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
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

    // Toggle is now in overflow menu — open it first
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
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

describe('WriteSheet — lesson entry point', () => {
  it('renders Practise this phrase as the primary button when onPractise is provided', () => {
    const onPractise = vi.fn()
    render(<WriteSheet item={baseItem} {...noopProps} onPractise={onPractise} />)
    expect(screen.getByTestId('sheet-practise-btn')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-practise-btn')).toHaveTextContent(/drill this phrase/i)
  })

  it('calls onPractise with the item when practise button is tapped', async () => {
    const user = userEvent.setup()
    const onPractise = vi.fn()
    render(<WriteSheet item={baseItem} {...noopProps} onPractise={onPractise} />)
    await user.click(screen.getByTestId('sheet-practise-btn'))
    expect(onPractise).toHaveBeenCalledWith(baseItem)
  })

  it('moves Mark as written into the overflow menu', async () => {
    const user = userEvent.setup()
    render(<WriteSheet item={baseItem} {...noopProps} />)
    // Should not be visible as a direct footer button
    expect(screen.queryByTestId('sheet-toggle-written')).not.toBeInTheDocument()
    // Should appear in overflow menu after opening it
    await user.click(screen.getByTestId('sheet-overflow'))
    expect(screen.getByTestId('sheet-toggle-written')).toBeInTheDocument()
  })

  it('does not render practise button when onPractise is not provided', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.queryByTestId('sheet-practise-btn')).not.toBeInTheDocument()
  })
})

