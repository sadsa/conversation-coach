# Readability Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix illegible annotation highlights, add a global font-size settings control, and change the transcript layout to stacked speaker-above-text.

**Architecture:** Override `document.documentElement.style.fontSize` (the `<html>` root font size) so Tailwind's rem-based scale propagates globally with no component changes. A `FontSizeProvider` client component syncs the stored value on mount; an inline `<script>` in `<head>` prevents FOUC. Annotation contrast is fixed by switching from 25%-opacity backgrounds to dark-tinted chips with explicit light text colours.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS (arbitrary value syntax), Vitest + React Testing Library, localStorage.

---

## Chunk 1: Component fixes and font scaling infrastructure

### Task 1: Fix annotation highlight contrast

**Files:**
- Modify: `components/AnnotatedText.tsx`
- Modify: `__tests__/components/AnnotatedText.test.tsx`

- [ ] **Step 1: Add a test asserting the grammar mark carries the new dark-chip classes**

  Open `__tests__/components/AnnotatedText.test.tsx` and add this test inside the `describe` block:

  ```ts
  it('applies dark-chip colour classes to grammar annotations', () => {
    render(<AnnotatedText text={text} annotations={annotations} onAnnotationClick={() => {}} />)
    const mark = screen.getByText('Yo fui')
    expect(mark).toHaveClass('bg-[#3b1a1a]')
    expect(mark).toHaveClass('text-[#fca5a5]')
    expect(mark).toHaveClass('decoration-[#f87171]')
  })
  ```

- [ ] **Step 2: Run the new test to confirm it fails**

  ```bash
  npm test -- __tests__/components/AnnotatedText.test.tsx
  ```

  Expected: the new test FAILS with something like `expected element not to have class bg-[#3b1a1a]`.

- [ ] **Step 3: Update `TYPE_CLASS` in `components/AnnotatedText.tsx`**

  Replace lines 4–8:

  ```ts
  const TYPE_CLASS: Record<string, string> = {
    grammar:     'bg-[#3b1a1a] text-[#fca5a5] decoration-[#f87171]',
    naturalness: 'bg-[#3b2e0a] text-[#fde68a] decoration-[#fbbf24]',
    strength:    'bg-[#0f2e1a] text-[#86efac] decoration-[#4ade80]',
  }
  ```

  Also update the `<mark>` className on line 55 — change `px-0.5` to `px-1`:

  ```tsx
  className={`underline decoration-2 cursor-pointer rounded-sm px-1 ${cls}`}
  ```

- [ ] **Step 4: Run all AnnotatedText tests**

  ```bash
  npm test -- __tests__/components/AnnotatedText.test.tsx
  ```

  Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add components/AnnotatedText.tsx __tests__/components/AnnotatedText.test.tsx
  git commit -m "fix: replace low-contrast annotation highlights with dark-tinted chips"
  ```

---

### Task 2: Stacked transcript layout

**Files:**
- Modify: `components/TranscriptView.tsx`
- Modify: `components/AnnotationCard.tsx`
- Modify: `__tests__/components/TranscriptView.test.tsx`

- [ ] **Step 1: Add a test asserting the speaker label is a `<p>` with `uppercase` class**

  Open `__tests__/components/TranscriptView.test.tsx` and add inside the `describe` block:

  ```ts
  it('renders speaker label as a stacked paragraph above segment text', () => {
    render(
      <TranscriptView segments={segments} annotations={[]} userSpeakerLabels={['A']} {...defaultProps} />
    )
    const label = screen.getByText('You')
    expect(label.tagName).toBe('P')
    expect(label).toHaveClass('uppercase')
  })
  ```

- [ ] **Step 2: Run the new test to confirm it fails**

  ```bash
  npm test -- __tests__/components/TranscriptView.test.tsx
  ```

  Expected: the new test FAILS because the speaker label is currently a `<span>`, not a `<p>`.

- [ ] **Step 3: Update the segment markup in `components/TranscriptView.tsx`**

  Replace the inner `<div key={seg.id}>` block (lines 57–90). The new structure per segment:

  ```tsx
  <div key={seg.id}>
    <div className={!isUser ? 'opacity-40' : ''}>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
        {isUser ? 'You' : 'Them'}
      </p>
      <span className="text-sm leading-relaxed">
        {isUser && (annotationsBySegment[seg.id] ?? []).length > 0 ? (
          <AnnotatedText
            text={seg.text}
            annotations={annotationsBySegment[seg.id] ?? []}
            onAnnotationClick={a => {
              if (filter === 'all' || a.type === filter) {
                setActiveAnnotation(activeAnnotation?.id === a.id ? null : a)
              }
            }}
          />
        ) : (
          seg.text
        )}
      </span>
    </div>
    {activeAnnotation && annotationsBySegment[seg.id]?.find(a => a.id === activeAnnotation.id) && (
      <AnnotationCard
        annotation={activeAnnotation}
        sessionId={sessionId}
        isAdded={addedAnnotationIds.has(activeAnnotation.id)}
        onAnnotationAdded={onAnnotationAdded}
        onClose={() => setActiveAnnotation(null)}
      />
    )}
  </div>
  ```

  Key changes from the original:
  - Outer `flex gap-4` → plain block (no flex class)
  - `opacity-40` moves to the inner wrapper `<div>` (not the outermost `<div key={seg.id}>`, which must always be rendered to show the AnnotationCard)
  - Speaker label: `<span className="text-xs text-gray-500 w-14 text-right pt-0.5 shrink-0">` → `<p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">`
  - Text block `<span className="text-sm leading-relaxed">` stays but is now full-width

  Also update `AnnotationCard` in `components/AnnotationCard.tsx` line 40 — change `ml-6` to `ml-0`:

  ```tsx
  <div className="mt-2 border border-gray-700 rounded-lg p-4 text-sm space-y-2 bg-gray-900">
  ```

