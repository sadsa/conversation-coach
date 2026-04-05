# Annotation Readability, Remove Strengths & Insights Practice Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the strengths feature from the entire app, fix annotation card readability, and scope Insights to practice-saved items only.

**Architecture:** Changes flow outward from `lib/types.ts` (type definitions) → component layer → database. Removing `'strength'` from `AnnotationType` and 3 sub-categories from `SUB_CATEGORIES` will cause TypeScript errors that guide the remaining changes. The new SQL migration handles data cleanup, enum rebuild, and RPC replacement.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (PostgreSQL + RPC functions), Vitest + React Testing Library

---

## File Map

| File | What changes |
|------|-------------|
| `lib/types.ts` | Remove `'strength'` from `AnnotationType`; remove `voseo`, `natural-expressions`, `fluency` from `SUB_CATEGORIES`, `SUB_CATEGORY_TYPE_MAP`, `SUB_CATEGORY_DISPLAY` |
| `lib/claude.ts` | Remove strengths from prompt text and `ClaudeAnnotation.type` union |
| `lib/insights.ts` | Remove `StrengthChip`, strength RPC call, `computeTrend` strength mode |
| `components/AnnotatedText.tsx` | Remove `strength` entry from `TYPE_CLASS` |
| `components/AnnotationCard.tsx` | Remove strength branch and `TYPE_LABEL` entry; apply new pill styling |
| `components/InsightsCardList.tsx` | Remove `strengthChips` prop and "What you're doing well" section |
| `components/PracticeList.tsx` | Remove `strength` from `TYPE_DOT_CLASS` and filter tab array |
| `app/sessions/[id]/page.tsx` | Remove strength count from session subtitle |
| `app/insights/page.tsx` | Remove `strengthChips` from destructure and component prop |
| `supabase/migrations/20260323000000_insights_rpc_practice_filter.sql` | New file: delete strength data, rebuild enum, drop strength RPC, replace 3 error RPCs with practice filter |
| `__tests__/components/AnnotationCard.test.tsx` | Remove `strengthAnnotation` fixture and "keep-this" test |
| `__tests__/components/InsightsCardList.test.tsx` | Remove `mockStrengths`, `StrengthChip` import, strength-related tests |
| `__tests__/components/PracticeList.test.tsx` | Remove `strengthItem` fixture and strength-specific tests |
| `__tests__/lib/insights.test.ts` | Remove `computeTrend` strength describe block; update error tests to drop `mode` arg |
| `__tests__/lib/pipeline.test.ts` | Update comment on voseo mismatch test |

---

## Task 1: Remove strength from core types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Edit `lib/types.ts`**

  Make these changes:

  ```ts
  // Line 9 — before:
  export type AnnotationType = 'grammar' | 'naturalness' | 'strength'
  // after:
  export type AnnotationType = 'grammar' | 'naturalness'
  ```

  ```ts
  // SUB_CATEGORIES — remove 'voseo', 'natural-expressions', 'fluency'
  export const SUB_CATEGORIES = [
    'verb-conjugation', 'subjunctive', 'gender-agreement', 'number-agreement',
    'ser-estar', 'por-para', 'tense-selection', 'article-usage', 'word-order',
    'vocabulary-choice', 'register', 'phrasing',
    'other',
  ] as const
  ```

  ```ts
  // SUB_CATEGORY_TYPE_MAP — remove the three strength entries
  export const SUB_CATEGORY_TYPE_MAP: Partial<Record<SubCategory, AnnotationType>> = {
    'verb-conjugation': 'grammar',
    'subjunctive': 'grammar',
    'gender-agreement': 'grammar',
    'number-agreement': 'grammar',
    'ser-estar': 'grammar',
    'por-para': 'grammar',
    'tense-selection': 'grammar',
    'article-usage': 'grammar',
    'word-order': 'grammar',
    'vocabulary-choice': 'naturalness',
    'register': 'naturalness',
    'phrasing': 'naturalness',
  }
  ```

  ```ts
  // SUB_CATEGORY_DISPLAY — remove 'voseo', 'natural-expressions', 'fluency' keys
  export const SUB_CATEGORY_DISPLAY: Record<SubCategory, string> = {
    'verb-conjugation': 'Verb conjugation',
    'subjunctive': 'Subjunctive',
    'gender-agreement': 'Gender agreement',
    'number-agreement': 'Number agreement',
    'ser-estar': 'Ser / Estar',
    'por-para': 'Por / Para',
    'tense-selection': 'Tense selection',
    'article-usage': 'Article usage',
    'word-order': 'Word order',
    'vocabulary-choice': 'Vocabulary choice',
    'register': 'Register',
    'phrasing': 'Phrasing',
    'other': 'Other',
  }
  ```

