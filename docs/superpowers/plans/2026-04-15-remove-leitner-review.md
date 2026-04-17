# Remove Leitner Review System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all in-app Leitner flashcard review infrastructure while preserving `written_down` tracking and the write-down pill on the home page.

**Architecture:** Delete dead files first, then strip leitner references from shared types and lib, then fix API routes and UI, then clean up i18n and tests. Each task compiles and tests cleanly before moving to the next.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (PostgreSQL), Vitest + React Testing Library

---

## File Map

| Action | File |
|--------|------|
| Delete | `app/flashcards/page.tsx` |
| Delete | `components/LeitnerDashboard.tsx` |
| Delete | `lib/leitner.ts` |
| Delete | `app/api/practice-items/leitner-review/route.ts` |
| Delete | `__tests__/lib/leitner.test.ts` |
| Delete | `__tests__/api/leitner-review.test.ts` |
| Create | `supabase/migrations/20260415000000_drop_leitner_columns.sql` |
| Modify | `lib/types.ts` |
| Modify | `lib/dashboard-summary.ts` |
| Modify | `app/api/dashboard-summary/route.ts` |
| Modify | `app/api/practice-items/route.ts` |
| Modify | `app/api/practice-items/[id]/route.ts` |
| Modify | `components/NavDrawer.tsx` |
| Modify | `app/page.tsx` |
| Modify | `lib/i18n.ts` |
| Modify | `__tests__/api/dashboard-summary.test.ts` |

---

### Task 1: DB migration — drop leitner columns

**Files:**
- Create: `supabase/migrations/20260415000000_drop_leitner_columns.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260415000000_drop_leitner_columns.sql

ALTER TABLE practice_items
  DROP COLUMN IF EXISTS leitner_box,
  DROP COLUMN IF EXISTS leitner_due_date;
```

- [ ] **Step 2: Apply migration to remote DB**

```bash
supabase db push
```

Expected: migration applies cleanly, status shows `20260415000000_drop_leitner_columns` as applied.

- [ ] **Step 3: Verify columns are gone**

```bash
supabase db query --linked "SELECT column_name FROM information_schema.columns WHERE table_name = 'practice_items' AND column_name IN ('leitner_box', 'leitner_due_date');"
```

Expected: 0 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260415000000_drop_leitner_columns.sql
git commit -m "chore: drop leitner_box and leitner_due_date columns from practice_items"
```

---

### Task 2: Delete dead files

**Files:**
- Delete: `app/flashcards/page.tsx`
- Delete: `components/LeitnerDashboard.tsx`
- Delete: `lib/leitner.ts`
- Delete: `app/api/practice-items/leitner-review/route.ts`
- Delete: `__tests__/lib/leitner.test.ts`
- Delete: `__tests__/api/leitner-review.test.ts`

- [ ] **Step 1: Delete all six files**

```bash
rm app/flashcards/page.tsx \
   components/LeitnerDashboard.tsx \
   lib/leitner.ts \
   app/api/practice-items/leitner-review/route.ts \
   __tests__/lib/leitner.test.ts \
   __tests__/api/leitner-review.test.ts
```

- [ ] **Step 2: Verify deletions**

```bash
git status
```

Expected: six files listed as deleted.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "chore: delete leitner review files (page, component, lib, api route, tests)"
```

---

### Task 3: Strip leitner from `lib/types.ts`

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Remove leitner fields from PracticeItem and delete BoxSummary + LeitnerResponse**

Open `lib/types.ts`. Make these changes:

**In `PracticeItem` interface** — remove these two lines:
```ts
  leitner_box: number | null
  leitner_due_date: string | null  // YYYY-MM-DD
```

**Delete `BoxSummary` interface entirely:**
```ts
export interface BoxSummary {
  box: number      // 1–5
  count: number
  due: boolean
}
```

**Delete `LeitnerResponse` interface entirely:**
```ts
export interface LeitnerResponse {
  boxes: BoxSummary[]
  cards: PracticeItem[]
  activeBox: number | null
}
```

- [ ] **Step 2: Run the TypeScript compiler to catch any remaining usages**

```bash
npm run build 2>&1 | head -50
```