- [ ] **Step 4: Run all TranscriptView tests**

  ```bash
  npm test -- __tests__/components/TranscriptView.test.tsx
  ```

  Expected: all 5 tests PASS (the existing `opacity-40` test still passes because the class is still present on the wrapper that contains the segment text).

- [ ] **Step 5: Commit**

  ```bash
  git add components/TranscriptView.tsx components/AnnotationCard.tsx __tests__/components/TranscriptView.test.tsx
  git commit -m "feat: stack transcript speaker label above segment text"
  ```

---

### Task 3: Font scaling infrastructure

**Files:**
- Create: `components/FontSizeProvider.tsx`
- Create: `__tests__/components/FontSizeProvider.test.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Write the failing tests for `FontSizeProvider`**

  Create `__tests__/components/FontSizeProvider.test.tsx`:

  ```ts
  // __tests__/components/FontSizeProvider.test.tsx
  import { describe, it, expect, beforeEach } from 'vitest'
  import { render } from '@testing-library/react'
  import { FontSizeProvider } from '@/components/FontSizeProvider'

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.fontSize = ''
  })

  describe('FontSizeProvider', () => {
    it('applies stored font size to document root on mount', () => {
      localStorage.setItem('fontSize', '20')
      render(<FontSizeProvider />)
      expect(document.documentElement.style.fontSize).toBe('20px')
    })

    it('does nothing when no fontSize is in localStorage', () => {
      render(<FontSizeProvider />)
      expect(document.documentElement.style.fontSize).toBe('')
    })
  })
  ```

- [ ] **Step 2: Run to confirm they fail**

  ```bash
  npm test -- __tests__/components/FontSizeProvider.test.tsx
  ```

  Expected: FAIL — module not found.

- [ ] **Step 3: Create `components/FontSizeProvider.tsx`**

  ```tsx
  // components/FontSizeProvider.tsx
  'use client'
  import { useEffect } from 'react'

  export function FontSizeProvider() {
    useEffect(() => {
      const stored = localStorage.getItem('fontSize')
      if (stored) {
        document.documentElement.style.fontSize = stored + 'px'
      }
    }, [])
    return null
  }
  ```

- [ ] **Step 4: Run FontSizeProvider tests**

  ```bash
  npm test -- __tests__/components/FontSizeProvider.test.tsx
  ```

  Expected: both tests PASS.

- [ ] **Step 5: Update `app/layout.tsx`**

  Add the FOUC-prevention inline script to `<head>`, import and render `FontSizeProvider`, and add the Settings nav link.

  The updated file should look like this:

  ```tsx
  // app/layout.tsx
  import type { Metadata, Viewport } from 'next'
  import { FontSizeProvider } from '@/components/FontSizeProvider'
  import './globals.css'

  export const metadata: Metadata = {
    title: 'Conversation Coach',
    description: 'Analyse your Spanish conversations',
    manifest: '/manifest.json',
  }

  export const viewport: Viewport = {
    themeColor: '#0f0f0f',
  }

  export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
      <html lang="en">
        <head>
          <script dangerouslySetInnerHTML={{ __html: `
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.register('/sw.js').catch(function(err) {
                console.warn('SW registration failed:', err);
              });
            }
          ` }} />
          <script dangerouslySetInnerHTML={{ __html: `
            (function() {
              var s = localStorage.getItem('fontSize');
              if (s) document.documentElement.style.fontSize = s + 'px';
            })();
          ` }} />
        </head>
        <body className="min-h-screen bg-gray-950 text-gray-100">
          <FontSizeProvider />
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
        </body>
      </html>
    )
  }
  ```

- [ ] **Step 6: Verify the build compiles**

  ```bash
  npm run build
  ```

  Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add components/FontSizeProvider.tsx __tests__/components/FontSizeProvider.test.tsx app/layout.tsx
  git commit -m "feat: add font scaling infrastructure with FOUC prevention and Settings nav link"
  ```

