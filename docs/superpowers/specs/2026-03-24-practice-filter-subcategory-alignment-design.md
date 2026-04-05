# Design: Practice Filter & Sub-Category Pill Alignment

**Date:** 2026-03-24
**Status:** Approved

## Summary

Two changes:
1. Replace the type-tab filter row with a flat sorted sub-category pill row. Remove the `typeFilter` state and `Filter` type alias entirely.
2. Add an informational sub-category pill to annotation cards in three places: the transcript card, the practice item modal, and the compact SwipeableItem row.

---

## Change 1: Flat Sub-Category Filter Row

### Removing the type tab row

Remove the filter array `['all', 'grammar', 'naturalness', 'strength']` (cast `as Filter[]`) and the `Filter` type alias (`type Filter = 'all' | AnnotationType`) from `PracticeList.tsx`. The `AnnotationType` import must be **retained** — it is still used by `TYPE_DOT_CLASS`. Note: `'strength'` was already orphaned (`AnnotationType` is `'grammar' | 'naturalness'` only).

### Sub-category pill row

Replace the type-tab row with a single row of **14 pills total: "All" + the 13 values from `SUB_CATEGORIES`** (including `'other'`), sorted by item count descending.

**Sorting:** compute per-sub-category item count from the already-fetched `items` prop. Sort the 13 `SUB_CATEGORIES` entries descending by count. Tiebreak: preserve the original `SUB_CATEGORIES` declaration order (stable sort).

**"All" pill styles:**
- Inactive (a sub-category is active): `border-gray-700 text-gray-400`
- Active (`subCategoryFilter === null`): `border-violet-500 text-violet-300 bg-violet-500/10`

**Colour coding** — applied to the 13 sub-category pills only. Counts are computed from the full unfiltered `items` prop (not from `filtered`) so the colour tiers remain stable while a filter is active:

| Condition | Style |
|---|---|
| Count equals the highest non-zero value | Red: `border-red-800 text-red-400 bg-red-950/40` |
| Count equals the second-distinct non-zero value | Amber: `border-amber-700 text-amber-400 bg-amber-950/40` |
| Other non-zero count | Default: `border-gray-700 text-gray-300` |
| Count = 0 | Dimmed: `border-gray-800 text-gray-600` |

Edge cases:
- **All non-zero pills share the same count:** all receive red; amber never assigned.
- **Exactly one non-zero pill:** that pill receives red; all others are dimmed.
- **All pills are zero (empty list or no items):** all 13 sub-category pills are dimmed.

**Count display:** render the count inline after the label in a `text-[11px] opacity-80` span. This rendering does not change when the pill is in active state — the count always uses the same `text-[11px] opacity-80` style regardless of active/inactive.

**Active state for sub-category pills (filter row only):** `border-indigo-500 text-indigo-300 bg-indigo-500/10` overrides the colour-coded style. These active styles apply exclusively to the filter row; annotation card pills (Change 2) are non-interactive and use a fixed indigo style.

### Interaction rules

- **"All" when a sub-category is active** — clears `subCategoryFilter`.
- **"All" when already active (`subCategoryFilter === null`)** — no-op.
- **Inactive sub-category pill** — sets `subCategoryFilter` to that sub-category.
- **Active sub-category pill** — clears `subCategoryFilter` (toggle off).

### Navigating from insights (`?sub_category=X`)

Initialise `subCategoryFilter` with `initialSubCategory ?? null`. When `initialSubCategory` is set, the matching pill renders in the active (indigo) style on the first render.

### Removals

- Remove the `"Filtered by: X  Clear ×"` chip below the filter row.
- Remove the `typeFilter` guard from `filtered`. Post-change: `filtered` shows all items when `subCategoryFilter === null`; otherwise shows only items where `item.sub_category === subCategoryFilter`.

### Type dot and modal title

- The coloured type dot (`TYPE_DOT_CLASS[item.type]`) is **kept** in SwipeableItem. Its alignment changes to `items-start` (see below).
- The practice item modal title (`TYPE_LABEL[openItem.type]`) is **kept** unchanged.

---

## Change 2: Sub-Category Pill on Annotation Cards

Add an informational, non-interactive pill showing `SUB_CATEGORY_DISPLAY[sub_category]` in three places.

**Pill styling** (used in all three locations):
```
border border-indigo-800 text-indigo-400 bg-indigo-950 rounded-full px-2 py-0.5 text-xs
```

### AnnotationCard (`components/AnnotationCard.tsx`)

