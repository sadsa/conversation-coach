# UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three focused UI improvements — remove improvement-tracking from Insights, add navigation loading skeletons, and compact the home page upload row.

**Architecture:** Each task is independent. Task 1 deletes dead code and updates wording. Task 2 rewrites DropZone markup only (logic unchanged). Task 3 adds `loading.tsx` files per route — Next.js serves these instantly while server components resolve.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library

---

## File Map

| File | Action | Task |
|---|---|---|
| `lib/insights.ts` | Modify — remove `TrendResult`, `computeTrend`, trend RPC call, `trend` field on `FocusCard` | 1 |
| `components/InsightsCardList.tsx` | Modify — remove `TREND_CONFIG`, `TrendChip`, all trend rendering; remove section wrapper | 1 |
| `app/insights/page.tsx` | Modify — update `<h1>` and subtitle text | 1 |
| `__tests__/lib/insights.test.ts` | Delete — exclusively tests `computeTrend()` | 1 |
| `__tests__/components/InsightsCardList.test.tsx` | Modify — remove `trend` field from mocks, drop trend test cases | 1 |
| `components/DropZone.tsx` | Modify — replace large box with compact row | 2 |
| `app/loading.tsx` | Create — Home skeleton | 3 |
| `app/practice/loading.tsx` | Create — Practice skeleton | 3 |
| `app/flashcards/loading.tsx` | Create — Flashcards skeleton | 3 |
| `app/insights/loading.tsx` | Create — Insights skeleton | 3 |
| `app/settings/loading.tsx` | Create — Settings skeleton | 3 |

---

## Task 1: Insights — Trend Removal & Wording

**Files:**
- Modify: `lib/insights.ts`
- Modify: `components/InsightsCardList.tsx`
- Modify: `app/insights/page.tsx`
- Delete: `__tests__/lib/insights.test.ts`
- Modify: `__tests__/components/InsightsCardList.test.tsx`

- [ ] **Step 1: Delete the insights unit test file**

This file exclusively tests `computeTrend()` which is being removed.

```bash
rm __tests__/lib/insights.test.ts
```

- [ ] **Step 2: Rewrite `lib/insights.ts`**

Remove `TrendResult`, `computeTrend`, the `trend` field on `FocusCard`, and the `get_subcategory_session_counts` RPC call. Replace the entire file:

```typescript
import { createServerClient } from '@/lib/supabase-server'
import { SUB_CATEGORY_DISPLAY } from '@/lib/types'
import type { SubCategory } from '@/lib/types'

export interface FocusCard {
  subCategory: SubCategory
  type: 'grammar' | 'naturalness'
  displayName: string
  totalCount: number
  sessionCount: number
  examples: ExampleAnnotation[]
}

export interface ExampleAnnotation {
  original: string
  correction: string | null
  startChar: number
  endChar: number
  segmentText: string
  sessionTitle: string
  sessionCreatedAt: string
}

export interface InsightsData {
  totalReadySessions: number
  focusCards: FocusCard[]
}

export async function fetchInsightsData(): Promise<InsightsData> {
  const db = createServerClient()

  const { count: totalReadySessions } = await db
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ready')

  const total = totalReadySessions ?? 0

  const { data: errorCounts } = await db.rpc('get_subcategory_error_counts')

  const { data: examplesRaw } = await db.rpc('get_subcategory_examples')
  const examplesBySubCat = new Map<string, ExampleAnnotation[]>()
  for (const row of (examplesRaw ?? []) as {
    sub_category: string; original: string; correction: string | null;
    start_char: number; end_char: number; segment_text: string;
    session_title: string; session_created_at: string
  }[]) {
    if (!examplesBySubCat.has(row.sub_category)) examplesBySubCat.set(row.sub_category, [])
    examplesBySubCat.get(row.sub_category)!.push({
      original: row.original,
      correction: row.correction,
      startChar: row.start_char,
      endChar: row.end_char,
      segmentText: row.segment_text,
      sessionTitle: row.session_title,
      sessionCreatedAt: row.session_created_at,
    })
  }

  const focusCards: FocusCard[] = (errorCounts ?? []).map((row: {
    sub_category: string; type: string; total_count: number; session_count: number
  }) => ({
    subCategory: row.sub_category as SubCategory,
    type: row.type as 'grammar' | 'naturalness',
    displayName: SUB_CATEGORY_DISPLAY[row.sub_category as SubCategory] ?? row.sub_category,
    totalCount: Number(row.total_count),
    sessionCount: Number(row.session_count),
    examples: examplesBySubCat.get(row.sub_category) ?? [],
  }))

  return { totalReadySessions: total, focusCards }
}
```