- [ ] **Step 2: Check TypeScript errors**

  Run: `npm run build 2>&1 | grep "error TS" | head -30`

  Expected: errors in files that reference `'strength'` or the removed sub-categories — these are your work list for the next tasks.

- [ ] **Step 3: Commit**

  ```bash
  git add lib/types.ts
  git commit -m "feat: remove strength annotation type and sub-categories from types"
  ```

---

## Task 2: Update Claude prompt

**Files:**
- Modify: `lib/claude.ts`

- [ ] **Step 1: Remove strengths from the prompt and type union**

  Open `lib/claude.ts`. Make these changes:

  1. In the prompt string, delete the "Strengths" bullet point entirely:
     ```
     3. Strengths — things the speaker did well, especially correct use of voseo, lunfardo, or natural Argentine expressions (type: "strength")
     ```

  2. Change the `type` field description line from:
     ```
     - "type": one of "grammar", "naturalness", or "strength"
     ```
     to:
     ```
     - "type": one of "grammar" or "naturalness"
     ```

  3. Remove `voseo`, `natural-expressions`, `fluency` from the sub-category list in the prompt.

  4. Change the `correction` field note from:
     ```
     - "correction": the improved version (null for strengths)
     ```
     to:
     ```
     - "correction": the improved version
     ```

  5. Update the `ClaudeAnnotation` interface:
     ```ts
     // before:
     type: 'grammar' | 'naturalness' | 'strength'
     // after:
     type: 'grammar' | 'naturalness'
     ```

- [ ] **Step 2: Run build to confirm no new errors**

  Run: `npm run build 2>&1 | grep "error TS" | grep "claude"`

  Expected: no errors in claude.ts

- [ ] **Step 3: Commit**

  ```bash
  git add lib/claude.ts
  git commit -m "feat: remove strengths from Claude analysis prompt"
  ```

---

## Task 3: Remove strength from inline transcript highlight

**Files:**
- Modify: `components/AnnotatedText.tsx`
- Test: `__tests__/components/AnnotatedText.test.tsx`

- [ ] **Step 1: Check existing test for strength**

  Run: `grep -n "strength" __tests__/components/AnnotatedText.test.tsx`

  If any strength references exist, note them for removal in step 2.

- [ ] **Step 2: Remove `strength` entry from `TYPE_CLASS`**

  In `components/AnnotatedText.tsx`, delete line 7:
  ```ts
  strength:    'bg-[#0f2e1a] text-[#86efac] decoration-[#4ade80]',
  ```

  If the test file had strength references, remove them now.

- [ ] **Step 3: Run component tests**

  Run: `npm test -- __tests__/components/AnnotatedText.test.tsx`

  Expected: all pass

- [ ] **Step 4: Commit**

  ```bash
  git add components/AnnotatedText.tsx __tests__/components/AnnotatedText.test.tsx
  git commit -m "feat: remove strength highlight from inline transcript"
  ```

---

## Task 4: Fix annotation card — remove strength, apply new styling

**Files:**
- Modify: `components/AnnotationCard.tsx`
- Modify: `__tests__/components/AnnotationCard.test.tsx`

- [ ] **Step 1: Update the test — remove strength test case**

  In `__tests__/components/AnnotationCard.test.tsx`:

  1. Delete the `strengthAnnotation` fixture (lines 13–17).
  2. Delete the test `'renders keep-this message for strength annotation'` (lines 38–41).