Below the explanation paragraph, above the button — in **both** the `isAdded=false` (active button) and `isAdded=true` (disabled "✓ Added" button) render branches. The pill is placed before the conditional button, not inside either branch:

```
original → correction
explanation text
[Verb conjugation]          ← new pill
[Add to practice list]
```

### Practice item modal (`components/PracticeList.tsx`)

Below the explanation paragraph. The modal has no action button, so the pill is the last element in the modal body:

```
Modal title: "🔴 Grammar"
original → correction
explanation text
[Verb conjugation]          ← new pill (last element)
```

### SwipeableItem compact row (`components/PracticeList.tsx`)

The current inner div (`flex-1 min-w-0 text-sm`) wraps the original/correction inline with coloured highlight spans. Change it to a two-line flex column. The pill is a child of this inner div (not a sibling). The existing highlight classes on the original/correction spans are **preserved**. Precise nesting:

```jsx
<div className="flex items-start gap-3 ...">        {/* parent: items-center → items-start */}
  <input type="checkbox" />
  <span className="w-2 h-2 rounded-full ..." />     {/* type dot, now top-aligned */}
  <div className="flex-1 min-w-0 text-sm flex flex-col gap-0.5">
    <div>
      <span className="bg-[#3b1a1a] text-[#fca5a5] px-1.5 py-0.5 rounded">{item.original}</span>
      {' → '}
      <span className="font-medium text-[#86efac]">{item.correction}</span>
    </div>
    <span className="border border-indigo-800 text-indigo-400 bg-indigo-950 rounded-full px-2 py-0.5 text-xs self-start">
      {SUB_CATEGORY_DISPLAY[item.sub_category]}
    </span>
  </div>
</div>
```

---

## Files to Change

| File | Change |
|---|---|
| `components/PracticeList.tsx` | Remove `typeFilter` state, `Filter` type alias, and type-tab row (retain `AnnotationType` import); add 14-pill sorted colour-coded row; remove sub-category chip; simplify `filtered`; update SwipeableItem to `items-start` + two-line flex-col inner div + pill; add pill to practice item modal |
| `components/AnnotationCard.tsx` | Add sub-category pill below explanation |
| `__tests__/components/PracticeList.test.tsx` | See test changes below |
| `__tests__/components/AnnotationCard.test.tsx` | Add assertion that `SUB_CATEGORY_DISPLAY[annotation.sub_category]` is rendered (e.g. `'Subjunctive'` for the existing `grammarAnnotation` fixture which has `sub_category: 'subjunctive'`) |

### PracticeList test changes

**Delete these tests** (inside the `'PracticeList'` and `'PracticeList — sub-category filter'` describe blocks):
- `'filters by type'` — clicks a naturalness type-tab button that no longer exists
- `'clears sub-category filter when a type tab is clicked'` (in the `'PracticeList — sub-category filter'` describe block) — entire premise is the removed type-tab interaction

**Update these tests:**
- `'shows filter buttons when not in bulk mode'` — remove the `grammar` type-tab assertion; assert that the "All" pill and at least one sub-category pill are present
- `'hides filter buttons when in bulk mode'` — remove the `grammar` type-tab query; assert the "All" pill is hidden AND that a known sub-category pill (e.g. the `'Other'` pill from the `grammarItem` fixture) is also hidden
- `'exits bulk mode when back button is clicked'` — remove the `grammar` type-tab reference; keep the assertion that the "All" pill reappears

**Add these new tests** (fixture note: the existing `grammarItem` fixture uses `sub_category: 'other'`; tests that check pill sorting or specific labels should use a two-item array with distinct sub-categories and counts):
- All 14 pills render (All + 13 sub-categories including `'Other'`)
- Clicking a sub-category pill hides non-matching items
- Clicking the active pill again clears the filter (toggle — all items visible)
- `initialSubCategory` prop activates the matching pill and hides non-matching items
- Clicking "All" when a sub-category is active shows all items
- Pills sorted: given two items with different sub-categories, the sub-category with the higher count pill appears before the lower-count one in the DOM
- Sub-category pill label (`SUB_CATEGORY_DISPLAY` text) is visible inside the SwipeableItem row
- Practice item modal shows sub-category pill text after clicking an item

---

## Out of Scope

- Persisting the filter to `localStorage` or URL
- Hiding zero-count pills (they are shown dimmed)
- Multi-select sub-category filtering
- Grouping pills by type (grammar / naturalness)
