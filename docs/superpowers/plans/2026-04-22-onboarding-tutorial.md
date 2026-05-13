# Onboarding Tutorial Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/onboarding` into a mandatory 3-step tutorial wizard (Welcome → Upload → Share from WhatsApp) shown after language selection, with a revisit entry point in Settings and a quiet link in the dashboard empty-state.

**Architecture:** `useSearchParams` drives which step renders inside a single `Suspense`-wrapped client component in `app/onboarding/page.tsx`. Steps 1–3 share a new `OnboardingStep` shell component. A `revisit=true` query param skips the language step and routes back to `/settings` on completion.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library, `lib/i18n.ts` for all copy.

---

## File Map

| Action | File |
|--------|------|
| Modify | `lib/i18n.ts` |
| Create | `components/OnboardingStep.tsx` |
| Rewrite | `app/onboarding/page.tsx` |
| Modify | `components/DashboardOnboarding.tsx` |
| Modify | `app/settings/page.tsx` |
| Modify | `__tests__/lib/i18n.test.ts` |
| Create | `__tests__/components/OnboardingStep.test.tsx` |
| Rewrite | `__tests__/pages/OnboardingPage.test.tsx` |
| Create | `__tests__/components/DashboardOnboarding.test.tsx` |
| Modify | `__tests__/pages/SettingsPage.test.tsx` |

---

## Task 1: i18n keys

**Files:**
- Modify: `lib/i18n.ts` (EN block ~line 362, ES block ~line 722)
- Modify: `__tests__/lib/i18n.test.ts`

- [ ] **Step 1: Write failing i18n tests**

Add a new `describe` block at the end of `__tests__/lib/i18n.test.ts`:

```ts
describe('onboarding tutorial i18n keys', () => {
  it('onboarding.step1.heading exists in both langs', () => {
    expect(t('onboarding.step1.heading', 'en')).not.toBe('onboarding.step1.heading')
    expect(t('onboarding.step1.heading', 'es')).not.toBe('onboarding.step1.heading')
  })
  it('onboarding.step2.heading exists in both langs', () => {
    expect(t('onboarding.step2.heading', 'en')).not.toBe('onboarding.step2.heading')
    expect(t('onboarding.step2.heading', 'es')).not.toBe('onboarding.step2.heading')
  })
  it('onboarding.step3.heading exists in both langs', () => {
    expect(t('onboarding.step3.heading', 'en')).not.toBe('onboarding.step3.heading')
    expect(t('onboarding.step3.heading', 'es')).not.toBe('onboarding.step3.heading')
  })
  it('onboarding.cta.next exists in both langs', () => {
    expect(t('onboarding.cta.next', 'en')).not.toBe('onboarding.cta.next')
    expect(t('onboarding.cta.next', 'es')).not.toBe('onboarding.cta.next')
  })
  it('onboarding.cta.letsGo exists in both langs', () => {
    expect(t('onboarding.cta.letsGo', 'en')).not.toBe('onboarding.cta.letsGo')
    expect(t('onboarding.cta.letsGo', 'es')).not.toBe('onboarding.cta.letsGo')
  })
  it('onboarding.cta.done exists in both langs', () => {
    expect(t('onboarding.cta.done', 'en')).not.toBe('onboarding.cta.done')
    expect(t('onboarding.cta.done', 'es')).not.toBe('onboarding.cta.done')
  })
  it('onboarding.revisitLink exists in both langs', () => {
    expect(t('onboarding.revisitLink', 'en')).not.toBe('onboarding.revisitLink')
    expect(t('onboarding.revisitLink', 'es')).not.toBe('onboarding.revisitLink')
  })
  it('settings.help exists in both langs', () => {
    expect(t('settings.help', 'en')).not.toBe('settings.help')
    expect(t('settings.help', 'es')).not.toBe('settings.help')
  })
  it('settings.howToUpload exists in both langs', () => {
    expect(t('settings.howToUpload', 'en')).not.toBe('settings.howToUpload')
    expect(t('settings.howToUpload', 'es')).not.toBe('settings.howToUpload')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/lib/i18n.test.ts
```

Expected: 9 failures in the new `describe` block.

- [ ] **Step 3: Add EN keys to `lib/i18n.ts`**

In the EN block, after the line `'settings.version': 'Version',` (~line 362), add:

```ts
    // Onboarding tutorial
    'onboarding.step1.heading': "Here's how it works",
    'onboarding.step1.body': 'Record a conversation in Spanish, upload it here, and get gentle corrections on your speech. Save the ones worth remembering and write them down.',
    'onboarding.step2.heading': 'Upload a recording',
    'onboarding.step2.body': 'After a conversation, tap Upload audio to pick the file from your phone. It gets transcribed automatically — no extra steps.',
    'onboarding.step3.heading': 'Or share from WhatsApp',
    'onboarding.step3.body': 'Got a voice note in WhatsApp? Hold it, tap Share, then choose Conversation Coach. The audio uploads instantly.',
    'onboarding.cta.next': 'Next →',
    'onboarding.cta.letsGo': "Let's go →",
    'onboarding.cta.done': 'Done',
    'onboarding.revisitLink': 'Revisit tutorial →',
    'settings.help': 'Help',
    'settings.howToUpload': 'How to upload audio',
```

- [ ] **Step 4: Add ES-AR keys to `lib/i18n.ts`**

In the ES block, after the line `'settings.version': 'Versión',` (~line 722), add:

```ts
    // Onboarding tutorial
    'onboarding.step1.heading': 'Así funciona',
    'onboarding.step1.body': 'Grabá una conversación en español, subila acá y recibí correcciones suaves sobre tu habla. Guardá las que valgan la pena y anotalas.',
    'onboarding.step2.heading': 'Subí una grabación',
    'onboarding.step2.body': 'Después de una conversación, tocá Subir audio para elegir el archivo desde tu celular. Se transcribe automáticamente — sin pasos extra.',
    'onboarding.step3.heading': 'O compartí desde WhatsApp',
    'onboarding.step3.body': '¿Tenés una nota de voz en WhatsApp? Mantenéla presionada, tocá Compartir y elegí Conversation Coach. El audio se sube al instante.',
    'onboarding.cta.next': 'Siguiente →',
    'onboarding.cta.letsGo': '¡Vamos! →',
    'onboarding.cta.done': 'Listo',
    'onboarding.revisitLink': 'Ver tutorial otra vez →',
    'settings.help': 'Ayuda',
    'settings.howToUpload': 'Cómo subir audio',
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- __tests__/lib/i18n.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/i18n.ts __tests__/lib/i18n.test.ts
git commit -m "feat(i18n): add onboarding tutorial and settings help keys (EN + ES-AR)"
```

---

## Task 2: `OnboardingStep` component

**Files:**
- Create: `components/OnboardingStep.tsx`
- Create: `__tests__/components/OnboardingStep.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/OnboardingStep.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingStep } from '@/components/OnboardingStep'

const mockIllustration = <div data-testid="illus">illustration</div>

describe('OnboardingStep', () => {
  it('renders the heading and body', () => {
    render(
      <OnboardingStep
        step={1}
        illustration={mockIllustration}
        heading="Here's how it works"
        body="Some body text."
        ctaLabel="Next →"
        onNext={vi.fn()}
      />
    )
    expect(screen.getByText("Here's how it works")).toBeInTheDocument()
    expect(screen.getByText('Some body text.')).toBeInTheDocument()
  })

  it('renders the illustration slot', () => {
    render(
      <OnboardingStep
        step={2}
        illustration={mockIllustration}
        heading="Upload"
        body="Body"
        ctaLabel="Next →"
        onNext={vi.fn()}
      />
    )
    expect(screen.getByTestId('illus')).toBeInTheDocument()
  })

  it('renders the CTA with the supplied label', () => {
    render(
      <OnboardingStep
        step={3}
        illustration={mockIllustration}
        heading="Share"
        body="Body"
        ctaLabel="Let's go →"
        onNext={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: "Let's go →" })).toBeInTheDocument()
  })

  it('calls onNext when the CTA is clicked', async () => {
    const onNext = vi.fn()
    render(
      <OnboardingStep
        step={1}
        illustration={mockIllustration}
        heading="Heading"
        body="Body"
        ctaLabel="Next →"
        onNext={onNext}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Next →' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('marks the correct dot as active via aria-label', () => {
    render(
      <OnboardingStep
        step={2}
        illustration={mockIllustration}
        heading="H"
        body="B"
        ctaLabel="Next →"
        onNext={vi.fn()}
      />
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/OnboardingStep.test.tsx
```

Expected: all 5 tests fail with "Cannot find module".

