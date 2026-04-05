# Design: UI Improvements & Flashcard Review System

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Three independent improvements to the Conversation Coach app:

1. **Sub-category filter collapse** — reduce vertical space on the Practice Items page by collapsing the 14-pill filter row to 4 pills by default.
2. **Session list redesign** — make the home page session list more readable on mobile, with the full row tappable.
3. **Flashcard review system** — a new `/flashcards` page with a swipeable card-flip review experience generated from practice items.

---

## Feature 1: Sub-category Filter Collapse

### Goal
Save vertical space on first load. Users can expand to see all sub-categories when needed.

### Behaviour
- Default (collapsed): `All` pill + the 3 highest-count sub-categories from `sortedSubCategories` + a `More +N` pill, where N is computed dynamically as `sortedSubCategories.length - 3` (currently always 10 given 13 sub-categories). Zero-count pills are included in N and visible once expanded.
- Tapping `More +N` sets `isExpanded = true`, replacing the More pill with all remaining pills inline. The row wraps naturally. There is no way to collapse back.
- Edge case — if `sortedSubCategories.length <= 3`: render all pills with no More pill.
- `isExpanded` initial value: `true` if `initialSubCategory` is not `undefined` (the prop is typed `SubCategory | undefined`); `false` otherwise. This ensures the active pill from a URL param is always visible on load.
- The active pill can never be hidden in the collapsed state during normal usage: a user can only select a hidden pill after tapping "More +N" (which expands). The URL-param case is covered by the initialisation rule above.

### Files changed
- `components/PracticeList.tsx` — add `isExpanded` state, conditional pill rendering.

---

## Feature 2: Session List Redesign

### Goal
Make each session row readable and fully tappable on mobile. Remove inline rename from the home page.

### Row layout (two-line)
- **Line 1:** Session title, bold, truncated with ellipsis if needed.
- **Line 2:** Status (colour-coded, using existing `STATUS_COLOUR` and `STATUS_LABEL` maps) · date (formatted as `toLocaleDateString()`) · duration (if non-null, formatted as `Xm Ys`, e.g. `8m 32s`).
  - Note: the session detail page formats duration as `X min` — the list row uses the more precise `Xm Ys` format. This intentional difference is acceptable.
- Chevron `›` on the right.
- The entire row is a single `<Link>`. Conditional href preserved: `ready` → `/sessions/${s.id}`; all other statuses → `/sessions/${s.id}/status`.

### Rename
- Removed from home page entirely.
- The entire `handleRename` function declaration (lines 22–29 of `app/page.tsx`) is deleted, along with the `onRename={handleRename}` JSX prop at the `<SessionList>` call site (line 93).
- `onRename` removed from `SessionList`'s `Props` interface entirely (deleted, not optional).
- The session detail page (`app/sessions/[id]/page.tsx`) already has `InlineEdit` wired to its own `handleRename` (line 57) — no changes needed there. It is the sole rename path going forward.

### Files changed
- `components/SessionList.tsx` — remove `InlineEdit` import, remove `onRename` from Props, new two-line row layout, full-row `<Link>`.
- `app/page.tsx` — remove `handleRename` function and `onRename={handleRename}` JSX prop on `<SessionList>`.

---

## Feature 3: Flashcard Review System

### Goal
A focused, distraction-free review mode for practice items. Each card shows an English context sentence (front) to prompt recall of the correct Spanish phrase (back), with a collapsible explanation of why the original was wrong.

### Flashcard concept
- **Front**: An invented English sentence that correctly expresses the meaning. The correct English equivalent of the practice phrase is highlighted, prompting the user to recall how to express it in Spanish.
- **Back**: The Spanish equivalent sentence with the correct phrase highlighted. A collapsible note explains why the original (wrong) phrase was incorrect from a Rioplatense register perspective.

