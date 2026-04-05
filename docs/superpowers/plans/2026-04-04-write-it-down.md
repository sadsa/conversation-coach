# Write It Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate "Add to Practice" behind a bottom sheet that prompts the user to write the correction on paper before the flashcard is saved.

**Architecture:** A new `WriteItDownSheet` component (modelled on `ExplainSheet`) is rendered inside `AnnotationCard`. Clicking "Add to Practice" opens the sheet instead of immediately POSTing; the existing fetch logic moves into the sheet's `onConfirm` callback. New i18n keys are added to `lib/i18n.ts` for both `en` and `es`.

**Tech Stack:** React, framer-motion (AnimatePresence + motion.div), Vitest + React Testing Library, existing i18n system (`lib/i18n.ts` + `useTranslation`)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/i18n.ts` | Modify | Add `writeItDown.*` translation keys for `en` and `es` |
| `components/WriteItDownSheet.tsx` | Create | Bottom sheet UI: correction display, 3 writing prompts, checkbox, confirm button, 1.5s auto-close |
| `components/AnnotationCard.tsx` | Modify | Open sheet on tap instead of calling fetch directly; sheet's `onConfirm` does the fetch |
| `__tests__/components/WriteItDownSheet.test.tsx` | Create | Unit tests for the new component |
| `__tests__/components/AnnotationCard.test.tsx` | Modify | Update add-flow tests to go through the sheet; add sheet-opens test |

---

## Task 1: Add i18n keys

**Files:**
- Modify: `lib/i18n.ts`

- [ ] **Step 1: Add English keys to `lib/i18n.ts`**

In the `en` block, after the `// Annotation card` section, add:

```ts
    // Write it down sheet
    'writeItDown.title': 'Write it down first',
    'writeItDown.subtitle': 'Reinforce before it becomes a flashcard',
    'writeItDown.promptsLabel': 'Write it 3 ways on paper',
    'writeItDown.prompt1': "A sentence you'd actually say to someone",
    'writeItDown.prompt2': 'As a question using voseo',
    'writeItDown.prompt3': 'Using a past or future tense',
    'writeItDown.checkboxLabel': "I've written it down on paper",
    'writeItDown.confirmLabel': 'Create flashcard',
    'writeItDown.successLabel': 'Flashcard created ✓',
```

- [ ] **Step 2: Add Spanish keys to `lib/i18n.ts`**

In the `es` block, after the `// Annotation card` section, add:

```ts
    // Write it down sheet
    'writeItDown.title': 'Escribilo primero',
    'writeItDown.subtitle': 'Reforzá antes de que se convierta en tarjeta',
    'writeItDown.promptsLabel': 'Escribilo de 3 maneras en papel',
    'writeItDown.prompt1': 'Una oración que realmente le dirías a alguien',
    'writeItDown.prompt2': 'Como pregunta usando voseo',
    'writeItDown.prompt3': 'Usando un tiempo pasado o futuro',
    'writeItDown.checkboxLabel': 'Lo escribí en papel',
    'writeItDown.confirmLabel': 'Crear tarjeta',
    'writeItDown.successLabel': 'Tarjeta creada ✓',
```

- [ ] **Step 3: Commit**

```bash
git add lib/i18n.ts
git commit -m "feat: add writeItDown i18n keys (en + es)"
```

---

## Task 2: Create `WriteItDownSheet` component (TDD)

**Files:**
- Create: `__tests__/components/WriteItDownSheet.test.tsx`
- Create: `components/WriteItDownSheet.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/components/WriteItDownSheet.test.tsx`:

```tsx
// __tests__/components/WriteItDownSheet.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WriteItDownSheet } from '@/components/WriteItDownSheet'
import type { Annotation } from '@/lib/types'
import React from 'react'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onDragEnd, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
      React.createElement('div', { ...rest }, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const annotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'fui', start_char: 0, end_char: 3,
  correction: 'anduve', explanation: 'Use "andar" when moving around on foot.',
  sub_category: 'verb-conjugation',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
}

const defaultProps = {
  isOpen: true,
  annotation,
  onConfirm: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
}

beforeEach(() => vi.resetAllMocks())

describe('WriteItDownSheet', () => {
  it('renders nothing when isOpen is false', () => {
    render(<WriteItDownSheet {...defaultProps} isOpen={false} />)
    expect(screen.queryByTestId('write-it-down-sheet')).not.toBeInTheDocument()
  })

  it('renders sheet when isOpen is true', () => {
    render(<WriteItDownSheet {...defaultProps} />)
    expect(screen.getByTestId('write-it-down-sheet')).toBeInTheDocument()
  })

  it('shows original and correction', () => {
    render(<WriteItDownSheet {...defaultProps} />)
    expect(screen.getByText('fui')).toBeInTheDocument()
    expect(screen.getByText('anduve')).toBeInTheDocument()
  })

  it('shows explanation text', () => {
    render(<WriteItDownSheet {...defaultProps} />)
    expect(screen.getByText('Use "andar" when moving around on foot.')).toBeInTheDocument()
  })

  it('shows all 3 writing prompts', () => {
    render(<WriteItDownSheet {...defaultProps} />)
    expect(screen.getByText(/sentence you'd actually say/i)).toBeInTheDocument()
    expect(screen.getByText(/question using voseo/i)).toBeInTheDocument()
    expect(screen.getByText(/past or future tense/i)).toBeInTheDocument()
  })

  it('confirm button is disabled before checkbox is ticked', () => {
    render(<WriteItDownSheet {...defaultProps} />)
    expect(screen.getByTestId('write-it-down-confirm')).toBeDisabled()
  })

  it('confirm button is enabled after checkbox is ticked', async () => {
    render(<WriteItDownSheet {...defaultProps} />)
    await userEvent.click(screen.getByTestId('write-it-down-checkbox'))
    expect(screen.getByTestId('write-it-down-confirm')).not.toBeDisabled()
  })

  it('calls onConfirm and shows success label when confirmed', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<WriteItDownSheet {...defaultProps} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByTestId('write-it-down-checkbox'))
    await userEvent.click(screen.getByTestId('write-it-down-confirm'))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(screen.getByTestId('write-it-down-confirm')).toHaveTextContent(/flashcard created/i)
  })

  it('calls onClose after 1500ms following confirm', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<WriteItDownSheet {...defaultProps} onClose={onClose} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByTestId('write-it-down-checkbox'))
    await userEvent.click(screen.getByTestId('write-it-down-confirm'))
    expect(onClose).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(1500) })
    expect(onClose).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(<WriteItDownSheet {...defaultProps} onClose={onClose} />)
    await userEvent.click(screen.getByTestId('write-it-down-backdrop'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('resets checked and success state when reopened', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<WriteItDownSheet {...defaultProps} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByTestId('write-it-down-checkbox'))
    // Close then reopen
    rerender(<WriteItDownSheet {...defaultProps} onConfirm={onConfirm} isOpen={false} />)
    rerender(<WriteItDownSheet {...defaultProps} onConfirm={onConfirm} isOpen={true} />)
    expect(screen.getByTestId('write-it-down-confirm')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- __tests__/components/WriteItDownSheet.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/WriteItDownSheet'`

- [ ] **Step 3: Create `components/WriteItDownSheet.tsx`**