- [ ] **Step 2: Run tests to confirm they still pass (minus the deleted one)**

  Run: `npm test -- __tests__/components/AnnotationCard.test.tsx`

  Expected: 5 tests pass (was 6; the deleted test is gone)

- [ ] **Step 3: Update `AnnotationCard.tsx`**

  1. Remove `strength` from `TYPE_LABEL`:
     ```ts
     export const TYPE_LABEL: Record<AnnotationType, string> = {
       grammar: '🔴 Grammar',
       naturalness: '🟡 Naturalness',
     }
     ```

  2. Replace the `annotation.correction ? ... : ...` block with the correction-only path using the new pill styling:
     ```tsx
     <p className="text-base">
       <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
         {annotation.original}
       </span>
       {' → '}
       <span className="font-semibold text-lg text-[#86efac]">
         {annotation.correction}
       </span>
     </p>
     ```
     The entire `{annotation.correction ? (...) : (...)}` conditional is replaced by this single block. The "Keep this!" branch is deleted.

- [ ] **Step 4: Run tests**

  Run: `npm test -- __tests__/components/AnnotationCard.test.tsx`

  Expected: all 5 pass. The test `'renders correction for grammar annotation'` checks `screen.getByText('Yo fui')` — this now finds it inside the red pill span, which is fine.

- [ ] **Step 5: Commit**

  ```bash
  git add components/AnnotationCard.tsx __tests__/components/AnnotationCard.test.tsx
  git commit -m "feat: remove strength from annotation card; apply pill styling for original text"
  ```

---

## Task 5: Remove strength from Practice List

**Files:**
- Modify: `components/PracticeList.tsx`
- Modify: `__tests__/components/PracticeList.test.tsx`

- [ ] **Step 1: Update the test — remove strength fixtures and tests**

  In `__tests__/components/PracticeList.test.tsx`:

  1. Delete the `strengthItem` fixture.
  2. Delete the test `'renders original (no correction) for strength items'`.
  3. Delete the test `'modal shows original text for strength items (no correction)'`.
  4. In `'filters by type'`: remove `strengthItem` from the `items` array — keep only `[grammarItem]` (or add a naturalness item if needed to make the test meaningful).
  5. In `'select-all selects filtered items'`: remove `strengthItem` from the `items` array.

- [ ] **Step 2: Run tests to confirm they pass**

  Run: `npm test -- __tests__/components/PracticeList.test.tsx`

  Expected: all remaining tests pass

- [ ] **Step 3: Update `PracticeList.tsx`**

  1. Remove `strength: 'bg-green-400'` from `TYPE_DOT_CLASS`:
     ```ts
     const TYPE_DOT_CLASS: Record<AnnotationType, string> = {
       grammar: 'bg-red-400',
       naturalness: 'bg-yellow-400',
     }
     ```

  2. Remove `'strength'` from the filter tab array (around line 320):
     ```tsx
     {(['all', 'grammar', 'naturalness'] as Filter[]).map(f => (
     ```

  3. Find any "no correction" / strength render path in `SwipeableItem` or the modal (look for `item.correction ? ... : ...` branches that render the original text without a correction arrow). Remove those branches — every practice item now has a correction.

     Hint: search for `correction` in the file to find these branches. The practice list modal and list row should always render `original → correction`.

- [ ] **Step 4: Run tests**

  Run: `npm test -- __tests__/components/PracticeList.test.tsx`

  Expected: all pass

- [ ] **Step 5: Commit**

  ```bash
  git add components/PracticeList.tsx __tests__/components/PracticeList.test.tsx
  git commit -m "feat: remove strength from practice list component"
  ```

---

## Task 6: Remove strength from session page subtitle

**Files:**
- Modify: `app/sessions/[id]/page.tsx`

- [ ] **Step 1: Update the counts object and subtitle line**

  In `app/sessions/[id]/page.tsx`:

  1. Change the counts initialiser from:
     ```ts
     const counts = { grammar: 0, naturalness: 0, strength: 0 }
     ```
     to:
     ```ts
     const counts = { grammar: 0, naturalness: 0 }
     ```

  2. Change the subtitle JSX from:
     ```tsx
     {durationLabel} · {counts.grammar} grammar · {counts.naturalness} naturalness · {counts.strength} strengths
     ```
     to:
     ```tsx
     {durationLabel} · {counts.grammar} grammar · {counts.naturalness} naturalness
     ```

