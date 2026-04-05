# Practice Page UX Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the practice page with a smooth two-phase swipe-to-delete animation, a Gmail-style sticky bulk action toolbar, an icon-only bottom navigation bar, and a tap-to-view modal for practice items.

**Architecture:** Four independent improvements. `BottomNav` is a new component wired into the root layout. The other three are self-contained changes to `PracticeList.tsx`. No new API routes or DB schema changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library, `react-swipeable`

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `components/BottomNav.tsx` | Create | Fixed bottom tab bar, icon-only, active state via `usePathname` |
| `app/layout.tsx` | Modify | Remove header nav links, add `<BottomNav />`, add `pb-20` to `<main>` |
| `components/PracticeList.tsx` | Modify | Swipe animation, bulk toolbar (sticky + SVG icons), item tap → modal |
| `__tests__/components/BottomNav.test.tsx` | Create | Tests for BottomNav |
| `__tests__/components/PracticeList.test.tsx` | Modify | Tests for new behaviours |

---

## Task 1: BottomNav component

**Files:**
- Create: `components/BottomNav.tsx`
- Create: `__tests__/components/BottomNav.test.tsx`
- Modify: `app/layout.tsx`

---

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/BottomNav.test.tsx`:

```tsx
// __tests__/components/BottomNav.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BottomNav } from '@/components/BottomNav'

// usePathname is a Next.js hook — mock it
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

import { usePathname } from 'next/navigation'
const mockPathname = usePathname as ReturnType<typeof vi.fn>