### Data flow
Claude generates flashcard fields per annotation → pipeline writes them to `annotations` table → user taps "Add to practice list" in `AnnotationCard` → `POST /api/practice-items` carries the fields through → `practice_items` stores them → `GET /api/practice-items` returns them → `/flashcards` page uses them. The session detail API uses `select('*')` for annotations so new columns are returned automatically — no change needed there.

**Known limitation — re-analysis:** `POST /api/sessions/:id/analyse` deletes all existing annotations and practice items and recreates them. After re-analysis, newly created practice items will have flashcard fields populated (since the new annotations contain them), but items must be re-added manually via `AnnotationCard`. This is consistent with the existing re-analysis behaviour (all practice items are lost on re-analysis regardless) and is acceptable for now.

### 3a. Data model

New DB migration (`supabase/migrations/20260325000000_add_flashcard_fields.sql`) adds three nullable `text` columns to **both** `annotations` and `practice_items`:

| Column | Description |
|---|---|
| `flashcard_front` | English context sentence. The correct English phrase wrapped in `[[...]]`. |
| `flashcard_back` | Spanish sentence with the correct phrase wrapped in `[[...]]`. |
| `flashcard_note` | 1–2 sentence Rioplatense-register explanation of why the original was wrong. |

All six new columns are nullable. Existing rows have `null` and are excluded from the flashcard deck.

Type changes in `lib/types.ts`:
- `Annotation` gains: `flashcard_front: string | null`, `flashcard_back: string | null`, `flashcard_note: string | null`
- `PracticeItem` gains: `flashcard_front: string | null`, `flashcard_back: string | null`, `flashcard_note: string | null`

### 3b. Claude prompt update

`lib/claude.ts` changes:

1. **`ClaudeAnnotation` interface** — add:
   ```ts
   flashcard_front: string | null
   flashcard_back: string | null
   flashcard_note: string | null
   ```

2. **System prompt** — add the three fields to both the prose instructions and the inline JSON shape declaration at the end of the prompt string:
   - **`flashcard_front`**: An invented English sentence that correctly expresses the meaning of the phrase being practised. The correct English equivalent phrase is wrapped in `[[double brackets]]`. Example: `"it can intoxify you because [[it flushes out]] your electrolytes"` (where "it flushes out" is the correct English for what the user should learn to say as "se te lleva" in Spanish).
   - **`flashcard_back`**: A Spanish sentence using the correct phrase in the same context, with that phrase wrapped in `[[double brackets]]`. Example: `"puede intoxicarte porque [[se te lleva]] los electrolitos"`
   - **`flashcard_note`**: 1–2 sentences explaining why the original was wrong from a Rioplatense/naturalness perspective. Concise and register-focused.

3. **`max_tokens`** — increase from `4096` to `8192`.

### 3c. Pipeline update

`lib/pipeline.ts` — include in the `annotations` insert (lines 79–89):
```ts
flashcard_front: a.flashcard_front ?? null,
flashcard_back: a.flashcard_back ?? null,
flashcard_note: a.flashcard_note ?? null,
```
If Claude omits a field, `null` is inserted — the columns are nullable.

### 3d. AnnotationCard update

`components/AnnotationCard.tsx` — include in the `POST /api/practice-items` body in `handleAdd()`:
```ts
flashcard_front: annotation.flashcard_front ?? null,
flashcard_back: annotation.flashcard_back ?? null,
flashcard_note: annotation.flashcard_note ?? null,
```
The POST route does a bare `insert(body)` so no route changes are needed for these fields to be stored.

### 3e. Practice items API update

`app/api/practice-items/route.ts` — append the three new column names to the existing explicit string on line 9 (do not switch to `'*'`):
```
'id, session_id, annotation_id, type, sub_category, original, correction, explanation, reviewed, created_at, updated_at, flashcard_front, flashcard_back, flashcard_note'
```

### 3f. Flashcard UI

