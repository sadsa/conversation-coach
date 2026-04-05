# Design: Annotation Readability, Remove Strengths, and Insights Practice Filter

**Date:** 2026-03-23

## Summary

Three related improvements:
1. Make the original (wrong) phrase readable in the annotation card modal — no strikethrough.
2. Remove the concept of "strengths" from the entire application.
3. Scope the Insights page to only reflect annotations explicitly saved as practice items.

---

## 1. Annotation Card Readability

### Problem

In `AnnotationCard.tsx`, the original text is rendered as `line-through text-gray-500` on a dark background. Gray-500 has poor contrast, and strikethrough makes it harder to read what the user actually said wrong.

### Change

Remove strikethrough. Use coloured pill styling consistent with the inline transcript highlights:

**Before:**
```tsx
<span className="line-through text-gray-500">{annotation.original}</span>
{' → '}
<span className="font-semibold text-lg">{annotation.correction}</span>
```

**After:**
```tsx
<span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">
  {annotation.original}
</span>
{' → '}
<span className="font-semibold text-lg text-[#86efac]">
  {annotation.correction}
</span>
```

The red pill and green correction reuse the exact colours from `AnnotatedText.tsx` (grammar highlight = `bg-[#3b1a1a] text-[#fca5a5]`, strength/positive = `text-[#86efac]`), making the visual language consistent. Since strengths are removed (see section 2), there is only one rendering path in this component — the correction path. The "Keep this!" branch is deleted.

---

## 2. Remove Strengths from the Entire Application

### Decision

Strength annotations (things Claude noticed you did well) are not useful for improvement. The feature is removed entirely from the app.

### What a "strength" was

- `AnnotationType` value: `'strength'`
- Sub-categories that mapped only to strength: `voseo`, `natural-expressions`, `fluency`
- Rendered in the transcript with green highlight (`bg-[#0f2e1a] text-[#86efac]`)
- Shown in the annotation card as "Keep this! «...»"
- Tracked in the Insights "What you're doing well" section via `get_subcategory_strength_counts` RPC

### Changes by file

**`lib/types.ts`**
- Remove `'strength'` from `AnnotationType` → `'grammar' | 'naturalness'`
- Remove `voseo`, `natural-expressions`, `fluency` from `SUB_CATEGORIES`, `SUB_CATEGORY_TYPE_MAP`, and `SUB_CATEGORY_DISPLAY`
- `SUB_CATEGORIES` drops from 16 to 13 values

**`lib/claude.ts`**
- Remove item 3 ("Strengths") from the prompt instruction list
- Remove `'strength'` from the `ClaudeAnnotation.type` union
- Remove `voseo`, `natural-expressions`, `fluency` from the sub-category list in the prompt
- Remove the "null for strengths" note from the `correction` field instruction

**`components/AnnotatedText.tsx`**
- Remove the `strength` entry from the annotation type → CSS class map

**`components/AnnotationCard.tsx`**
- Remove `strength` from `TYPE_LABEL`
- Remove the strength/no-correction branch (`annotation.correction` falsy → "Keep this!")
- Component now always renders the correction path (covered by change in section 1)

**`app/sessions/[id]/page.tsx`**
- Remove `strength: 0` from the counts object
- Remove `· {counts.strength} strengths` from the session subtitle line

**`components/InsightsCardList.tsx`**
- Remove `strengthChips` from `Props`
- Remove `StrengthChip` import
- Remove the "What you're doing well" section entirely

**`lib/insights.ts`**
- Remove `StrengthChip` interface and `strengthChips` from `InsightsData`
- Remove Query 2 (`get_subcategory_strength_counts` RPC call)
- Remove building of strength chips
- Remove `strengthChips` from the return value
- Remove the `mode: 'error' | 'strength'` parameter from `computeTrend` — delete the strength branch and simplify to error-only logic (the strength branch is currently exercised by tests which are also deleted)

**`app/insights/page.tsx`**
- Remove `strengthChips` from destructure
- Remove `strengthChips` prop from `<InsightsCardList />`

**Tests** (`__tests__/` files)
- Remove all strength-related fixtures, assertions, and props from:
  - `AnnotationCard.test.tsx`
  - `InsightsCardList.test.tsx`
  - `PracticeList.test.tsx`
  - `insights.test.ts`
  - `pipeline.test.ts`