- [ ] **Step 2: Run build**

  Run: `npm run build 2>&1 | grep "error TS" | grep "sessions"`

  Expected: no errors

- [ ] **Step 3: Commit**

  ```bash
  git add "app/sessions/[id]/page.tsx"
  git commit -m "feat: remove strength count from session subtitle"
  ```

---

## Task 7: Remove strength from Insights layer

**Files:**
- Modify: `lib/insights.ts`
- Modify: `components/InsightsCardList.tsx`
- Modify: `app/insights/page.tsx`
- Modify: `__tests__/lib/insights.test.ts`
- Modify: `__tests__/components/InsightsCardList.test.tsx`

- [ ] **Step 1: Update `__tests__/lib/insights.test.ts`**

  1. Delete the entire `describe('computeTrend (strengths — higher is better)', ...)` block (lines 34–50).
  2. In the remaining error tests, `computeTrend` currently receives 5 args (`..., 'error'`). After the implementation change the function takes 4 args — update all 6 calls to drop the `'error'` argument:
     ```ts
     // before:
     expect(computeTrend(0, 0, 0, 0, 'error')).toBe('keep-practicing')
     // after:
     expect(computeTrend(0, 0, 0, 0)).toBe('keep-practicing')
     ```
     Do this for all 6 calls in the error describe block.

- [ ] **Step 2: Run test to confirm it fails (function signature not yet changed)**

  Run: `npm test -- __tests__/lib/insights.test.ts`

  Expected: TypeScript/type error or test failure because the function still requires the `mode` argument. This confirms the test is driving the implementation.

- [ ] **Step 3: Update `lib/insights.ts`**

  1. Delete the `StrengthChip` interface (lines 51–55).
  2. Remove `strengthChips: StrengthChip[]` from `InsightsData`.
  3. Remove Query 2 — the `get_subcategory_strength_counts` RPC call and the `strengthCounts` variable (lines 88–89).
  4. Remove the building of `strengthChips` (lines 152–157).
  5. Remove `strengthChips` from the `return` statement.
  6. Simplify `computeTrend` — remove the `mode` parameter entirely and delete the `else` branch:
     ```ts
     export function computeTrend(
       recentErrors: number,
       recentTurns: number,
       olderErrors: number,
       olderTurns: number,
     ): TrendResult {
       const recentRate = recentTurns === 0 ? 0 : recentErrors / recentTurns
       const olderRate = olderTurns === 0 ? 0 : olderErrors / olderTurns

       if (recentRate === 0 && olderRate === 0) return 'keep-practicing'
       if (olderRate === 0 && recentRate > 0) return 'needs-attention'
       if (recentRate < olderRate * 0.8) return 'making-progress'
       if (recentRate > olderRate * 1.2) return 'needs-attention'
       return 'keep-practicing'
     }
     ```
  7. Update the call site (line 116) — remove the `'error'` argument:
     ```ts
     trendMap.set(subCat, computeTrend(recent.errors, recent.turns, older.errors, older.turns))
     ```

- [ ] **Step 4: Run insights tests**

  Run: `npm test -- __tests__/lib/insights.test.ts`

  Expected: all 6 error-mode tests pass

- [ ] **Step 5: Update `__tests__/components/InsightsCardList.test.tsx`**

  1. Remove `import type { FocusCard, StrengthChip } from '@/lib/insights'` — change to just `FocusCard`.
  2. Delete the `mockStrengths` fixture.
  3. Remove `strengthChips={mockStrengths}` from all `render(...)` calls (5 occurrences). The prop no longer exists.
  4. Delete the test `'renders strength chips'` (lines 61–65).
  5. Delete the test `'omits strengths section when strengthChips is empty'` (lines 67–70).