Expected: build errors only from files not yet updated (practice-items route, dashboard-summary — fixed in later tasks). If errors reference `lib/types.ts` itself, fix them now.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "chore: remove BoxSummary, LeitnerResponse, and leitner fields from PracticeItem type"
```

---

### Task 4: Simplify `lib/dashboard-summary.ts`

**Files:**
- Modify: `lib/dashboard-summary.ts`
- Modify: `__tests__/api/dashboard-summary.test.ts`

- [ ] **Step 1: Rewrite dashboard-summary test first**

Replace the entire contents of `__tests__/api/dashboard-summary.test.ts`:

```ts
// __tests__/api/dashboard-summary.test.ts
import { describe, it, expect, vi } from 'vitest'
import { computeDashboardSummary } from '@/lib/dashboard-summary'

function makeDb(writeDownCount = 0) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({
      data: Array.from({ length: writeDownCount }, (_, i) => ({ id: `wd-${i}` })),
      error: null,
    }),
  }
  return { from: vi.fn().mockReturnValue(mockChain) }
}

describe('computeDashboardSummary', () => {
  it('returns writeDownCount from not-written items', async () => {
    const db = makeDb(3)
    const result = await computeDashboardSummary(db as never, ['session-1'])
    expect(result.writeDownCount).toBe(3)
  })

  it('returns 0 when all items written down', async () => {
    const db = makeDb(0)
    const result = await computeDashboardSummary(db as never, ['session-1'])
    expect(result.writeDownCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails (function signature mismatch)**

```bash
npm test -- __tests__/api/dashboard-summary.test.ts
```

Expected: FAIL — type errors or wrong return shape.

- [ ] **Step 3: Replace `lib/dashboard-summary.ts` with simplified version**

```ts
// lib/dashboard-summary.ts
import { createServerClient } from '@/lib/supabase-server'

export interface DashboardSummary {
  writeDownCount: number
}

export async function computeDashboardSummary(
  db: ReturnType<typeof createServerClient>,
  sessionIds: string[],
): Promise<DashboardSummary> {
  const { data: notWritten } = await db
    .from('practice_items')
    .select('id')
    .in('session_id', sessionIds)
    .eq('written_down', false)
    .limit(1000)

  const writeDownCount = notWritten?.length ?? 0

  return { writeDownCount }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm test -- __tests__/api/dashboard-summary.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard-summary.ts __tests__/api/dashboard-summary.test.ts
git commit -m "feat: simplify dashboard-summary to writeDownCount only, remove leitner logic"
```

---

### Task 5: Simplify `app/api/dashboard-summary/route.ts`

**Files:**
- Modify: `app/api/dashboard-summary/route.ts`

- [ ] **Step 1: Replace the route handler**

```ts
// app/api/dashboard-summary/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'
import { computeDashboardSummary } from '@/lib/dashboard-summary'

export async function GET() {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()

  const { data: userSessions } = await db
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)

  const sessionIds = (userSessions ?? []).map((s: { id: string }) => s.id)
  if (sessionIds.length === 0) {
    return NextResponse.json({ writeDownCount: 0 })
  }

  const summary = await computeDashboardSummary(db, sessionIds)
  return NextResponse.json(summary)
}
```

- [ ] **Step 2: Run build to confirm no type errors**

```bash
npm run build 2>&1 | grep "dashboard-summary"
```

Expected: no errors mentioning dashboard-summary.

- [ ] **Step 3: Commit**

```bash
git add app/api/dashboard-summary/route.ts
git commit -m "chore: strip leitner fields from dashboard-summary API response"
```

---

### Task 6: Simplify `app/api/practice-items/route.ts`

**Files:**
- Modify: `app/api/practice-items/route.ts`

- [ ] **Step 1: Replace the file contents**

```ts
// app/api/practice-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

const PRACTICE_ITEMS_COLUMNS = [
  'id', 'session_id', 'annotation_id', 'type', 'sub_category', 'original',
  'correction', 'explanation', 'reviewed', 'written_down', 'created_at',
  'updated_at', 'flashcard_front', 'flashcard_back', 'flashcard_note',
  'importance_score', 'importance_note',
].join(', ')

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()

  const { data: userSessions } = await db
    .from('sessions')
    .select('id')
    .eq('user_id', user.id)

  const sessionIds = (userSessions ?? []).map((s: { id: string }) => s.id)
  if (sessionIds.length === 0) return NextResponse.json([])

  const url = new URL(req.url)
  const sortParam = url.searchParams.get('sort')
  const orderCol = sortParam === 'importance' ? 'importance_score' : 'created_at'
  const orderOpts = sortParam === 'importance'
    ? { ascending: false, nullsFirst: false }
    : { ascending: false }

  const { data, error } = await db
    .from('practice_items')
    .select(PRACTICE_ITEMS_COLUMNS)
    .in('session_id', sessionIds)
    .order(orderCol, orderOpts)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const db = createServerClient()

  const { data: session } = await db
    .from('sessions')
    .select('id')
    .eq('id', body.session_id)
    .eq('user_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const { data, error } = await db
    .from('practice_items')
    .insert(body)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Run existing practice-items tests**

```bash
npm test -- __tests__/api/practice-items.test.ts
```

Expected: all tests pass (no leitner assertions existed in this file).

- [ ] **Step 3: Commit**

```bash
git add app/api/practice-items/route.ts
git commit -m "chore: remove getDueFlashcards and leitner columns from practice-items route"
```

---

### Task 7: Remove leitner side-effect from PATCH handler

**Files:**
- Modify: `app/api/practice-items/[id]/route.ts`

- [ ] **Step 1: Replace the file contents**

```ts
// app/api/practice-items/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getAuthenticatedUser } from '@/lib/auth'

type Params = { params: { id: string } }

async function verifyOwnership(db: ReturnType<typeof createServerClient>, itemId: string, userId: string) {
  const { data: item } = await db
    .from('practice_items')
    .select('session_id')
    .eq('id', itemId)
    .single()

  if (!item) return false

  const { data: session } = await db
    .from('sessions')
    .select('id')
    .eq('id', item.session_id)
    .eq('user_id', userId)
    .single()

  return !!session
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const owned = await verifyOwnership(db, params.id, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json() as { reviewed?: boolean; written_down?: boolean }
  const update: Record<string, unknown> = {}
  if (body.reviewed !== undefined) update.reviewed = body.reviewed
  if (body.written_down !== undefined) update.written_down = body.written_down

  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const { error } = await db
    .from('practice_items')
    .update(update)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createServerClient()
  const owned = await verifyOwnership(db, params.id, user.id)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await db
    .from('practice_items')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Run build to confirm no type errors**

```bash
npm run build 2>&1 | grep "practice-items/\[id\]"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/practice-items/\[id\]/route.ts
git commit -m "chore: remove leitner side-effect from written_down PATCH handler"
```

---

### Task 8: Remove flashcards tab from NavDrawer

**Files:**
- Modify: `components/NavDrawer.tsx`

- [ ] **Step 1: Delete the flashcards entry from the TABS array**

In `components/NavDrawer.tsx`, find and remove this entire object from the `TABS` array (lines ~42–53):

```ts
  {
    href: '/flashcards',
    labelKey: 'nav.flashcards',
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className="w-5 h-5 flex-shrink-0" aria-hidden="true">
        <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
```

- [ ] **Step 2: Verify TABS has 4 entries (Home, Practice, Insights, Settings)**

```bash
grep -c "href:" components/NavDrawer.tsx
```

Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add components/NavDrawer.tsx
git commit -m "chore: remove flashcards nav tab"
```

---

### Task 9: Simplify home page — remove leitner widget

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update the DashboardSummary interface at the top of the file**

Find:
```ts
interface DashboardSummary {
  leitnerDue: boolean
  dueBoxes: number[]
  nextDueDate: string | null
  writeDownCount: number
}
```

Replace with:
```ts
interface DashboardSummary {
  writeDownCount: number
}
```

- [ ] **Step 2: Remove the two leitner widget Link blocks**

Find and delete the entire "Daily habit widget" `<div>` that contains the leitner `<Link>` blocks, keeping only the write-down pill. The section to replace is:

```tsx
      {/* Daily habit widget */}
      <div className="flex flex-col gap-3">
        {summary !== null && summary.leitnerDue && (
          <Link
            href="/flashcards"
            data-testid="widget-cards-due"
            className="flex items-center gap-3 rounded-2xl border border-chip-border bg-chip-bg px-4 py-3.5 text-chip-text hover:opacity-90 transition-opacity"
          >
            <span className="text-xl">🃏</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-snug">
                {summary.dueBoxes.length === 1
                  ? t('home.reviewPile', { n: String(summary.dueBoxes[0]) })
                  : t('home.reviewPiles', { piles: summary.dueBoxes.join(' & ') })}
              </p>
              <p className="text-xs opacity-70 mt-0.5">{t('home.flashcardsWaiting')}</p>
            </div>
            <span className="text-lg opacity-50">›</span>
          </Link>
        )}
        {summary !== null && !summary.leitnerDue && (
          <Link
            href="/flashcards"
            data-testid="widget-cards-due"
            className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-text-tertiary hover:opacity-80 transition-opacity"
          >
            <span className="text-xl">🃏</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">{t('home.flashcardsCaughtUp')}</p>
              {summary.nextDueDate && (
                <p className="text-xs opacity-60 mt-0.5">
                  {t('home.flashcardsDueDay', {
                    n: String(summary.dueBoxes[0] ?? ''),
                    day: new Date(summary.nextDueDate + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
                  })}
                </p>
              )}
            </div>
            <span className="text-lg opacity-30">›</span>
          </Link>
        )}
        <Link
          href="/practice?written_down=false"
          data-testid="widget-write-down"
          className="flex items-center px-3 py-1.5 rounded-full border border-widget-write-border bg-widget-write-bg text-sm text-widget-write-text hover:bg-widget-write-bg-hover transition-colors"
        >
          {summary !== null ? t('home.toWriteDown', { n: summary.writeDownCount }) : '—'}
        </Link>
      </div>
```

Replace with:
```tsx
      {/* Daily habit widget */}
      <div className="flex flex-col gap-3">
        <Link
          href="/practice?written_down=false"
          data-testid="widget-write-down"
          className="flex items-center px-3 py-1.5 rounded-full border border-widget-write-border bg-widget-write-bg text-sm text-widget-write-text hover:bg-widget-write-bg-hover transition-colors"
        >
          {summary !== null ? t('home.toWriteDown', { n: summary.writeDownCount }) : '—'}
        </Link>
      </div>
```

- [ ] **Step 3: Build to confirm no TypeScript errors**

```bash
npm run build 2>&1 | head -30
```

Expected: clean build (or only errors from tasks not yet done).

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "chore: remove leitner widget from home page, keep write-down pill"
```

---

### Task 10: Clean up i18n keys

**Files:**
- Modify: `lib/i18n.ts`

- [ ] **Step 1: Remove all leitner/flashcard-review i18n keys from both locales**

Open `lib/i18n.ts`. In both the `en-NZ` and `es-AR` translation objects, remove every key that starts with `flashcard.` or `flashcards.`, plus the leitner home widget keys. Keys to remove (both locales):

```
'nav.flashcards'
'flashcard.cardOptions'
'flashcard.deleteCard'
'flashcard.deleteConfirmTitle'
'flashcard.deleteConfirmBody'
'flashcard.deleteConfirmDelete'
'flashcard.deleteConfirmCancel'
'flashcard.deleteError'
'flashcard.allCaughtUp'
'flashcard.allCaughtUpBody'
'flashcard.goHome'
'flashcard.reviewPileHeading'
'flashcard.confirmDone'
'flashcard.allCaughtUpNextDue'
'home.reviewPile'
'home.reviewPiles'
'home.flashcardsWaiting'
'home.flashcardsCaughtUp'
'home.flashcardsDueDay'
'flashcards.loading'
'flashcards.error'
'flashcards.empty'
```

Note: `'writeItDown.subtitle'` and `'writeItDown.confirmLabel'` and `'flashcard.deleteCard'`-related keys in the `writeItDown` namespace are used by the practice page write-it-down flow — do **not** remove those unless they reference the `/flashcards` route. Only remove keys listed above.

- [ ] **Step 2: Verify no remaining references to removed keys**

```bash
grep -r "nav\.flashcards\|flashcard\.\|flashcards\.\|home\.reviewPile\|home\.flashcard" \
  app components lib --include="*.tsx" --include="*.ts" | grep -v "i18n.ts"
```

Expected: no output (no remaining usages of removed keys).

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Run the build**

```bash
npm run build
```

Expected: clean build with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.ts
git commit -m "chore: remove leitner/flashcard-review i18n keys from both locales"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass, no leitner-related test files present.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Confirm deleted files are gone**

```bash
ls app/flashcards/page.tsx components/LeitnerDashboard.tsx lib/leitner.ts \
   app/api/practice-items/leitner-review/route.ts \
   __tests__/lib/leitner.test.ts __tests__/api/leitner-review.test.ts 2>&1
```

Expected: "No such file or directory" for all six.

- [ ] **Step 5: Confirm no remaining leitner references in source**

```bash
grep -r "leitner\|LeitnerDashboard\|flashcards\b" \
  app components lib __tests__ --include="*.ts" --include="*.tsx" \
  | grep -v "node_modules" | grep -v "supabase/migrations"
```

Expected: no output.