### Database

`annotations.type` and `practice_items.type` are declared as a PostgreSQL enum: `annotation_type AS ENUM ('grammar', 'naturalness', 'strength')` (defined in `001_initial.sql`). The enum must be updated.

New migration `20260323000000_insights_rpc_practice_filter.sql` includes:

```sql
-- 1. Delete existing strength data
DELETE FROM practice_items WHERE type = 'strength';
DELETE FROM annotations WHERE type = 'strength';

-- 2. Rebuild the enum without 'strength'
ALTER TYPE annotation_type RENAME TO annotation_type_old;
CREATE TYPE annotation_type AS ENUM ('grammar', 'naturalness');

ALTER TABLE annotations
  ALTER COLUMN type TYPE annotation_type USING type::text::annotation_type;

ALTER TABLE practice_items
  ALTER COLUMN type TYPE annotation_type USING type::text::annotation_type;

DROP TYPE annotation_type_old;

-- 3. Drop the strength RPC
DROP FUNCTION IF EXISTS get_subcategory_strength_counts();
```

---

## 3. Insights Scoped to Practice Items

### Problem

Insights aggregate all annotations Claude produced, including ones the user disagreed with. The user only wants patterns from mistakes they've consciously acknowledged by saving to their practice list.

### Solution

Add an `EXISTS` filter to the 3 remaining insight RPCs so they only count/return annotations that have a corresponding `practice_items` row.

Filter added to each RPC:
```sql
AND EXISTS (SELECT 1 FROM practice_items pi WHERE pi.annotation_id = a.id)
```

**`get_subcategory_error_counts`** — add to the `WHERE` clause
**`get_subcategory_session_counts`** — add to the `WHERE` clause
**`get_subcategory_examples`** — add inside the inner subquery `WHERE` clause

`get_subcategory_strength_counts` is dropped (see section 2), not replaced.

No changes to `lib/insights.ts`, `app/insights/page.tsx`, or any UI component beyond those already listed in section 2. The RPC return shapes are unchanged; only the rows returned change.

### Notes

- `practice_items.annotation_id` is nullable (`ON DELETE SET NULL`). The `EXISTS` filter naturally excludes NULL rows — correct behaviour.
- With fewer practice-saved annotations, some sub-categories may not appear in Insights at all. This is expected.
- The `computeTrend` ≥4 sessions threshold is unchanged; fewer qualifying annotations means fewer trends shown, which is correct.

---

## Files Changed

| File | Change |
|------|--------|
| `components/AnnotationCard.tsx` | Remove strikethrough + strength branch; apply red pill / green correction style |
| `components/AnnotatedText.tsx` | Remove strength highlight entry |
| `components/InsightsCardList.tsx` | Remove `strengthChips` prop and "What you're doing well" section |
| `app/sessions/[id]/page.tsx` | Remove strength count from session subtitle |
| `app/insights/page.tsx` | Remove `strengthChips` destructure and prop |
| `lib/types.ts` | Remove `strength` type; remove `voseo`, `natural-expressions`, `fluency` sub-categories |
| `lib/claude.ts` | Remove strengths from prompt and `ClaudeAnnotation` type |
| `lib/insights.ts` | Remove `StrengthChip`, strength query, `computeTrend` strength mode and its test cases |
| `components/PracticeList.tsx` | Remove `strength` from `TYPE_DOT_CLASS`; remove `strength` from the filter tab array; remove the no-correction/strength render path |
| `supabase/migrations/20260323000000_insights_rpc_practice_filter.sql` | Delete strength data; rebuild `annotation_type` enum; drop strength RPC; replace 3 error RPCs with practice-filtered versions |
| `__tests__/components/AnnotationCard.test.tsx` | Remove strength test cases |
| `__tests__/components/InsightsCardList.test.tsx` | Remove strength chips props/assertions |
| `__tests__/components/PracticeList.test.tsx` | Remove strength fixtures |
| `__tests__/lib/insights.test.ts` | Remove strength-related assertions and `computeTrend` strength test block |
| `__tests__/lib/pipeline.test.ts` | Update comment on voseo mismatch test to reflect voseo is no longer in the taxonomy |