describe('BottomNav', () => {
  it('renders three nav links with aria-labels', () => {
    mockPathname.mockReturnValue('/')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /practice/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('marks Home as active on exact "/" match', () => {
    mockPathname.mockReturnValue('/')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /practice/i })).not.toHaveAttribute('aria-current')
  })

  it('does NOT mark Home as active on "/practice"', () => {
    mockPathname.mockReturnValue('/practice')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /practice/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Practice as active on a sub-path like "/practice/foo"', () => {
    mockPathname.mockReturnValue('/practice/foo')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /practice/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Settings as active on "/settings"', () => {
    mockPathname.mockReturnValue('/settings')
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('aria-current', 'page')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/BottomNav.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/BottomNav'`

- [ ] **Step 3: Implement BottomNav**

Create `components/BottomNav.tsx`:

```tsx
// components/BottomNav.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  {
    href: '/',
    label: 'Home',
    exact: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-6 h-6" aria-hidden>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/practice',
    label: 'Practice',
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-6 h-6" aria-hidden>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-6 h-6" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-gray-800"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Main navigation"
    >
      <div className="flex h-16 max-w-4xl mx-auto">
        {TABS.map(tab => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex items-center justify-center transition-colors ${
                active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.icon}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/BottomNav.test.tsx
```

Expected: PASS (5 tests)

- [ ] **Step 5: Update app/layout.tsx**

Open `app/layout.tsx`. Make two changes:

1. Add import at the top (after existing imports):
```tsx
import { BottomNav } from '@/components/BottomNav'
```

2. Replace the `<nav>` block and `<main>`:

**Before:**
```tsx
<nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
  <a href="/" className="text-lg font-semibold tracking-tight">Conversation Coach</a>
  <div className="flex items-center gap-4">
    <a href="/practice" className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
      Practice Items
    </a>
    <a href="/settings" className="text-sm text-gray-400 hover:text-gray-200 transition-colors">
      Settings
    </a>
  </div>
</nav>
<main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
```

**After:**
```tsx
<nav className="border-b border-gray-800 px-6 py-4">
  <a href="/" className="text-lg font-semibold tracking-tight">Conversation Coach</a>
</nav>
<main className="max-w-4xl mx-auto px-6 py-8 pb-20">{children}</main>
<BottomNav />
```

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
npm test
```

Expected: All existing tests pass (layout has no unit tests; any snapshot tests would need updating but this project has none).

- [ ] **Step 7: Commit**

```bash
git add components/BottomNav.tsx app/layout.tsx __tests__/components/BottomNav.test.tsx
git commit -m "feat: add icon-only bottom tab bar, remove header nav links"
```

---

## Task 2: Practice item modal (tap to view)

**Files:**
- Modify: `components/PracticeList.tsx`
- Modify: `__tests__/components/PracticeList.test.tsx`

When the user taps a practice item (not in bulk mode, not mid-swipe), a modal opens showing the full annotation details. Uses the existing `Modal` component. Content rendered inline from `PracticeItem` fields — no `AnnotationCard` reuse.

---

- [ ] **Step 1: Write the failing tests**

Add these test cases to `__tests__/components/PracticeList.test.tsx` (append after the existing `describe` block):

```tsx
// Add this import at the top of the test file:
// import { Modal } from '@/components/Modal'   ← not needed; we query by testid

describe('PracticeList — item modal', () => {
  it('does not show a modal initially', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.queryByTestId('modal-backdrop')).not.toBeInTheDocument()
  })

  it('opens a modal when an item is clicked', async () => {
    render(<PracticeList items={[grammarItem]} />)
    // Click the item card (not the checkbox)
    await userEvent.click(screen.getByText('Fui'))
    expect(screen.getByTestId('modal-backdrop')).toBeInTheDocument()
  })

  it('modal shows the explanation text', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByText('Fui'))
    expect(screen.getByText('Drop pronoun.')).toBeInTheDocument()
  })

  it('modal shows correction for grammar items', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByText('Fui'))
    // Modal should show original and correction
    expect(screen.getAllByText('Yo fui').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fui').length).toBeGreaterThan(0)
  })

  it('modal shows original text for strength items (no correction)', async () => {
    render(<PracticeList items={[strengthItem]} />)
    await userEvent.click(screen.getByText(/Dale, vamos/))
    expect(screen.getByText('Natural Argentine expression.')).toBeInTheDocument()
  })

  it('closes the modal when backdrop is clicked', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByText('Fui'))
    await userEvent.click(screen.getByTestId('modal-backdrop'))
    expect(screen.queryByTestId('modal-backdrop')).not.toBeInTheDocument()
  })

  it('does not open modal when in bulk mode', async () => {
    render(<PracticeList items={[grammarItem]} />)
    // Enter bulk mode by clicking the checkbox
    await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
    // Now clicking the item should toggle selection, not open modal
    await userEvent.click(screen.getByText('Fui'))
    expect(screen.queryByTestId('modal-backdrop')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```

Expected: FAIL — modal-related tests fail (modal never appears)

- [ ] **Step 3: Implement modal state and rendering in PracticeList**

Add imports at the top of `components/PracticeList.tsx`:

```tsx
import { Modal } from '@/components/Modal'
```

**Update `SwipeableItem` props interface** — add `onOpen`:

```tsx
function SwipeableItem({
  item,
  isBulkMode,
  isSelected,
  onToggleSelect,
  onDelete,
  onOpen,
}: {
  item: PracticeItem
  isBulkMode: boolean
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onDelete: (id: string) => void
  onOpen: (item: PracticeItem) => void   // ← new
}) {
```

**Update the `onClick` handler** on the item card `div` (the one with `{...handlers}`):

```tsx
onClick={() => {
  if (isBulkMode) {
    onToggleSelect(item.id)
  } else if (translateX === 0) {
    onOpen(item)
  }
}}
```

**Add `openItem` state to `PracticeList`** — after the existing `useState` declarations:

```tsx
const [openItem, setOpenItem] = useState<PracticeItem | null>(null)
```

**Pass `onOpen` to each `SwipeableItem`** in the `filtered.map(...)`:

```tsx
<SwipeableItem
  key={item.id}
  item={item}
  isBulkMode={isBulkMode}
  isSelected={selectedIds.has(item.id)}
  onToggleSelect={handleToggleSelect}
  onDelete={deleteItem}
  onOpen={setOpenItem}   // ← new
/>
```

**Add the type label helper** (add near the top of the file, after `TYPE_DOT_CLASS`):

```tsx
const TYPE_LABEL: Record<AnnotationType, string> = {
  grammar: '🔴 Grammar',
  naturalness: '🟡 Naturalness',
  strength: '🟢 Strength',
}
```

**Add the modal** — inside `PracticeList`'s return, after the `<ul>`:

```tsx
{openItem && (
  <Modal
    title={TYPE_LABEL[openItem.type]}
    onClose={() => setOpenItem(null)}
  >
    <div className="space-y-3 text-sm">
      <div>
        {openItem.correction ? (
          <>
            <span className="line-through text-gray-500">{openItem.original}</span>
            <span className="mx-2 text-gray-500">→</span>
            <span className="font-medium text-green-300">{openItem.correction}</span>
          </>
        ) : (
          <span className="text-green-300">&ldquo;{openItem.original}&rdquo;</span>
        )}
      </div>
      <p className="text-gray-300 leading-relaxed">{openItem.explanation}</p>
    </div>
  </Modal>
)}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```

Expected: All tests pass (existing + new modal tests)

- [ ] **Step 5: Commit**

```bash
git add components/PracticeList.tsx __tests__/components/PracticeList.test.tsx
git commit -m "feat: open modal with annotation details when practice item is tapped"
```

---

## Task 3: Gmail-style sticky bulk action toolbar

**Files:**
- Modify: `components/PracticeList.tsx`
- Modify: `__tests__/components/PracticeList.test.tsx`

Replace the existing text-button toolbar with a `position: sticky` bar using SVG icons. Hide the filter row while bulk mode is active.

---

- [ ] **Step 1: Write the failing tests**

Append to the test file's imports:

```tsx
// No new imports needed
```

Append a new describe block to `__tests__/components/PracticeList.test.tsx`:

```tsx
describe('PracticeList — bulk toolbar', () => {
  it('shows filter buttons when not in bulk mode', () => {
    render(<PracticeList items={[grammarItem]} />)
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /grammar/i })).toBeInTheDocument()
  })

  it('hides filter buttons when in bulk mode', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
    expect(screen.queryByRole('button', { name: /^all$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^grammar$/i })).not.toBeInTheDocument()
  })

  it('shows selected count in bulk mode', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('exits bulk mode when back button is clicked', async () => {
    render(<PracticeList items={[grammarItem]} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /select item/i }))
    await userEvent.click(screen.getByRole('button', { name: /exit selection/i }))
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument()
  })

  it('select-all selects filtered items', async () => {
    render(<PracticeList items={[grammarItem, strengthItem]} />)
    // Enter bulk mode via checkbox on first item
    const checkboxes = screen.getAllByRole('checkbox', { name: /select item/i })
    await userEvent.click(checkboxes[0])
    // Click select-all
    await userEvent.click(screen.getByRole('button', { name: /select all/i }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```

Expected: New toolbar tests fail (no "exit selection" aria-label, filter row not hidden in bulk mode)

- [ ] **Step 3: Refactor the bulk toolbar in PracticeList**

Replace the entire return value of `PracticeList` with the version below. The key changes are:
- Filter row is conditionally rendered (`!isBulkMode`)
- Bulk toolbar is `sticky top-0 z-30`
- Toolbar uses SVG icons with `aria-label` instead of text buttons

```tsx
return (
  <div className="space-y-4">
    {/* Bulk action toolbar — sticky, shown only in bulk mode */}
    {isBulkMode && (
      <div className="sticky top-0 z-30 flex items-center gap-3 px-3 py-2 bg-indigo-950 border border-indigo-800 rounded-xl text-sm">
        {/* Back / exit button */}
        <button
          onClick={exitBulkMode}
          aria-label="Exit selection mode"
          className="text-indigo-300 hover:text-indigo-100 p-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="w-5 h-5" aria-hidden>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <span className="text-indigo-300 text-sm flex-1">{selectedIds.size} selected</span>

        {/* Select all */}
        <button
          onClick={() => setSelectedIds(new Set(filtered.map(i => i.id)))}
          aria-label="Select all"
          className="text-indigo-400 hover:text-indigo-200 p-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="w-5 h-5" aria-hidden>
            <polyline points="9 11 12 14 22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </button>

        {/* Delete */}
        <button
          onClick={deleteSelected}
          aria-label={`Delete ${selectedIds.size} selected items`}
          disabled={selectedIds.size === 0}
          className="text-red-400 hover:text-red-300 disabled:opacity-40 p-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="w-5 h-5" aria-hidden>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    )}

    {/* Filter row — hidden while in bulk mode */}
    {!isBulkMode && (
      <div className="flex gap-2 flex-wrap text-sm">
        {(['all', 'grammar', 'naturalness', 'strength'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-3 py-1 rounded-full border transition-colors capitalize ${
              typeFilter === f
                ? 'border-violet-500 text-violet-300 bg-violet-500/10'
                : 'border-gray-700 text-gray-400'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
    )}

    {filtered.length === 0 && (
      <p className="text-gray-500 text-sm">No items match this filter.</p>
    )}

    <ul className="space-y-2">
      {filtered.map(item => (
        <SwipeableItem
          key={item.id}
          item={item}
          isBulkMode={isBulkMode}
          isSelected={selectedIds.has(item.id)}
          onToggleSelect={handleToggleSelect}
          onDelete={deleteItem}
          onOpen={setOpenItem}
        />
      ))}
    </ul>

    {openItem && (
      <Modal
        title={TYPE_LABEL[openItem.type]}
        onClose={() => setOpenItem(null)}
      >
        <div className="space-y-3 text-sm">
          <div>
            {openItem.correction ? (
              <>
                <span className="line-through text-gray-500">{openItem.original}</span>
                <span className="mx-2 text-gray-500">→</span>
                <span className="font-medium text-green-300">{openItem.correction}</span>
              </>
            ) : (
              <span className="text-green-300">&ldquo;{openItem.original}&rdquo;</span>
            )}
          </div>
          <p className="text-gray-300 leading-relaxed">{openItem.explanation}</p>
        </div>
      </Modal>
    )}
  </div>
)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add components/PracticeList.tsx __tests__/components/PracticeList.test.tsx
git commit -m "feat: sticky Gmail-style bulk action toolbar with SVG icons"
```

---

## Task 4: Two-phase swipe-to-delete animation

**Files:**
- Modify: `components/PracticeList.tsx`
- Modify: `__tests__/components/PracticeList.test.tsx`

Replace the clunky immediate-delete with a two-phase animation (slide left 200ms, then collapse 200ms). Optimistic — fires DELETE in parallel. Shows an inline toast if the DELETE fails.

---

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/components/PracticeList.test.tsx`:

```tsx
describe('PracticeList — swipe delete', () => {
  it('calls DELETE API when onDelete is triggered', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch
    const onDeleted = vi.fn()
    render(<PracticeList items={[grammarItem]} onDeleted={onDeleted} />)

    // Directly trigger the delete by calling the internal mechanism.
    // Since we can't easily simulate a swipe in jsdom, test via the
    // data-testid we'll add to the row.
    const deleteButton = screen.getByTestId(`delete-item-${grammarItem.id}`)
    await userEvent.click(deleteButton)

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/practice-items/${grammarItem.id}`,
      { method: 'DELETE' }
    )
  })

  it('shows error toast when DELETE fails', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    render(<PracticeList items={[grammarItem]} />)

    const deleteButton = screen.getByTestId(`delete-item-${grammarItem.id}`)
    await userEvent.click(deleteButton)

    // Advance timers past the animation (400ms)
    await vi.runAllTimersAsync()

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/couldn't delete/i)).toBeInTheDocument()
    vi.useRealTimers()
  })
})
```

**Note on test strategy:** We use a `data-testid="delete-item-{id}"` attribute on a hidden button inside each `SwipeableItem`. This makes the delete triggerable without simulating a touch swipe (which jsdom doesn't support well). The button is visually hidden (`sr-only`) — it's a test seam only.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```

Expected: FAIL — `delete-item-*` testid not found

- [ ] **Step 3: Implement the two-phase animation in SwipeableItem**

This is the biggest change. Replace the entire `SwipeableItem` component in `components/PracticeList.tsx`:

```tsx
function SwipeableItem({
  item,
  isBulkMode,
  isSelected,
  onToggleSelect,
  onDelete,
  onOpen,
}: {
  item: PracticeItem
  isBulkMode: boolean
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onDelete: (id: string) => Promise<boolean>  // returns true on success
  onOpen: (item: PracticeItem) => void
}) {
  const [translateX, setTranslateX] = useState(0)
  const [rowHeight, setRowHeight] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlers = useSwipeable({
    delta: 10,
    onSwiping: (e) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }
      if (e.dir === 'Left') setTranslateX(-e.absX)
      else setTranslateX(0)
    },
    onSwipedLeft: (e) => {
      if (e.absX > 80) triggerDelete()
      else setTranslateX(0)
    },
    onSwipedRight: () => setTranslateX(0),
    trackMouse: false,
  })

  async function triggerDelete() {
    if (isAnimating || !rowRef.current) return
    setIsAnimating(true)

    // Phase 1: slide item fully off-screen left (200ms)
    setTranslateX(-window.innerWidth)

    // Fire DELETE in parallel — don't await yet
    const deletePromise = onDelete(item.id)

    // Wait for slide-out animation
    await new Promise(r => setTimeout(r, 200))

    // Phase 2: measure then collapse row height (200ms)
    const h = rowRef.current.offsetHeight
    setRowHeight(h)
    // Double rAF: first frame sets the explicit height, second frame triggers the transition to 0
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    setRowHeight(0)

    // Wait for both collapse animation and DELETE to finish
    const [, deleteResult] = await Promise.allSettled([
      new Promise(r => setTimeout(r, 200)),
      deletePromise,
    ])

    if (deleteResult.status === 'rejected') {
      // Restore item on failure
      setRowHeight(null)
      setTranslateX(0)
      setIsAnimating(false)
    }
    // On success: parent removes item from list via onDeleted callback (fired inside onDelete)
  }

  function handleTouchStart() {
    if (isBulkMode) return
    longPressTimer.current = setTimeout(() => {
      onToggleSelect(item.id)
    }, 300)
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  return (
    <li
      ref={rowRef}
      className="relative overflow-hidden rounded-xl"
      style={
        rowHeight !== null
          ? { height: rowHeight, transition: 'height 0.2s ease', overflow: 'hidden' }
          : undefined
      }
    >
      {/* Swipe-to-delete background — no "Delete" text, just red */}
      <div className="absolute inset-0 bg-red-600 rounded-xl" />
      {/* Item card */}
      <div
        {...handlers}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating
            ? 'transform 0.2s ease'
            : translateX === 0
            ? 'transform 0.2s'
            : 'none',
          userSelect: 'none',
          touchAction: 'pan-y',
        }}
        className="relative flex items-center gap-3 px-4 py-3 bg-gray-900 rounded-xl"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (isBulkMode) {
            onToggleSelect(item.id)
          } else if (translateX === 0) {
            onOpen(item)
          }
        }}
      >
        {/* Hidden test seam for triggering delete in tests */}
        <button
          data-testid={`delete-item-${item.id}`}
          className="sr-only"
          onClick={e => { e.stopPropagation(); triggerDelete() }}
          tabIndex={-1}
          aria-hidden
        />
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item.id)}
          onClick={e => e.stopPropagation()}
          className={`w-4 h-4 rounded accent-violet-500 flex-shrink-0 ${isBulkMode ? 'block' : 'hidden sm:block'}`}
          aria-label="Select item"
        />
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${TYPE_DOT_CLASS[item.type]}`} />
        <div className="flex-1 min-w-0 text-sm">
          {item.correction ? (
            <>
              <span className="line-through text-gray-500">{item.original}</span>
              {' → '}
              <span className="font-medium">{item.correction}</span>
            </>
          ) : (
            <span className="text-green-300">&ldquo;{item.original}&rdquo;</span>
          )}
        </div>
      </div>
    </li>
  )
}
```

- [ ] **Step 4: Update deleteItem in PracticeList to match the new signature**

`onDelete` now returns `Promise<boolean>` — `true` on success, and resolves `onDeleted` itself on success.

Replace the `deleteItem` function in `PracticeList`:

```tsx
async function deleteItem(id: string): Promise<boolean> {
  const res = await fetch(`/api/practice-items/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    setToastMessage("Couldn't delete item — try again.")
    return false
  }
  onDeleted?.([id])
  return true
}
```

Note: `onDelete` in `SwipeableItem` now expects `Promise<boolean>` not `Promise<void>`. Update the type in `SwipeableItem` props (already done above in step 3) and the `deleteResult.status === 'rejected'` check:

```tsx
// Replace the deleteResult check at the end of triggerDelete():
const [, deleteResult] = await Promise.allSettled([
  new Promise(r => setTimeout(r, 200)),
  deletePromise,
])

const succeeded = deleteResult.status === 'fulfilled' && deleteResult.value === true

if (!succeeded) {
  setRowHeight(null)
  setTranslateX(0)
  setIsAnimating(false)
}
```

- [ ] **Step 5: Add toast state and rendering to PracticeList**

Add toast state after the other `useState` declarations:

```tsx
const [toastMessage, setToastMessage] = useState<string | null>(null)
```

Add the toast `useEffect` to auto-dismiss after 3 seconds (add inside `PracticeList`, after the state declarations):

```tsx
useEffect(() => {
  if (!toastMessage) return
  const t = setTimeout(() => setToastMessage(null), 3000)
  return () => clearTimeout(t)
}, [toastMessage])
```

Add the toast markup inside the `PracticeList` return, before the closing `</div>`:

```tsx
{toastMessage && (
  <div
    role="alert"
    className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-200 shadow-lg"
  >
    {toastMessage}
  </div>
)}
```

Add `useEffect` to the imports at the top of the file:

```tsx
import { useState, useRef, useEffect } from 'react'
```

Also update `deleteSelected` to show the toast on bulk-delete errors (replace the existing function):

```tsx
async function deleteSelected() {
  const ids = Array.from(selectedIds)
  const results = await Promise.allSettled(
    ids.map(id => fetch(`/api/practice-items/${id}`, { method: 'DELETE' }))
  )
  const succeeded = results
    .map((r, i) => ({ r, id: ids[i] }))
    .filter(({ r }) => r.status === 'fulfilled' && (r as PromiseFulfilledResult<Response>).value.ok)
    .map(({ id }) => id)
  if (succeeded.length < ids.length) {
    setToastMessage("Some items couldn't be deleted — try again.")
  }
  if (succeeded.length > 0) {
    onDeleted?.(succeeded)
  }
  exitBulkMode()
}
```

- [ ] **Step 6: Run all tests**

```bash
npm test -- __tests__/components/PracticeList.test.tsx
```

Expected: All tests pass

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add components/PracticeList.tsx __tests__/components/PracticeList.test.tsx
git commit -m "feat: two-phase swipe-to-delete animation with optimistic delete and error toast"
```

---

## Final Verification

- [ ] **Manual smoke test on mobile (or browser mobile emulation)**

1. Open `http://localhost:3000` with `npm run dev`
2. Navigate to `/practice` — bottom tab bar visible, Practice tab highlighted
3. Swipe a practice item left — it slides off then the row collapses smoothly
4. Tap a practice item — modal opens with annotation details, no action buttons
5. Long-press a practice item — enters bulk mode, filter row hides, sticky toolbar appears at top
6. Scroll down — toolbar stays at top of screen
7. Tap `←` — exits bulk mode, filter row reappears
8. Tap Home/Settings icons in bottom bar — navigates correctly, correct tab highlighted

- [ ] **Final build check**

```bash
npm run build
```

Expected: No TypeScript errors, no lint errors, build succeeds.
