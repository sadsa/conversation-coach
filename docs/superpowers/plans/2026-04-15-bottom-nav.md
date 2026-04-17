# Bottom Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-tab bottom navigation bar (Home + Practice) visible on all authenticated pages, sitting beneath the existing hamburger drawer.

**Architecture:** New `BottomNav` client component wired into `ConditionalNav` alongside `AppHeader`/`NavDrawer`. `ConditionalNav`'s existing `HIDDEN_ON` exclusion applies automatically. Z-index layering (`BottomNav: z-30`, drawer backdrop/header: `z-40`, drawer panel: `z-50`) ensures the drawer slides over without conflict.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library

---

### Task 1: Create BottomNav component (TDD)

**Files:**
- Create: `__tests__/components/BottomNav.test.tsx`
- Create: `components/BottomNav.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/BottomNav.test.tsx`:

```tsx
// __tests__/components/BottomNav.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BottomNav } from '@/components/BottomNav'
import { LanguageProvider } from '@/components/LanguageProvider'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

import { usePathname } from 'next/navigation'
const mockPathname = usePathname as ReturnType<typeof vi.fn>

function wrap() {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <BottomNav />
    </LanguageProvider>
  )
}

describe('BottomNav', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockPathname.mockReturnValue('/')
  })

  it('renders Home and Practice tabs', () => {
    wrap()
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /practice/i })).toBeInTheDocument()
  })

  it('does not render Insights or Settings tabs', () => {
    wrap()
    expect(screen.queryByRole('link', { name: /insights/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument()
  })

  it('marks Home active on "/"', () => {
    mockPathname.mockReturnValue('/')
    wrap()
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /practice/i })).not.toHaveAttribute('aria-current')
  })

  it('does NOT mark Home active on "/practice"', () => {
    mockPathname.mockReturnValue('/practice')
    wrap()
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
  })

  it('marks Practice active on "/practice"', () => {
    mockPathname.mockReturnValue('/practice')
    wrap()
    expect(screen.getByRole('link', { name: /practice/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks Practice active on a sub-route like "/practice/something"', () => {
    mockPathname.mockReturnValue('/practice/something')
    wrap()
    expect(screen.getByRole('link', { name: /practice/i })).toHaveAttribute('aria-current', 'page')
  })

  it('marks neither tab active on "/settings"', () => {
    mockPathname.mockReturnValue('/settings')
    wrap()
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /practice/i })).not.toHaveAttribute('aria-current')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

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
import { useTranslation } from '@/components/LanguageProvider'

const TABS = [
  {
    href: '/',
    labelKey: 'nav.home',
    exact: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-6 h-6" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/practice',
    labelKey: 'nav.practice',
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-6 h-6" aria-hidden="true">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
]

export function BottomNav() {
  const pathname = usePathname()
  const { t } = useTranslation()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border-subtle"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Quick navigation"
    >
      <div className="flex h-16 max-w-4xl mx-auto">
        {TABS.map(tab => {
          const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={t(tab.labelKey)}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                active ? 'text-indigo-400' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {tab.icon}
              <span className="text-xs font-medium">{t(tab.labelKey)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- __tests__/components/BottomNav.test.tsx
```

Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/BottomNav.tsx __tests__/components/BottomNav.test.tsx
git commit -m "feat: add BottomNav component with Home and Practice tabs"
```

---

### Task 2: Wire BottomNav into ConditionalNav

**Files:**
- Modify: `components/ConditionalNav.tsx`
- Modify: `__tests__/components/ConditionalNav.test.tsx`

- [ ] **Step 1: Add a test asserting BottomNav renders on authenticated routes**

Open `__tests__/components/ConditionalNav.test.tsx` and add two tests inside the existing `describe('ConditionalNav', ...)` block:

```tsx
  it('renders the bottom nav on "/"', () => {
    mockPathname.mockReturnValue('/')
    wrap()
    expect(screen.getByRole('navigation', { name: /quick navigation/i })).toBeInTheDocument()
  })

  it('does not render the bottom nav on "/login"', () => {
    mockPathname.mockReturnValue('/login')
    const { container } = wrap()
    expect(container.firstChild).toBeNull()
  })
```

Also add `LanguageProvider` to the `wrap()` helper — update it to:

```tsx
function wrap() {
  return render(
    <LanguageProvider initialTargetLanguage="es-AR">
      <ThemeProvider><ConditionalNav /></ThemeProvider>
    </LanguageProvider>
  )
}
```

And add the import at the top of the file:

```tsx
import { LanguageProvider } from '@/components/LanguageProvider'
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
npm test -- __tests__/components/ConditionalNav.test.tsx
```

Expected: the two new tests FAIL (no `quick navigation` nav found)

- [ ] **Step 3: Update ConditionalNav to render BottomNav**

Replace the contents of `components/ConditionalNav.tsx` with:

```tsx
// components/ConditionalNav.tsx
'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { NavDrawer } from '@/components/NavDrawer'
import { BottomNav } from '@/components/BottomNav'

const HIDDEN_ON = ['/login', '/access-denied', '/onboarding']

export function ConditionalNav() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  return (
    <>
      <AppHeader isOpen={isOpen} onOpen={() => setIsOpen(true)} />
      <NavDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
      <BottomNav />
    </>
  )
}
```

- [ ] **Step 4: Run the full ConditionalNav test suite to verify all tests pass**

```bash
npm test -- __tests__/components/ConditionalNav.test.tsx
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/ConditionalNav.tsx __tests__/components/ConditionalNav.test.tsx
git commit -m "feat: wire BottomNav into ConditionalNav"
```

---

### Task 3: Bump layout bottom padding to clear the bar

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update the main element padding**

In `app/layout.tsx`, change line 55 from:

```tsx
<main className="max-w-4xl mx-auto px-6 mt-11 pt-8 pb-8">{children}</main>
```

to:

```tsx
<main className="max-w-4xl mx-auto px-6 mt-11 pt-8 pb-20">{children}</main>
```

- [ ] **Step 2: Run the full test suite to check nothing is broken**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "chore: increase layout bottom padding to clear bottom nav bar"
```