- [ ] **Step 3: Rewrite `components/InsightsCardList.tsx`**

Remove `TREND_CONFIG`, `TrendChip`, `showTrend` logic, and the section/heading wrapper. Replace the entire file:

```tsx
'use client'
import { useState } from 'react'
import type { FocusCard } from '@/lib/insights'

function underlineInText(segmentText: string, startChar: number, endChar: number, original: string): React.ReactNode {
  const isValid = startChar >= 0 && endChar <= segmentText.length && startChar < endChar
  if (!isValid) return <span>«{original}»</span>
  return (
    <span>
      «{segmentText.slice(0, startChar)}
      <span className="underline decoration-red-400 decoration-2">{segmentText.slice(startChar, endChar)}</span>
      {segmentText.slice(endChar)}»
    </span>
  )
}

function FocusCardRow({ card, rank, totalSessions }: { card: FocusCard; rank: number; totalSessions: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`bg-gray-800 border rounded-xl p-4 cursor-pointer transition-colors ${expanded ? 'border-indigo-500' : 'border-gray-700 hover:border-gray-500'}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center gap-3">
        <span className={`text-sm font-bold w-5 flex-shrink-0 ${rank <= 2 ? 'text-red-400' : 'text-gray-500'}`}>{rank}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-100">{card.displayName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{card.type} · appears in {card.sessionCount} of {totalSessions} sessions</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-bold text-gray-100">{card.totalCount}</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-700" onClick={e => e.stopPropagation()}>
          {card.examples.length > 0 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-3">From your conversations</p>
              <div className="space-y-2">
                {card.examples.map((ex, i) => (
                  <div key={i} className="bg-gray-900 rounded-lg p-3">
                    <p className="text-sm text-gray-200">
                      {underlineInText(ex.segmentText, ex.startChar, ex.endChar, ex.original)}
                    </p>
                    {ex.correction && (
                      <p className="text-sm text-green-400 mt-1">→ {ex.correction}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      <span>{ex.sessionTitle}</span>
                      {' · '}
                      <span>{new Date(ex.sessionCreatedAt).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}</span>
                    </p>
                  </div>
                ))}
              </div>
              <a
                href={`/practice?sub_category=${card.subCategory}`}
                className="block text-center text-sm text-indigo-400 mt-3"
                onClick={e => e.stopPropagation()}
              >
                See all {card.totalCount} examples →
              </a>
            </>
          ) : (
            <p className="text-sm text-gray-500">Add annotations to your practice list to see examples here.</p>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  focusCards: FocusCard[]
  totalSessions: number
}

export function InsightsCardList({ focusCards, totalSessions }: Props) {
  return (
    <div className="space-y-2">
      {focusCards.map((card, i) => (
        <FocusCardRow key={card.subCategory} card={card} rank={i + 1} totalSessions={totalSessions} />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Update `app/insights/page.tsx` wording**

Change the `<h1>` and subtitle `<p>`:

```tsx
import { fetchInsightsData } from '@/lib/insights'
import { InsightsCardList } from '@/components/InsightsCardList'

export default async function InsightsPage() {
  const { totalReadySessions, focusCards } = await fetchInsightsData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Where you&rsquo;re struggling</h1>
        <p className="text-sm text-gray-400 mt-1">Your recurring mistakes, ranked by frequency</p>
      </div>

      {totalReadySessions === 0 ? (
        <p className="text-gray-500 text-sm">
          Insights will appear once you&rsquo;ve recorded and analysed some conversations.
        </p>
      ) : focusCards.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No categorised mistakes yet. Re-analyse a session to generate insights.
        </p>
      ) : (
        <InsightsCardList
          focusCards={focusCards}
          totalSessions={totalReadySessions}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Update `__tests__/components/InsightsCardList.test.tsx`**

Remove `trend` from mock data, delete the trend-chip test cases. Replace the entire file:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InsightsCardList } from '@/components/InsightsCardList'
import type { FocusCard } from '@/lib/insights'

const mockCards: FocusCard[] = [
  {
    subCategory: 'subjunctive',
    type: 'grammar',
    displayName: 'Subjunctive',
    totalCount: 10,
    sessionCount: 4,
    examples: [
      { original: 'cuando vengas', correction: 'cuando venís', startChar: 8, endChar: 14, segmentText: 'cuando vengas a casa', sessionTitle: 'Chat with Sofía', sessionCreatedAt: '2026-03-18T10:00:00Z' },
    ],
  },
  {
    subCategory: 'ser-estar',
    type: 'grammar',
    displayName: 'Ser / Estar',
    totalCount: 5,
    sessionCount: 2,
    examples: [],
  },
]

describe('InsightsCardList', () => {
  it('renders focus cards with rank, name, and count', () => {
    render(<InsightsCardList focusCards={mockCards} totalSessions={5} />)
    expect(screen.getByText('Subjunctive')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getByText('Ser / Estar')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('shows examples when a card is expanded', async () => {
    render(<InsightsCardList focusCards={mockCards} totalSessions={5} />)
    expect(screen.queryByText('Chat with Sofía')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Subjunctive'))
    expect(screen.getByText('Chat with Sofía')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run tests**

```bash
npm test -- __tests__/components/InsightsCardList.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 7: Run full test suite to check for regressions**

```bash
npm test
```

Expected: all tests pass (the deleted `insights.test.ts` is gone, no other files import `computeTrend` or `TrendResult`).

- [ ] **Step 8: Commit**

```bash
git add lib/insights.ts components/InsightsCardList.tsx app/insights/page.tsx \
  __tests__/components/InsightsCardList.test.tsx
git rm __tests__/lib/insights.test.ts
git commit -m "feat: remove trend tracking from insights, refocus on weaknesses"
```

---

## Task 2: Compact Upload Row

**Files:**
- Modify: `components/DropZone.tsx`

- [ ] **Step 1: Run existing DropZone tests to confirm baseline**

```bash
npm test -- __tests__/components/DropZone.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 2: Rewrite the JSX in `components/DropZone.tsx`**

Only the returned JSX changes — all constants, validation logic, state, and event handlers stay identical. Replace the `return (...)` block and nothing else:

```tsx
// components/DropZone.tsx
'use client'
import { useRef, useState } from 'react'

const ACCEPTED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/ogg', 'audio/opus']
const ACCEPTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.opus']
const MAX_BYTES = 500 * 1024 * 1024 // 500 MB

interface Props {
  onFile: (file: File) => void
}

export function DropZone({ onFile }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function validate(file: File): string | null {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    const validType = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.includes(ext)
    if (!validType) return `Unsupported format. Use MP3, M4A, WAV, or OPUS.`
    if (file.size > MAX_BYTES) return `File too large. Maximum is 500 MB.`
    return null
  }

  function handleFile(file: File) {
    const err = validate(file)
    if (err) { setError(err); return }
    setError(null)
    onFile(file)
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        onClick={() => inputRef.current?.click()}
        className={`border rounded-xl p-4 flex items-center gap-3 cursor-pointer transition-colors
          ${dragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 hover:border-gray-500'}`}
      >
        <span className="text-2xl flex-shrink-0" aria-hidden="true">🎙️</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-100 text-sm">Upload conversation</p>
          <p className="text-xs text-gray-500 mt-0.5">MP3, M4A, WAV, OPUS</p>
        </div>
        <button
          type="button"
          className="flex-shrink-0 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
          onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
        >
          Browse
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.m4a,.wav,.opus"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Run the DropZone tests**

```bash
npm test -- __tests__/components/DropZone.test.tsx
```

Expected: all 7 tests pass. The "hint text mentions OPUS" test passes because "OPUS" is still in the format hint text.

- [ ] **Step 4: Commit**

```bash
git add components/DropZone.tsx
git commit -m "feat: compact upload row on home page"
```

---

## Task 3: Navigation Loading Skeletons

**Files:**
- Create: `app/loading.tsx`
- Create: `app/practice/loading.tsx`
- Create: `app/flashcards/loading.tsx`
- Create: `app/insights/loading.tsx`
- Create: `app/settings/loading.tsx`

These are visual-only. No unit tests — verify by running `npm run dev` and tapping between nav tabs.

- [ ] **Step 1: Create `app/insights/loading.tsx`** (highest impact — 3 server-side RPC calls)

```tsx
export default function InsightsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-7 w-52 bg-gray-800 rounded-md" />
        <div className="h-4 w-72 bg-gray-800 rounded-md mt-2" />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-5 h-4 bg-gray-700 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-700 rounded" style={{ width: `${45 + i * 7}%` }} />
                <div className="h-3 bg-gray-700 rounded" style={{ width: `${60 + i * 5}%` }} />
              </div>
              <div className="w-7 h-6 bg-gray-700 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/practice/loading.tsx`**

```tsx
export default function PracticeLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-32 bg-gray-800 rounded-md" />
      {/* Pill row */}
      <div className="flex gap-2 overflow-hidden">
        {[80, 60, 90, 70, 55].map((w, i) => (
          <div key={i} className="h-8 bg-gray-800 rounded-full flex-shrink-0" style={{ width: `${w}px` }} />
        ))}
      </div>
      {/* List items */}
      <div className="space-y-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <div className="h-4 bg-gray-700 rounded w-3/4" />
            <div className="h-3 bg-gray-700 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/flashcards/loading.tsx`**

```tsx
export default function FlashcardsLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-pulse">
      <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl p-8 space-y-4">
        <div className="h-5 bg-gray-700 rounded w-3/5 mx-auto" />
        <div className="h-5 bg-gray-700 rounded w-2/5 mx-auto" />
        <div className="h-24 bg-gray-700 rounded-xl mt-6" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/loading.tsx`** (Home — low impact, included for consistency)

```tsx
export default function HomeLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-7 w-52 bg-gray-800 rounded-md" />
        <div className="h-4 w-80 bg-gray-800 rounded-md mt-2" />
      </div>
      {/* Upload row placeholder */}
      <div className="h-14 bg-gray-800 border border-gray-700 rounded-xl" />
      {/* Session list */}
      <div className="space-y-3">
        <div className="h-4 w-28 bg-gray-800 rounded" />
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-2">
            <div className="h-4 bg-gray-700 rounded w-2/3" />
            <div className="h-3 bg-gray-700 rounded w-1/3" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `app/settings/loading.tsx`**

```tsx
export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-28 bg-gray-800 rounded-md" />
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="h-4 bg-gray-700 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests pass (no tests cover loading files).

- [ ] **Step 7: Commit**

```bash
git add app/loading.tsx app/practice/loading.tsx app/flashcards/loading.tsx \
  app/insights/loading.tsx app/settings/loading.tsx
git commit -m "feat: add loading skeletons for all main routes"
```