- [ ] **Step 6: Update `components/InsightsCardList.tsx`**

  1. Change the import — remove `StrengthChip`:
     ```ts
     import type { FocusCard, TrendResult } from '@/lib/insights'
     ```
  2. Update `Props`:
     ```ts
     interface Props {
       focusCards: FocusCard[]
       totalSessions: number
     }
     ```
  3. Update the function signature:
     ```ts
     export function InsightsCardList({ focusCards, totalSessions }: Props) {
     ```
  4. Delete the entire strengths `<section>` block (lines 112–126).

- [ ] **Step 7: Update `app/insights/page.tsx`**

  1. Change the destructure:
     ```ts
     const { totalReadySessions, focusCards } = await fetchInsightsData()
     ```
  2. Remove `strengthChips={strengthChips}` from `<InsightsCardList />`.

- [ ] **Step 8: Run all insights-related tests**

  Run: `npm test -- __tests__/lib/insights.test.ts __tests__/components/InsightsCardList.test.tsx`

  Expected: all pass

- [ ] **Step 9: Commit**

  ```bash
  git add lib/insights.ts components/InsightsCardList.tsx app/insights/page.tsx \
    __tests__/lib/insights.test.ts __tests__/components/InsightsCardList.test.tsx
  git commit -m "feat: remove strengths from insights layer"
  ```

---

## Task 8: Update pipeline test comment

**Files:**
- Modify: `__tests__/lib/pipeline.test.ts`

- [ ] **Step 1: Find the voseo mismatch test**

  Run: `grep -n "voseo" __tests__/lib/pipeline.test.ts`

- [ ] **Step 2: Update the comment**

  Find the comment that reads something like:
  ```ts
  // 'voseo' belongs to 'strength', not 'grammar' — should be reset to 'other'
  ```
  Change it to:
  ```ts
  // 'voseo' is not in the taxonomy — should be reset to 'other'
  ```
  No logic changes.

- [ ] **Step 3: Run pipeline tests**

  Run: `npm test -- __tests__/lib/pipeline.test.ts`

  Expected: all pass

- [ ] **Step 4: Commit**

  ```bash
  git add __tests__/lib/pipeline.test.ts
  git commit -m "chore: update voseo test comment — no longer a type mismatch, just unknown sub-category"
  ```

---

## Task 9: Write the database migration

**Files:**
- Create: `supabase/migrations/20260323000000_insights_rpc_practice_filter.sql`

This migration does three things: (1) deletes existing strength data, (2) rebuilds the `annotation_type` enum without `'strength'`, (3) replaces the 3 error insight RPCs with practice-filtered versions.

