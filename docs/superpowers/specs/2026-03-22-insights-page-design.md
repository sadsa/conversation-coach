# Insights Page — Design Spec

**Date:** 2026-03-22
**Status:** Approved

## Overview

A dedicated `/insights` page that aggregates annotation data across all sessions to show the user which Spanish mistake categories they make most often, whether those patterns are improving or worsening, and concrete examples from their own transcripts.

---

## Sub-category Taxonomy

A fixed list of sub-categories. Claude picks exactly one per annotation at analysis time, defaulting to `"other"` if nothing fits cleanly. Each non-`other` sub-category belongs to exactly one annotation type — there is no overlap.

### Grammar
- `verb-conjugation`
- `subjunctive`
- `gender-agreement`
- `number-agreement`
- `ser-estar`
- `por-para`
- `tense-selection`
- `article-usage`
- `word-order`

### Naturalness
- `vocabulary-choice`
- `register` (too formal or informal for context)
- `phrasing` (technically correct but sounds unnatural)

### Strength
- `voseo`
- `natural-expressions`
- `fluency`

### Catch-all
- `other` (any type)

Display names (e.g. "Ser / Estar", "Vocabulary choice") are mapped from these keys via a constant in the frontend.

---

## TypeScript Type Changes

### `lib/types.ts`

Add a named union type and a parallel runtime constant (TypeScript union types are erased at runtime and cannot be used for validation checks):

```ts
export const SUB_CATEGORIES = [
  'verb-conjugation', 'subjunctive', 'gender-agreement', 'number-agreement',
  'ser-estar', 'por-para', 'tense-selection', 'article-usage', 'word-order',
  'vocabulary-choice', 'register', 'phrasing',
  'voseo', 'natural-expressions', 'fluency', 'other',
] as const

export type SubCategory = typeof SUB_CATEGORIES[number]
```

Add `sub_category: SubCategory` to both the `Annotation` and `PracticeItem` interfaces.

### `lib/claude.ts`

Add `sub_category: SubCategory` to the `ClaudeAnnotation` interface. Update the system prompt to include the taxonomy list and instruct Claude to return exactly one `sub_category` value per annotation from the list.

---

## Schema Changes

Two `ALTER TABLE` migrations — no new tables.

```sql
ALTER TABLE annotations
  ADD COLUMN sub_category text NOT NULL DEFAULT 'other';

ALTER TABLE practice_items
  ADD COLUMN sub_category text NOT NULL DEFAULT 'other';
```

Existing rows default to `'other'`. Sessions re-analysed after this ships will receive proper sub-categories.

---

## Claude Prompt Changes

`lib/claude.ts` — `analyseUserTurns` system prompt gains:

1. The full taxonomy list above
2. An instruction to pick exactly one `sub_category` value per annotation from that list, using `"other"` as fallback

Each annotation in Claude's JSON response gains the field:
```json
{ "sub_category": "subjunctive" }
```