---

### Task 4: Settings page

**Files:**
- Create: `app/settings/page.tsx`
- Create: `__tests__/pages/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing tests for the settings page**

  Create `__tests__/pages/SettingsPage.test.tsx`:

  ```ts
  // __tests__/pages/SettingsPage.test.tsx
  import { describe, it, expect, beforeEach } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import SettingsPage from '@/app/settings/page'

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.fontSize = ''
  })

  describe('SettingsPage', () => {
    it('displays the default font size (16px) when nothing is stored', () => {
      render(<SettingsPage />)
      expect(screen.getByText('16px')).toBeInTheDocument()
    })

    it('displays the stored font size on mount', () => {
      localStorage.setItem('fontSize', '20')
      render(<SettingsPage />)
      expect(screen.getByText('20px')).toBeInTheDocument()
    })

    it('increments font size when + is clicked', async () => {
      localStorage.setItem('fontSize', '16')
      render(<SettingsPage />)
      await userEvent.click(screen.getByRole('button', { name: '+' }))
      expect(screen.getByText('18px')).toBeInTheDocument()
      expect(localStorage.getItem('fontSize')).toBe('18')
      expect(document.documentElement.style.fontSize).toBe('18px')
    })

    it('decrements font size when − is clicked', async () => {
      localStorage.setItem('fontSize', '16')
      render(<SettingsPage />)
      await userEvent.click(screen.getByRole('button', { name: '−' }))
      expect(screen.getByText('14px')).toBeInTheDocument()
      expect(localStorage.getItem('fontSize')).toBe('14')
      expect(document.documentElement.style.fontSize).toBe('14px')
    })

    it('disables the − button at the minimum size (14)', () => {
      localStorage.setItem('fontSize', '14')
      render(<SettingsPage />)
      expect(screen.getByRole('button', { name: '−' })).toBeDisabled()
    })

    it('disables the + button at the maximum size (22)', () => {
      localStorage.setItem('fontSize', '22')
      render(<SettingsPage />)
      expect(screen.getByRole('button', { name: '+' })).toBeDisabled()
    })

    it('renders a preview section', () => {
      render(<SettingsPage />)
      expect(screen.getByText(/Hoy fui al mercado/)).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run to confirm they fail**

  ```bash
  npm test -- __tests__/pages/SettingsPage.test.tsx
  ```

  Expected: FAIL — module not found.

- [ ] **Step 3: Create `app/settings/page.tsx`**

  ```tsx
  // app/settings/page.tsx
  'use client'
  import { useState } from 'react'

  const MIN = 14
  const MAX = 22
  const STEP = 2
  const KEY = 'fontSize'

  export default function SettingsPage() {
    const [size, setSize] = useState<number>(() => {
      if (typeof window === 'undefined') return 16
      return parseInt(localStorage.getItem(KEY) ?? '16', 10)
    })

    function apply(newSize: number) {
      setSize(newSize)
      document.documentElement.style.fontSize = newSize + 'px'
      localStorage.setItem(KEY, String(newSize))
    }

    return (
      <div className="space-y-8 max-w-sm">
        <h1 className="text-2xl font-semibold">Settings</h1>

        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Text Size</h2>

          <div className="flex items-center gap-4">
            <button
              onClick={() => apply(size - STEP)}
              disabled={size <= MIN}
              aria-label="−"
              className="w-9 h-9 rounded border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              −
            </button>
            <span className="text-base font-mono w-12 text-center">{size}px</span>
            <button
              onClick={() => apply(size + STEP)}
              disabled={size >= MAX}
              aria-label="+"
              className="w-9 h-9 rounded border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              +
            </button>
          </div>

          <div className="mt-4 border border-gray-800 rounded-lg p-4 space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Preview</p>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">You</p>
              <span className="text-sm leading-relaxed">
                Hoy fui al mercado y compré muchas cosas para la semana.
              </span>
            </div>
            <div className="opacity-40">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Them</p>
              <span className="text-sm leading-relaxed">¿Y qué compraste?</span>
            </div>
          </div>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 4: Run the settings page tests**

  ```bash
  npm test -- __tests__/pages/SettingsPage.test.tsx
  ```

  Expected: all 7 tests PASS.

- [ ] **Step 5: Run the full test suite**

  ```bash
  npm test
  ```

  Expected: all tests PASS with no regressions.

- [ ] **Step 6: Commit**

  ```bash
  git add app/settings/page.tsx __tests__/pages/SettingsPage.test.tsx
  git commit -m "feat: add settings page with global font size control"
  ```

---

## Verification

After all tasks are complete, do a quick manual smoke test:

1. `npm run dev`
2. Open the app — nav should show Settings link
3. Open `/settings` — +/− buttons should change the font size live across the page
4. Refresh the page — font size should be restored (no FOUC)
5. Open a session transcript — speaker labels should appear above text, annotation chips should be readable dark-tinted chips