- [ ] **Step 1: Create the migration file**

  Create `supabase/migrations/20260323000000_insights_rpc_practice_filter.sql` with this content:

  ```sql
  -- supabase/migrations/20260323000000_insights_rpc_practice_filter.sql

  -- 1. Delete existing strength data (must happen before enum change)
  DELETE FROM practice_items WHERE type = 'strength';
  DELETE FROM annotations WHERE type = 'strength';

  -- 2. Rebuild annotation_type enum without 'strength'
  ALTER TYPE annotation_type RENAME TO annotation_type_old;
  CREATE TYPE annotation_type AS ENUM ('grammar', 'naturalness');

  ALTER TABLE annotations
    ALTER COLUMN type TYPE annotation_type USING type::text::annotation_type;

  ALTER TABLE practice_items
    ALTER COLUMN type TYPE annotation_type USING type::text::annotation_type;

  DROP TYPE annotation_type_old;

  -- 3. Drop the strength RPC (no longer called)
  DROP FUNCTION IF EXISTS get_subcategory_strength_counts();

  -- 4. Replace error count RPC — scoped to practice-saved annotations only
  CREATE OR REPLACE FUNCTION get_subcategory_error_counts()
  RETURNS TABLE (
    sub_category text,
    type text,
    total_count bigint,
    session_count bigint
  ) AS $$
    SELECT
      a.sub_category,
      a.type::text,
      COUNT(*) AS total_count,
      COUNT(DISTINCT a.session_id) AS session_count
    FROM annotations a
    JOIN sessions s ON a.session_id = s.id
    WHERE s.status = 'ready'
      AND a.type IN ('grammar', 'naturalness')
      AND a.sub_category != 'other'
      AND EXISTS (SELECT 1 FROM practice_items pi WHERE pi.annotation_id = a.id)
    GROUP BY a.sub_category, a.type
    ORDER BY total_count DESC
  $$ LANGUAGE sql STABLE;

  -- 5. Replace per-session counts RPC — scoped to practice-saved annotations only
  CREATE OR REPLACE FUNCTION get_subcategory_session_counts()
  RETURNS TABLE (
    sub_category text,
    session_id uuid,
    created_at timestamptz,
    error_count bigint,
    user_turn_count bigint
  ) AS $$
    SELECT
      a.sub_category,
      a.session_id,
      s.created_at,
      COUNT(*) AS error_count,
      (
        SELECT COUNT(*) FROM transcript_segments ts
        WHERE ts.session_id = a.session_id
          AND ts.speaker = ANY(COALESCE(s.user_speaker_labels, ARRAY[]::text[]))
      ) AS user_turn_count
    FROM annotations a
    JOIN sessions s ON a.session_id = s.id
    WHERE s.status = 'ready'
      AND a.type IN ('grammar', 'naturalness')
      AND a.sub_category != 'other'
      AND EXISTS (SELECT 1 FROM practice_items pi WHERE pi.annotation_id = a.id)
    GROUP BY a.sub_category, a.session_id, s.created_at, s.user_speaker_labels
    ORDER BY s.created_at DESC
  $$ LANGUAGE sql STABLE;

  -- 6. Replace examples RPC — scoped to practice-saved annotations only
  CREATE OR REPLACE FUNCTION get_subcategory_examples()
  RETURNS TABLE (
    sub_category text,
    original text,
    correction text,
    start_char int,
    end_char int,
    segment_text text,
    session_title text,
    session_created_at timestamptz
  ) AS $$
    SELECT
      a.sub_category,
      a.original,
      a.correction,
      a.start_char,
      a.end_char,
      ts.text AS segment_text,
      s.title AS session_title,
      s.created_at AS session_created_at
    FROM (
      SELECT ann.*,
        ROW_NUMBER() OVER (PARTITION BY ann.sub_category ORDER BY s_inner.created_at DESC) AS row_num
      FROM annotations ann
      JOIN sessions s_inner ON ann.session_id = s_inner.id
      WHERE ann.sub_category != 'other'
        AND ann.type IN ('grammar', 'naturalness')
        AND s_inner.status = 'ready'
        AND EXISTS (SELECT 1 FROM practice_items pi WHERE pi.annotation_id = ann.id)
    ) a
    JOIN transcript_segments ts ON a.segment_id = ts.id
    JOIN sessions s ON a.session_id = s.id
    WHERE a.row_num <= 2
    ORDER BY a.sub_category, a.row_num
  $$ LANGUAGE sql STABLE;
  ```

- [ ] **Step 2: Apply the migration to your local Supabase instance**

  Run: `npx supabase db push` (or `npx supabase migration up` depending on your workflow)

  Expected: migration applies cleanly with no errors.

  > If you don't have a local Supabase instance, apply manually via the Supabase dashboard SQL editor.

- [ ] **Step 3: Commit**

  ```bash
  git add supabase/migrations/20260323000000_insights_rpc_practice_filter.sql
  git commit -m "feat: delete strength data, rebuild annotation_type enum, scope insight RPCs to practice items"
  ```

---

## Task 10: Final verification

- [ ] **Step 1: Run the full test suite**

  Run: `npm test`

  Expected: all tests pass, no references to `strength` remain in failure output.

- [ ] **Step 2: Run a production build**

  Run: `npm run build`

  Expected: no TypeScript errors, no build errors.

- [ ] **Step 3: Run lint**

  Run: `npm run lint`

  Expected: no errors.

- [ ] **Step 4: Confirm no stray `strength` references remain in source**

  Run: `grep -r "strength" --include="*.ts" --include="*.tsx" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=supabase`

  Expected: zero results (the migration SQL file is excluded by the flags above and is expected to contain the word).

- [ ] **Step 5: Final commit if any minor fixes were needed**

  ```bash
  git add -p
  git commit -m "chore: clean up any remaining strength references"
  ```