- [ ] **Step 3: Create `components/OnboardingStep.tsx`**

```tsx
// components/OnboardingStep.tsx
//
// Shared shell for tutorial steps 1–3 in the onboarding wizard.
// Pure display — no internal state. All content injected via props.

import type { ReactNode } from 'react'

interface OnboardingStepProps {
  step: 1 | 2 | 3
  illustration: ReactNode
  heading: string
  body: string
  ctaLabel: string
  onNext: () => void
}

export function OnboardingStep({
  step,
  illustration,
  heading,
  body,
  ctaLabel,
  onNext,
}: OnboardingStepProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">
          Conversation Coach
        </p>
        <div
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-label={`Step ${step} of 3`}
          className="flex justify-center gap-2"
        >
          {([1, 2, 3] as const).map(i => (
            <div
              key={i}
              className={
                i === step
                  ? 'h-1.5 w-5 rounded-full bg-accent-primary transition-all'
                  : 'h-1.5 w-1.5 rounded-full bg-border transition-all'
              }
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-surface h-44 flex items-center justify-center overflow-hidden">
        {illustration}
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{heading}</h1>
        <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full py-3 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-semibold text-sm transition-colors"
      >
        {ctaLabel}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/OnboardingStep.test.tsx
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/OnboardingStep.tsx __tests__/components/OnboardingStep.test.tsx
git commit -m "feat(onboarding): add OnboardingStep shell component"
```

---

## Task 3: Rewrite `/onboarding/page.tsx`

**Files:**
- Rewrite: `app/onboarding/page.tsx`
- Rewrite: `__tests__/pages/OnboardingPage.test.tsx`

- [ ] **Step 1: Write the updated tests first**

Replace the entire contents of `__tests__/pages/OnboardingPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OnboardingPage from '@/app/onboarding/page'

const mockPush = vi.fn()
const mockSetTargetLanguage = vi.fn()

// searchParams is mutable per-test via mockSearchParams.get
const mockSearchParams = { get: vi.fn((_key: string) => null) }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}))
vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) },
  }),
}))
vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    setTargetLanguage: mockSetTargetLanguage,
  }),
}))

beforeEach(() => {
  mockPush.mockClear()
  mockSetTargetLanguage.mockClear()
  mockSearchParams.get.mockImplementation((_key: string) => null)
})

// ─── Step 0: language selection ───────────────────────────────────────────────

describe('OnboardingPage — step 0 (language select)', () => {
  it('renders the heading', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('What are you learning?')).toBeInTheDocument()
  })

  it('renders both language options', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('Spanish')).toBeInTheDocument()
    expect(screen.getByText('English')).toBeInTheDocument()
  })

  it('Get started button is disabled until a language is selected', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: /get started/i })).toBeDisabled()
  })

  it('enables Get started after selecting a language', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByText('Spanish'))
    expect(screen.getByRole('button', { name: /get started/i })).not.toBeDisabled()
  })

  it('calls setTargetLanguage and redirects to step=1 after confirming', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByText('English'))
    await userEvent.click(screen.getByRole('button', { name: /get started/i }))
    expect(mockSetTargetLanguage).toHaveBeenCalledWith('en-NZ')
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=1')
  })
})

// ─── Steps 1–3: tutorial ──────────────────────────────────────────────────────

describe('OnboardingPage — step 1 (welcome)', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'step' ? '1' : null
    )
  })

  it('renders the step 1 heading key', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.step1.heading')).toBeInTheDocument()
  })

  it('renders the Next CTA', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: 'onboarding.cta.next' })).toBeInTheDocument()
  })

  it('Next pushes to step=2', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.next' }))
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=2')
  })
})

describe('OnboardingPage — step 2 (upload)', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'step' ? '2' : null
    )
  })

  it('renders the step 2 heading key', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.step2.heading')).toBeInTheDocument()
  })

  it('Next pushes to step=3', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.next' }))
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=3')
  })
})

describe('OnboardingPage — step 3 (share), first run', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'step' ? '3' : null
    )
  })

  it('renders the step 3 heading key', () => {
    render(<OnboardingPage />)
    expect(screen.getByText('onboarding.step3.heading')).toBeInTheDocument()
  })

  it('renders the letsGo CTA (not done)', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: 'onboarding.cta.letsGo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'onboarding.cta.done' })).not.toBeInTheDocument()
  })

  it('letsGo pushes to /', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.letsGo' }))
    expect(mockPush).toHaveBeenCalledWith('/')
  })
})

describe('OnboardingPage — step 3 (share), revisit', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'step') return '3'
      if (key === 'revisit') return 'true'
      return null
    })
  })

  it('renders the done CTA (not letsGo)', () => {
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: 'onboarding.cta.done' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'onboarding.cta.letsGo' })).not.toBeInTheDocument()
  })

  it('done pushes to /settings', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.done' }))
    expect(mockPush).toHaveBeenCalledWith('/settings')
  })
})

describe('OnboardingPage — step 1, revisit', () => {
  beforeEach(() => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'step') return '1'
      if (key === 'revisit') return 'true'
      return null
    })
  })

  it('Next preserves revisit=true when advancing', async () => {
    render(<OnboardingPage />)
    await userEvent.click(screen.getByRole('button', { name: 'onboarding.cta.next' }))
    expect(mockPush).toHaveBeenCalledWith('/onboarding?step=2&revisit=true')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/pages/OnboardingPage.test.tsx
```