```tsx
// components/WriteItDownSheet.tsx
'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Annotation } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'

interface Props {
  isOpen: boolean
  annotation: Annotation
  onConfirm: () => Promise<void>
  onClose: () => void
}

const PROMPT_KEYS = [
  'writeItDown.prompt1',
  'writeItDown.prompt2',
  'writeItDown.prompt3',
] as const

export function WriteItDownSheet({ isOpen, annotation, onConfirm, onClose }: Props) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setChecked(false)
      setSuccess(false)
    }
  }, [isOpen])

  async function handleConfirm() {
    try {
      await onConfirm()
      setSuccess(true)
      setTimeout(onClose, 1500)
    } catch {
      // onConfirm failed — keep sheet open so user can try again
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            data-testid="write-it-down-backdrop"
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            data-testid="write-it-down-sheet"
            className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border border-gray-800 rounded-t-2xl px-5 pb-10 pt-4"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            dragDirectionLock
            style={{ touchAction: 'none' }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80) onClose()
            }}
          >
            <div className="w-9 h-1 bg-gray-700 rounded-full mx-auto mb-5" />

            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-800">
              <span className="text-lg" aria-hidden="true">✏️</span>
              <div>
                <p className="text-base font-bold text-white">{t('writeItDown.title')}</p>
                <p className="text-xs text-gray-500">{t('writeItDown.subtitle')}</p>
              </div>
            </div>

            <div className="bg-gray-950 rounded-xl px-4 py-3 mb-4">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="bg-[#3b1a1a] text-[#fca5a5] px-2 py-0.5 rounded text-sm">
                  {annotation.original}
                </span>
                <span className="text-gray-500 text-sm">→</span>
                <span className="font-semibold text-[#86efac]">{annotation.correction}</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{annotation.explanation}</p>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              {t('writeItDown.promptsLabel')}
            </p>
            <ul className="space-y-2 mb-4">
              {PROMPT_KEYS.map((key, i) => (
                <li
                  key={key}
                  className="flex items-start gap-2 bg-gray-950 rounded-lg px-3 py-2 text-sm text-gray-300"
                >
                  <span className="text-indigo-400 font-bold text-xs mt-0.5" aria-hidden="true">
                    {i + 1}
                  </span>
                  {t(key)}
                </li>
              ))}
            </ul>

            <button
              data-testid="write-it-down-checkbox"
              onClick={() => setChecked(c => !c)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl mb-4 border transition-colors ${
                checked ? 'border-indigo-600 bg-indigo-950/30' : 'border-gray-700 bg-gray-950'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  checked ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600'
                }`}
              >
                {checked && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-gray-300">{t('writeItDown.checkboxLabel')}</span>
            </button>

            <button
              data-testid="write-it-down-confirm"
              disabled={!checked || success}
              onClick={handleConfirm}
              className={`w-full py-4 rounded-xl font-semibold text-base transition-colors ${
                success
                  ? 'bg-green-900 text-green-300'
                  : checked
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              {success ? t('writeItDown.successLabel') : t('writeItDown.confirmLabel')}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- __tests__/components/WriteItDownSheet.test.tsx
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/WriteItDownSheet.tsx __tests__/components/WriteItDownSheet.test.tsx
git commit -m "feat: add WriteItDownSheet component"
```

---

## Task 3: Update `AnnotationCard` to open the sheet

**Files:**
- Modify: `components/AnnotationCard.tsx`
- Modify: `__tests__/components/AnnotationCard.test.tsx`

- [ ] **Step 1: Update `AnnotationCard.tsx`**

Replace the entire file content with:

```tsx
// components/AnnotationCard.tsx
'use client'
import { useState } from 'react'
import type { Annotation } from '@/lib/types'
import { useTranslation } from '@/components/LanguageProvider'
import { WriteItDownSheet } from '@/components/WriteItDownSheet'

interface Props {
  annotation: Annotation
  sessionId: string
  practiceItemId: string | null
  onAnnotationAdded: (annotationId: string, practiceItemId: string) => void
  onAnnotationRemoved: (annotationId: string) => void
}

export function AnnotationCard({ annotation, sessionId, practiceItemId: initialPracticeItemId, onAnnotationAdded, onAnnotationRemoved }: Props) {
  const { t } = useTranslation()
  const [practiceItemId, setPracticeItemId] = useState<string | null>(initialPracticeItemId)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  async function handleSave() {
    const res = await fetch('/api/practice-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        annotation_id: annotation.id,
        type: annotation.type,
        original: annotation.original,
        correction: annotation.correction,
        explanation: annotation.explanation,
        sub_category: annotation.sub_category,
        flashcard_front: annotation.flashcard_front ?? null,
        flashcard_back: annotation.flashcard_back ?? null,
        flashcard_note: annotation.flashcard_note ?? null,
      }),
    })
    if (res.ok) {
      const { id } = await res.json() as { id: string }
      setPracticeItemId(id)
      onAnnotationAdded(annotation.id, id)
    } else {
      throw new Error('Failed to add practice item')
    }
  }

  async function handleRemove() {
    const res = await fetch(`/api/practice-items/${practiceItemId}`, { method: 'DELETE' })
    if (res.ok) {
      setPracticeItemId(null)
      onAnnotationRemoved(annotation.id)
    } else {
      console.error('Failed to remove practice item')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-base">
        <>
          <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
            {annotation.original}
          </span>
          {' → '}
          <span className="font-semibold text-lg text-[#86efac]">
            {annotation.correction}
          </span>
        </>
      </p>
      <p className="text-sm text-gray-400 leading-relaxed">{annotation.explanation}</p>
      <span className="border border-indigo-800 text-indigo-400 bg-indigo-950 rounded-full px-2 py-0.5 text-xs">
        {t(`subCat.${annotation.sub_category}`)}
      </span>
      {practiceItemId ? (
        <button
          onClick={handleRemove}
          className="w-full py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm text-gray-400 transition-colors"
        >
          {t('annotation.addedToPractice')}
        </button>
      ) : (
        <button
          onClick={() => setIsSheetOpen(true)}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-base font-semibold text-white transition-colors"
        >
          {t('annotation.addToPractice')}
        </button>
      )}
      <WriteItDownSheet
        isOpen={isSheetOpen}
        annotation={annotation}
        onConfirm={handleSave}
        onClose={() => setIsSheetOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Run existing AnnotationCard tests to see which ones break**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx
```

Expected: Several tests FAIL — the add-flow tests click "Add to Practice" but now get a sheet instead of a direct fetch.

- [ ] **Step 3: Update `__tests__/components/AnnotationCard.test.tsx`**

Replace the entire file with:

```tsx
// __tests__/components/AnnotationCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnnotationCard } from '@/components/AnnotationCard'
import type { Annotation } from '@/lib/types'
import React from 'react'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onDragEnd, ...rest }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) =>
      React.createElement('div', { ...rest }, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const grammarAnnotation: Annotation = {
  id: 'ann-1', session_id: 's1', segment_id: 'seg-1',
  type: 'grammar', original: 'Yo fui', start_char: 0, end_char: 6,
  correction: 'Fui', explanation: 'Drop the subject pronoun.', sub_category: 'subjunctive',
  flashcard_front: null, flashcard_back: null, flashcard_note: null,
}

const defaultProps = {
  sessionId: 's1',
  practiceItemId: null,
  onAnnotationAdded: vi.fn(),
  onAnnotationRemoved: vi.fn(),
}

beforeEach(() => {
  vi.resetAllMocks()
})

// Helper: click "Add to Practice", tick checkbox, click confirm
async function addViaSheet() {
  await userEvent.click(screen.getByRole('button', { name: /add to practice list/i }))
  await userEvent.click(screen.getByTestId('write-it-down-checkbox'))
  await userEvent.click(screen.getByTestId('write-it-down-confirm'))
}

describe('AnnotationCard', () => {
  it('renders correction for grammar annotation', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.getByText('Fui')).toBeInTheDocument()
    expect(screen.getByText('Yo fui')).toBeInTheDocument()
    expect(screen.getByText('Drop the subject pronoun.')).toBeInTheDocument()
  })

  it('shows muted "Added" button when practiceItemId is set', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} practiceItemId="pi-1" />)
    const btn = screen.getByRole('button', { name: /added to practice/i })
    expect(btn).not.toBeDisabled()
    expect(btn).toHaveClass('bg-gray-700')
  })

  it('shows indigo "Add" button when practiceItemId is null', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    const btn = screen.getByRole('button', { name: /add to practice list/i })
    expect(btn).toHaveClass('bg-indigo-600')
  })

  it('opens WriteItDownSheet when "Add to Practice" is clicked', async () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.queryByTestId('write-it-down-sheet')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /add to practice list/i }))
    expect(screen.getByTestId('write-it-down-sheet')).toBeInTheDocument()
  })

  it('calls POST and onAnnotationAdded with both ids on successful add', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'pi-1' }),
    } as Response)
    const onAnnotationAdded = vi.fn()
    render(
      <AnnotationCard
        annotation={grammarAnnotation}
        {...defaultProps}
        onAnnotationAdded={onAnnotationAdded}
      />
    )
    await addViaSheet()
    expect(fetchSpy).toHaveBeenCalledWith('/api/practice-items', expect.objectContaining({ method: 'POST' }))
    expect(onAnnotationAdded).toHaveBeenCalledWith('ann-1', 'pi-1')
    expect(screen.getByRole('button', { name: /added to practice/i })).toBeInTheDocument()
  })

  it('leaves add button visible on POST failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await addViaSheet()
    expect(screen.getByRole('button', { name: /add to practice list/i })).toBeInTheDocument()
  })

  it('calls DELETE and onAnnotationRemoved on remove', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true } as Response)
    const onAnnotationRemoved = vi.fn()
    render(
      <AnnotationCard
        annotation={grammarAnnotation}
        {...defaultProps}
        practiceItemId="pi-1"
        onAnnotationRemoved={onAnnotationRemoved}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: /added to practice/i }))
    expect(fetchSpy).toHaveBeenCalledWith('/api/practice-items/pi-1', expect.objectContaining({ method: 'DELETE' }))
    expect(onAnnotationRemoved).toHaveBeenCalledWith('ann-1')
    expect(screen.getByRole('button', { name: /add to practice list/i })).toBeInTheDocument()
  })

  it('keeps added button on DELETE failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as Response)
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} practiceItemId="pi-1" />)
    await userEvent.click(screen.getByRole('button', { name: /added to practice/i }))
    expect(screen.getByRole('button', { name: /added to practice/i })).toBeInTheDocument()
  })

  it('renders sub-category pill', () => {
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    expect(screen.getByText('Subjunctive')).toBeInTheDocument()
  })

  it('includes sub_category in POST body when adding to practice', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await addViaSheet()
    expect(capturedBody.sub_category).toBe('subjunctive')
  })

  it('includes flashcard fields in POST body when annotation has them', async () => {
    const annotationWithFlashcard: Annotation = {
      ...grammarAnnotation,
      flashcard_front: 'I [[went]] to the market.',
      flashcard_back: '[[Fui]] al mercado.',
      flashcard_note: 'Subject pronouns are dropped in Rioplatense.',
    }
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={annotationWithFlashcard} {...defaultProps} />)
    await addViaSheet()
    expect(capturedBody.flashcard_front).toBe('I [[went]] to the market.')
    expect(capturedBody.flashcard_back).toBe('[[Fui]] al mercado.')
    expect(capturedBody.flashcard_note).toBe('Subject pronouns are dropped in Rioplatense.')
  })

  it('sends null flashcard fields when annotation has none', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.spyOn(global, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string)
      return { ok: true, json: () => Promise.resolve({ id: 'pi-1' }) } as Response
    })
    render(<AnnotationCard annotation={grammarAnnotation} {...defaultProps} />)
    await addViaSheet()
    expect(capturedBody.flashcard_front).toBeNull()
    expect(capturedBody.flashcard_back).toBeNull()
    expect(capturedBody.flashcard_note).toBeNull()
  })
})
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
npm test -- __tests__/components/AnnotationCard.test.tsx __tests__/components/WriteItDownSheet.test.tsx
```

Expected: All tests PASS

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npm test
```

Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add components/AnnotationCard.tsx __tests__/components/AnnotationCard.test.tsx
git commit -m "feat: gate Add to Practice behind WriteItDownSheet"
```
