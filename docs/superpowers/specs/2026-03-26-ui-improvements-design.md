# UI Improvements — Design Spec
Date: 2026-03-26

## Overview

Three focused UI improvements: reframing the Insights page around weaknesses, adding navigation loading indicators, and compacting the home page upload component for mobile.

---

## 1. Insights — Wording & Trend Removal

### What changes

Remove all improvement-tracking logic. The app currently computes a per-sub-category trend (improving / neutral / needs attention) by comparing error rates across recent vs older sessions. This information is not useful to the user and adds visual noise.

**Code to remove from `lib/insights.ts`** (all in the same file — nothing in `lib/types.ts`):
- `TrendResult` type
- `computeTrend()` function
- The `get_subcategory_session_counts` RPC call and all trend-grouping logic in `fetchInsightsData()` (the `showTrends` branch, `trendMap`, and all related variables)
- The `trend` field from the `FocusCard` interface

**Code to remove from `components/InsightsCardList.tsx`**:
- `TREND_CONFIG` constant
- `TrendChip` component
- All `showTrend` / `TrendChip` rendering in `FocusCardRow`
- The `trend` prop reference in `FocusCardRow`

**Wording changes:**

| Location | Before | After |
|---|---|---|
| `app/insights/page.tsx` — `<h1>` | `Insights` | `Where you're struggling` |
| `app/insights/page.tsx` — subtitle `<p>` | `Patterns across all your sessions` | `Your recurring mistakes, ranked by frequency` |
| `components/InsightsCardList.tsx` — section `<h2>` | `Where to focus` | *(remove — redundant with page title)* |

The page `<h1>` ("Where you're struggling") renders outside the empty-state conditional and will show even when there are zero sessions. This is acceptable — the subtitle still tells the user what Insights is for, and the empty-state message below provides context.

### Test file updates

- **Delete** `__tests__/lib/insights.test.ts` — it exclusively tests `computeTrend()` which is being removed.
- **Update** `__tests__/components/InsightsCardList.test.tsx` — remove the `trend` field from all mock `FocusCard` objects, delete any test cases that assert on `TrendChip` rendering or trend-related behaviour.

### What stays the same

- Focus cards ranked by total error count
- Session count display (`appears in N of M sessions`)
- Expanded examples with underlined original text and correction
- "See all N examples →" link to Practice filtered by sub-category

---

## 2. Navigation Loading Indicators

### Problem

Bottom nav taps trigger server-side data fetching (e.g. Insights runs 3 Supabase RPC calls). Users see a blank screen for 2–3 seconds with no feedback.

### Solution

Add a `loading.tsx` file for each server-rendered route. Next.js App Router renders the loading file instantly while the server component resolves, providing immediate visual feedback.

**Note:** `app/page.tsx` (Home) is a `'use client'` component that fetches data via `useEffect` after hydration — the server renders its shell almost instantly. `app/loading.tsx` is still worth adding for consistency and to cover any future conversion to a server component, but it will flash very briefly or not at all on the Home route in practice. The highest-impact loading screens are Insights, Practice, and Flashcards.

**Files to create:**
- `app/loading.tsx` (Home — low impact, included for consistency)
- `app/practice/loading.tsx`
- `app/flashcards/loading.tsx`
- `app/insights/loading.tsx`
- `app/settings/loading.tsx`

Each loading screen shows a simple skeleton matching the rough layout of that page — a few rounded grey placeholder bars with `animate-pulse`. No spinners, no copy, just structure.

No caching is added. Data is always fresh on every navigation.

### Skeleton shapes (per page)

- **Home**: one wide bar (title), one narrow bar (subtitle), one short row (upload area placeholder), then 3 session-list item skeletons
- **Practice**: one wide bar (title), pill row placeholder, then 4 list item skeletons
- **Flashcards**: centred card placeholder with two bars inside
- **Insights**: one wide bar (title), one narrow bar (subtitle), then 4 card skeletons
- **Settings**: one wide bar (title), then 3 setting-row skeletons

---

## 3. Compact Upload Row

### Problem

The current `DropZone` uses `p-12` padding and a large centred layout designed for desktop drag-and-drop. On mobile it consumes excessive vertical space (~160px+) for a single-tap action.

### Solution

Replace the large box with a compact single-line row component. The new layout:

```
[ 🎙️ ]  Upload conversation          [ Browse ]
         MP3, M4A, WAV, OPUS
```

- Full-width container with `border border-gray-700 rounded-xl`
- Left: microphone emoji
- Centre: "Upload conversation" label (semibold, `text-gray-100`) + format hint below (`text-xs text-gray-500`): `MP3, M4A, WAV, OPUS` (the "up to 500 MB / 2 hours" size hint is intentionally dropped — it adds length without meaningful value in the compact layout)
- Right: "Browse" button (`bg-violet-600`, small, rounded)
- On drag-over: border highlights to `border-indigo-500 bg-indigo-500/10` (intentional change from the previous `border-violet-500 bg-violet-500/10` — indigo matches the app's active/selected colour)
- Error message renders below the row as before

The hidden `<input type="file">` and all drag event handlers remain. The component is still named `DropZone` and its `onFile` prop interface is unchanged — only the rendered markup changes.

Desktop drag-and-drop continues to work; the entire row is the drop target.

### Test file updates

- `__tests__/components/DropZone.test.tsx`: the existing test that checks for "OPUS" in the format hint will continue to pass since the format hint still includes "OPUS". No test changes required unless a test explicitly asserts on the "500 MB" or "2 hours" text (in which case that assertion should be removed).

---

## Out of Scope

- Removing or modifying `get_subcategory_examples` or `get_subcategory_error_counts` RPCs (still needed)
- Changes to the Practice page sub-category pill filtering
- Any caching or revalidation strategy
- Responsive breakpoints (compact row used on all screen sizes)
