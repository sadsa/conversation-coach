// __tests__/components/WriteSheet.test.tsx
//
// Focused coverage for the WriteSheet body — the bits that don't go through
// WriteList (header structure, primary-button focus contract, importance
// pill, overflow menu mechanics). End-to-end delete + undo behaviour is
// still covered in WriteList.test.tsx because it's owned by the parent.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WriteSheet } from '@/components/WriteSheet'
import type { PracticeItem } from '@/lib/types'

const baseItem: PracticeItem = {
  id: 'item-1', session_id: 's1', annotation_id: 'ann-1',
  type: 'grammar', original: 'Yo fui', correction: 'Fui',
  explanation: 'Drop the subject pronoun.', sub_category: 'subjunctive',
  reviewed: false,
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
  onClose: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
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

  it('renders even without a session_title (legacy / deleted session row)', () => {
    render(<WriteSheet item={itemWithoutSession} {...noopProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})


describe('WriteSheet — primary action focus', () => {
  it('marks the overflow trigger with data-initial-focus when no onPractise is provided', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.getByTestId('sheet-overflow')).toHaveAttribute('data-initial-focus')
  })

  it('focuses the overflow trigger once the sheet opens', async () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    await act(async () => {})
    expect(screen.getByTestId('sheet-overflow')).toHaveFocus()
  })
})


describe('WriteSheet — overflow menu', () => {
  it('does not show Delete by default', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.queryByTestId('sheet-delete')).not.toBeInTheDocument()
  })

  it('does not show a toggle-written action', async () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    expect(screen.queryByTestId('sheet-toggle-written')).not.toBeInTheDocument()
  })

  it('reveals Delete inside a popover after the overflow trigger is tapped', async () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })

    const menuItem = screen.getByTestId('sheet-delete')
    expect(menuItem).toBeInTheDocument()
    expect(menuItem).toHaveTextContent(/delete/i)
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
    await act(async () => {
      await userEvent.keyboard('{Enter}')
    })
    expect(onPractise).toHaveBeenCalledWith(baseItem)
  })
})


describe('WriteSheet — Hush stack body', () => {
  it('renders the "You said" eyebrow above the original for grammar items', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.getByText(/you said/i)).toBeInTheDocument()
  })

  it('flips the eyebrow to "Sounds off" for naturalness items (no rewrite)', () => {
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
    const borderLeftElements = container.querySelectorAll('aside [class*="border-l"]')
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

  it('retry button re-runs the failed delete', async () => {
    const onDelete = vi.fn().mockResolvedValue(false)
    render(<WriteSheet item={baseItem} {...noopProps} onDelete={onDelete} />)

    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-overflow'))
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('sheet-delete'))
    })

    expect(onDelete).toHaveBeenCalledTimes(1)

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    })

    expect(onDelete).toHaveBeenCalledTimes(2)
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

  it('does not render practise button when onPractise is not provided', () => {
    render(<WriteSheet item={baseItem} {...noopProps} />)
    expect(screen.queryByTestId('sheet-practise-btn')).not.toBeInTheDocument()
  })
})