In `lib/pipeline.ts`, in the same block where character offsets are validated, also:
1. Validate `sub_category` using `SUB_CATEGORIES.includes(value)` — reset to `"other"` if invalid
2. Validate that `type` matches the expected type for the given `sub_category` (e.g. `verb-conjugation` must have `type = 'grammar'`) — reset `sub_category` to `"other"` if mismatched (the `type` field is authoritative)
3. Add `sub_category` to the annotation insert object explicitly (it won't be forwarded automatically)

The `/api/sessions/[id]` GET route fetches annotations via `db.from('annotations').select('*')`, so the new `sub_category` column will be included automatically once the migration runs — no route change needed.

---

## Practice Item Insert Path

Practice items are created explicitly by the user via `AnnotationCard`, which calls `POST /api/practice-items`. Update `AnnotationCard.tsx`'s `handleAdd` function to include `sub_category` in the fetch body, sourced from the annotation object prop. The API route (`app/api/practice-items/route.ts`) calls `db.from('practice_items').insert(body)` as a direct pass-through — any field in the body is inserted, so no API route changes are needed.

---

## Insights Page (`/insights`)

### Navigation

Add a fourth tab to `BottomNav` between "Practice" and "Settings". Use a bar-chart SVG icon (consistent with the existing Heroicons-style stroked icons). The tab uses `aria-label="Insights"` and `href="/insights"` — no visible text label (consistent with the existing icon-only tabs). Adding a fourth `flex-1` tab reduces each tab's width from ~33% to 25% — verify this is acceptable on small screens before shipping.

### Page Architecture

The `/insights` page is a server component that fetches all data at request time and passes it as props. The card expand/collapse toggle is interactive and implemented as a `'use client'` sub-component (`InsightsCardList`) that receives the pre-fetched data as props — no client-side fetching occurs.

### Data Loading

**Query 1 — All-time sub-category counts (grammar + naturalness):**

```sql
SELECT sub_category, type,
       COUNT(*) AS total_count,
       COUNT(DISTINCT a.session_id) AS session_count
FROM annotations a
JOIN sessions s ON a.session_id = s.id
WHERE s.status = 'ready'
  AND a.type IN ('grammar', 'naturalness')
  AND a.sub_category != 'other'
GROUP BY sub_category, type
ORDER BY total_count DESC
```

Run an equivalent query for `type = 'strength'` (excluding `other`) for the strengths section.

**Y (total ready sessions):** `SELECT COUNT(*) FROM sessions WHERE status = 'ready'`. This single count is the denominator for all sub-category cards regardless of type. Show up to 3 strength sub-categories; if fewer than 3 exist, show however many do.

**Query 2 — Per-session counts for trend:**

Define a Supabase RPC function named `get_subcategory_session_counts` in a new migration:

```sql
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
      WHERE ts.session_id = s.id
        AND ts.speaker = ANY(COALESCE(s.user_speaker_labels, ARRAY[]::text[]))
    ) AS user_turn_count
  FROM annotations a
  JOIN sessions s ON a.session_id = s.id
  WHERE s.status = 'ready'
    AND a.type IN ('grammar', 'naturalness')
    AND a.sub_category != 'other'
  GROUP BY a.sub_category, a.session_id, s.created_at, s.user_speaker_labels
  ORDER BY s.created_at DESC
$$ LANGUAGE sql STABLE;
```

Call via `db.rpc('get_subcategory_session_counts')`. Partition results in application code: "recent" = 3 most recent distinct sessions by `created_at`; "older" = all prior.

**Query 3 — Example annotations (up to 2 per sub-category):**

```sql
SELECT
  a.sub_category,
  a.original,
  a.correction,
  a.start_char,
  a.end_char,
  ts.text AS segment_text,
  s.title AS session_title,
  s.created_at AS session_created_at
FROM annotations a
JOIN transcript_segments ts ON a.segment_id = ts.id
JOIN sessions s ON a.session_id = s.id
WHERE s.status = 'ready'
  AND a.type IN ('grammar', 'naturalness')
  AND a.sub_category != 'other'
ORDER BY s.created_at DESC
```

Fetch all rows and partition in application code: take the first 2 rows per `sub_category` (most recent by `session.created_at`). If `start_char`/`end_char` are out of bounds for `segment_text`, render `original` without underline rather than crashing.

### Trend Calculation

Applied per sub-category after partitioning sessions into recent (last 3) and older (all prior):

```
recent_rate = recent_errors / recent_user_turns
older_rate  = older_errors  / older_user_turns
```

Division edge cases — treat the rate as 0 if `user_turns` is 0 for that group.

**For grammar/naturalness (errors — lower is better):**
- Both rates 0 → `keep-practicing`
- `older_rate == 0` and `recent_rate > 0` → `needs-attention` (new mistake appearing is flagged as needing attention)
- `recent_rate < older_rate * 0.8` → `making-progress`
- `recent_rate > older_rate * 1.2` → `needs-attention`
- Otherwise → `keep-practicing`

**For strengths (higher is better — all outcomes inverted):**
- Both rates 0 → `keep-practicing`
- `older_rate == 0` and `recent_rate > 0` → `making-progress` (a new strength appearing is positive)
- `recent_rate > older_rate * 1.2` → `making-progress`
- `recent_rate < older_rate * 0.8` → `needs-attention`
- Otherwise → `keep-practicing`

**Trend threshold:** Suppress trend chips entirely (cards still render without a chip) when fewer than 4 sessions with `status = 'ready'` exist. 4 is the minimum needed to have at least 1 session in the "older" group — below this the comparison is meaningless.

---

## "Where to Focus" Section

Ranked list of sub-categories with at least 1 `grammar` or `naturalness` annotation, ordered by all-time count descending. `other` is excluded. Each non-`other` sub-category maps to exactly one type; the `type` column from Query 1 is used as the card's type label.

Each card:
- Rank number (1–N)
- Sub-category display name
- Type label (grammar / naturalness) and "appears in X of Y sessions"
- All-time error count
- Trend chip (omitted if fewer than 4 ready sessions): `↑ making progress` (green) / `→ keep practicing` (grey) / `↓ needs attention` (red)

**Expanded state** (handled by `InsightsCardList` client component):
- Shows up to 2 example annotations (most recent by session `created_at`)
- Each example: original segment text with offending phrase underlined via `start_char`/`end_char`, correction, session title + date
- "See all N examples →" links to `/practice?sub_category=<key>`

---

## "What You're Doing Well" Section

Show up to 3 strength sub-categories by all-time count (show fewer if fewer than 3 exist). `other` is excluded. Omit the section entirely if no strength annotations exist. Each chip: display name, times noted, trend chip (same suppression rule, inverted logic per above).

---

## Practice Items Page Filter Extension

`app/practice/page.tsx` is already `'use client'`. Add `useSearchParams()` directly (no `<Suspense>` wrapper needed since the page is already fully client-side). Read the `?sub_category=<key>` param once on mount and pass it to `PracticeList` as a new prop: `initialSubCategory?: SubCategory`. Immediately call `useRouter().replace(pathname)` on mount to strip the param from the URL — this prevents it from re-applying if the user navigates away and returns via the bottom nav.

Update the existing `<PracticeList items={items} onDeleted={...} />` render call to also pass `initialSubCategory`.

`PracticeList` adds `subCategoryFilter: SubCategory | null` state, initialised from `initialSubCategory`. It applies this as an additional client-side filter on the already-fetched item list — no API change needed. When the filter is active and matches no items, the existing "No items match this filter" empty state is shown (no special message needed).

When the user taps any type tab (All / Grammar / Naturalness / Strength), reset `subCategoryFilter` to `null`. The URL has already been cleaned on mount, so no further URL manipulation is needed.

---

## Empty State

0 ready sessions: render a message explaining insights will appear once conversations are recorded. No cards shown.

1–3 ready sessions: cards render normally, trend chips omitted. A single session is enough to show frequency data and examples.

---

## Out of Scope

- Per-session score history / sparkline charts
- Automatic practice session suggestions
- Voice-matched speaker tracking across sessions