#### New route: `app/flashcards/page.tsx`
- Client component.
- Fetches all practice items from `GET /api/practice-items` on mount.
- Filters to items where `flashcard_front` and `flashcard_back` are both non-null. `FlashcardDeck` receives only flashcard-ready items.
- API returns newest-first — no additional sort needed.
- Renders a progress counter (`Card X of N`) above `<FlashcardDeck items={flashcardItems} />`.
- Empty state: "No flashcards yet — complete a session to generate cards."
- Back navigation: a `←` link to `/` (reliable across PWA/Safari; avoids `router.back()` which is unreliable when `window.history.length` is 1).

#### New component: `components/FlashcardDeck.tsx`

**Props:** `items: PracticeItem[]` — all have non-null `flashcard_front` and `flashcard_back`.

**State:**
- `currentIndex: number` — 0
- `isFlipped: boolean` — false
- `isNoteExpanded: boolean` — false
- `isSwiping` ref (`useRef<boolean>(false)`) — used to suppress tap/flip during a swipe gesture

**Highlight rendering helper:** `renderHighlighted(text: string, colour: 'purple' | 'green')` — splits on `[[` and `]]` to extract the highlighted phrase. If brackets are absent or unbalanced (e.g. `[[word` with no closing `]]`), renders the full string as plain, unhighlighted text — no error thrown.

**Front face:**
- `renderHighlighted(item.flashcard_front!, 'purple')`. Highlight: `text-violet-300 bg-violet-500/20 rounded px-1`.
- "Tap to reveal Spanish" hint at the bottom.

**Back face:**
- `renderHighlighted(item.flashcard_back!, 'green')`. Highlight: `text-green-300 bg-green-500/20 rounded px-1`.
- Collapsible note panel:
  - Header: `item.original` (strikethrough red) → `item.correction ?? '—'` (green) + `"Why? ▾/▴"` toggle.
  - Body (expanded): `item.flashcard_note`. If `flashcard_note` is null, hide the note panel entirely (no toggle shown).
  - Resets to collapsed when advancing to the next card.

**Interactions:**

*Swipe to advance:*
- `react-swipeable` with `delta: 30` (higher threshold than PracticeList's 10 to require intentional horizontal swipe) and `trackMouse: false`.
- `onSwiping`: set `isSwiping.current = true`.
- `onSwipedLeft` (if `absX > 80`): advance to next card (loop at end), reset `isFlipped` and `isNoteExpanded` to false. Card replaces immediately — no flip-back animation.
- `onSwiped*` (all): reset `isSwiping.current = false` after a tick (`setTimeout(..., 0)`) so the subsequent click event sees it correctly.

*Tap to flip:*
- `onClick` on the card body: if `isSwiping.current` is true, do nothing (swipe in progress). Otherwise toggle `isFlipped`. Flipping back to front resets `isNoteExpanded` to false.

**Layout:** Card centred in its container. Progress counter in parent page.

#### Navigation
`components/BottomNav.tsx` — add Flashcards tab between Practice and Insights (`href: '/flashcards'`, `exact: false`, card/flashcard SVG icon). Five tabs with `flex-1` (~75px each on 375px) is acceptable for icon-only navigation.

### Files changed (Feature 3)
- `supabase/migrations/20260325000000_add_flashcard_fields.sql`
- `lib/types.ts` — `Annotation` and `PracticeItem`
- `lib/claude.ts` — `ClaudeAnnotation`, system prompt + JSON shape, `max_tokens`
- `lib/pipeline.ts` — flashcard fields in annotations insert
- `components/AnnotationCard.tsx` — flashcard fields in POST body
- `app/api/practice-items/route.ts` — extend `.select()`
- `app/flashcards/page.tsx` — new page
- `components/FlashcardDeck.tsx` — new component
- `components/BottomNav.tsx` — Flashcards tab

---

## Out of Scope
- Marking cards as "known" / spaced repetition
- Filtering the flashcard deck by sub-category or session
- Entry-point buttons on Home / Session / Practice pages (deferred to later)
- Retroactive flashcard generation for existing practice items