Expected: multiple failures — old tests around `router.push('/')` will fail, new step tests will fail.

- [ ] **Step 3: Rewrite `app/onboarding/page.tsx`**

```tsx
'use client'
import { Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/components/LanguageProvider'
import { OnboardingStep } from '@/components/OnboardingStep'
import type { TargetLanguage } from '@/lib/types'

const LANGUAGE_OPTIONS: { value: TargetLanguage; name: string; variant: string; flag: string }[] = [
  { value: 'es-AR', name: 'Spanish', variant: 'Rioplatense · Argentine', flag: '🇦🇷' },
  { value: 'en-NZ', name: 'English', variant: 'New Zealand English', flag: '🇳🇿' },
]

// ─── Step illustrations ────────────────────────────────────────────────────────

function Step1Illustration() {
  const items = [
    { icon: '🎙️', label: 'Record' },
    { icon: '📤', label: 'Upload' },
    { icon: '✏️', label: 'Review' },
    { icon: '📝', label: 'Write' },
  ]
  return (
    <div className="flex items-center gap-1 px-3 w-full" aria-hidden="true">
      {items.flatMap((item, i, arr) => {
        const node = (
          <div key={item.label} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-accent-chip flex items-center justify-center text-xl leading-none">
              {item.icon}
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary text-center w-full truncate">
              {item.label}
            </span>
          </div>
        )
        return i < arr.length - 1
          ? [node, <span key={`a${i}`} className="text-text-tertiary text-xs flex-shrink-0 mb-3">›</span>]
          : [node]
      })}
    </div>
  )
}

function Step2Illustration() {
  return (
    <div className="flex flex-col items-center gap-3" aria-hidden="true">
      <div className="flex items-center gap-2 bg-accent-primary text-white rounded-full py-3 px-5 shadow-lg">
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span className="text-sm font-semibold">Upload audio</span>
      </div>
      <div className="flex gap-1.5">
        {['.mp3', '.m4a', '.wav', '.opus'].map(ext => (
          <span
            key={ext}
            className="text-xs font-semibold px-2 py-1 rounded-md bg-surface-elevated text-text-tertiary"
          >
            {ext}
          </span>
        ))}
      </div>
    </div>
  )
}

function Step3Illustration() {
  const apps = [
    { label: 'Messages', content: <span>💬</span>, highlight: false },
    { label: 'Mail', content: <span>📧</span>, highlight: false },
    { label: 'Coach', content: <span className="text-white text-xs font-bold">CC</span>, highlight: true },
    { label: 'Files', content: <span>📁</span>, highlight: false },
  ]
  return (
    <div className="flex items-center justify-center w-full" aria-hidden="true">
      <div className="w-60 bg-surface rounded-2xl shadow-lg overflow-hidden border border-border-subtle">
        <div className="bg-surface-elevated px-3 py-2.5 border-b border-border-subtle text-center text-xs text-text-tertiary font-medium">
          Share voice note via…
        </div>
        <div className="flex items-start justify-around px-2 py-3">
          {apps.map(app => (
            <div
              key={app.label}
              className={`flex flex-col items-center gap-1.5 ${app.highlight ? '' : 'opacity-40'}`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                  app.highlight ? 'bg-accent-primary shadow-md' : 'bg-surface-elevated'
                }`}
              >
                {app.content}
              </div>
              <span
                className={`text-[10px] font-medium text-center ${
                  app.highlight ? 'text-accent-primary font-semibold' : 'text-text-tertiary'
                }`}
              >
                {app.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Step content map ─────────────────────────────────────────────────────────

type TutorialStep = 1 | 2 | 3

interface StepConfig {
  illustration: ReactNode
  headingKey: string
  bodyKey: string
}

const STEP_CONFIG: Record<TutorialStep, StepConfig> = {
  1: {
    illustration: <Step1Illustration />,
    headingKey: 'onboarding.step1.heading',
    bodyKey: 'onboarding.step1.body',
  },
  2: {
    illustration: <Step2Illustration />,
    headingKey: 'onboarding.step2.heading',
    bodyKey: 'onboarding.step2.body',
  },
  3: {
    illustration: <Step3Illustration />,
    headingKey: 'onboarding.step3.heading',
    bodyKey: 'onboarding.step3.body',
  },
}

// ─── Main content (needs Suspense for useSearchParams) ────────────────────────

function OnboardingContent() {
  const [selected, setSelected] = useState<TargetLanguage | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, setTargetLanguage } = useTranslation()

  const stepParam = searchParams.get('step')
  const revisit = searchParams.get('revisit') === 'true'
  const step = stepParam ? Math.max(0, parseInt(stepParam, 10)) : 0

  function handleLanguageConfirm() {
    if (!selected) return
    setTargetLanguage(selected)
    router.push('/onboarding?step=1')
  }

  function handleNext(currentStep: TutorialStep) {
    if (currentStep < 3) {
      const next = currentStep + 1
      const params = revisit ? `?step=${next}&revisit=true` : `?step=${next}`
      router.push(`/onboarding${params}`)
    } else {
      router.push(revisit ? '/settings' : '/')
    }
  }

  // ── Step 0: language select ──────────────────────────────────────────────────
  if (step === 0) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-7rem)] px-6">
        <div className="w-full max-w-sm space-y-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary text-center">
            Conversation Coach
          </p>

          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              What are you learning?
            </h1>
            <p className="text-sm text-text-secondary">
              Pick the language you want to practise. You can change this later in Settings.
            </p>
          </div>

          <div className="space-y-3" role="radiogroup" aria-label="Target language">
            {LANGUAGE_OPTIONS.map(opt => {
              const isSelected = selected === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelected(opt.value)}
                  className={`w-full flex items-center gap-4 p-5 rounded-2xl border text-left transition-colors ${
                    isSelected
                      ? 'border-accent-primary bg-accent-chip'
                      : 'border-border bg-surface hover:border-accent-primary/40 hover:bg-surface-elevated'
                  }`}
                >
                  <span className="text-4xl leading-none flex-shrink-0">{opt.flag}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-text-primary">{opt.name}</p>
                    <p className="text-sm text-text-tertiary mt-0.5">{opt.variant}</p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? 'bg-accent-primary border-accent-primary' : 'border-border'
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handleLanguageConfirm}
            disabled={selected === null}
            className="w-full py-3 rounded-xl bg-accent-primary hover:bg-accent-primary-hover text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Get started →
          </button>
        </div>
      </div>
    )
  }

  // ── Steps 1–3: tutorial ──────────────────────────────────────────────────────
  const tutorialStep = (Math.min(3, step) as TutorialStep)
  const config = STEP_CONFIG[tutorialStep]
  const ctaKey =
    tutorialStep < 3
      ? 'onboarding.cta.next'
      : revisit
      ? 'onboarding.cta.done'
      : 'onboarding.cta.letsGo'

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-7rem)] px-6">
      <div className="w-full max-w-sm">
        <OnboardingStep
          step={tutorialStep}
          illustration={config.illustration}
          heading={t(config.headingKey)}
          body={t(config.bodyKey)}
          ctaLabel={t(ctaKey)}
          onNext={() => handleNext(tutorialStep)}
        />
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingContent />
    </Suspense>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/pages/OnboardingPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/onboarding/page.tsx __tests__/pages/OnboardingPage.test.tsx
git commit -m "feat(onboarding): extend wizard with 3-step tutorial (welcome, upload, share)"
```

---

## Task 4: `DashboardOnboarding` revisit link

**Files:**
- Modify: `components/DashboardOnboarding.tsx`
- Create: `__tests__/components/DashboardOnboarding.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/DashboardOnboarding.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardOnboarding } from '@/components/DashboardOnboarding'

vi.mock('@/components/LanguageProvider', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('DashboardOnboarding', () => {
  it('renders the step cards', () => {
    render(<DashboardOnboarding />)
    expect(screen.getByTestId('dashboard-onboarding')).toBeInTheDocument()
  })

  it('renders a revisit tutorial link pointing to the tutorial', () => {
    render(<DashboardOnboarding />)
    const link = screen.getByRole('link', { name: /onboarding\.revisitLink/i })
    expect(link).toHaveAttribute('href', '/onboarding?step=1&revisit=true')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/components/DashboardOnboarding.test.tsx
```

Expected: "renders a revisit tutorial link" fails — link does not exist yet.

- [ ] **Step 3: Add the revisit link to `components/DashboardOnboarding.tsx`**

After the closing `</ol>` tag and before the closing `</section>` tag, add:

```tsx
      <Link
        href="/onboarding?step=1&revisit=true"
        className="inline-block text-sm text-text-tertiary hover:text-accent-primary transition-colors"
      >
        {t('onboarding.revisitLink')}
      </Link>
```

Also add the import at the top of the file (after the existing `'use client'` and imports):

```tsx
import Link from 'next/link'
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/components/DashboardOnboarding.test.tsx
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/DashboardOnboarding.tsx __tests__/components/DashboardOnboarding.test.tsx
git commit -m "feat(dashboard): add revisit tutorial link to empty-state onboarding"
```

---

## Task 5: Settings Help section

**Files:**
- Modify: `app/settings/page.tsx`
- Modify: `__tests__/pages/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block at the end of `__tests__/pages/SettingsPage.test.tsx`:

```tsx
describe('SettingsPage — Help section', () => {
  it('renders a Help section heading', () => {
    render(<SettingsPage />)
    // t('settings.help') falls back to the key in the test env (no LanguageProvider)
    expect(screen.getByText('Help')).toBeInTheDocument()
  })

  it('renders a "How to upload audio" link pointing to the tutorial', () => {
    render(<SettingsPage />)
    const link = screen.getByRole('link', { name: /how to upload audio/i })
    expect(link).toHaveAttribute('href', '/onboarding?step=1&revisit=true')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- __tests__/pages/SettingsPage.test.tsx
```

Expected: 2 failures — "Help" heading and "How to upload audio" link not found.

- [ ] **Step 3: Add the Help section to `app/settings/page.tsx`**

Add `import Link from 'next/link'` at the top of the file alongside the other imports.

Then insert the Help section directly before the existing App/version `<div className="space-y-3">` block:

```tsx
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {t('settings.help')}
        </h2>
        <Link
          href="/onboarding?step=1&revisit=true"
          className="block w-full px-4 py-2 rounded border border-border bg-surface hover:bg-surface-elevated transition-colors text-sm text-left text-text-primary"
        >
          {t('settings.howToUpload')}
        </Link>
      </div>
```

The `t` function is already called in this component via `const { targetLanguage, setTargetLanguage, t } = useTranslation()`.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- __tests__/pages/SettingsPage.test.tsx
```

Expected: all tests pass, including the two new ones.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. Fix any regressions before committing.

- [ ] **Step 6: Commit**

```bash
git add app/settings/page.tsx __tests__/pages/SettingsPage.test.tsx
git commit -m "feat(settings): add Help section with tutorial revisit link"
```

---

## Self-review notes

- **Spec coverage:**
  - ✅ Language select → tutorial wizard (`/onboarding` multi-step via `useSearchParams`)
  - ✅ 3 mandatory tutorial steps, no skip
  - ✅ First-run vs revisit routing (`revisit=true` param)
  - ✅ `OnboardingStep` shared shell with progress dots
  - ✅ Step illustrations (loop, FAB mock, share sheet mock)
  - ✅ `DashboardOnboarding` revisit link
  - ✅ Settings Help section
  - ✅ All i18n keys in EN + ES-AR
  - ✅ Existing auth callback flow unchanged (still redirects first-timers to `/onboarding`)

- **No placeholders:** all code blocks are complete and executable.

- **Type consistency:** `TutorialStep = 1 | 2 | 3` used consistently across `OnboardingStep` props, `STEP_CONFIG` record key, and `handleNext` parameter.
