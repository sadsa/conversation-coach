# Design: Remove Leitner Review System

**Date:** 2026-04-15  
**Branch:** feature/leitner-review  
**Status:** Approved

## Goal

Remove all in-app flashcard review infrastructure (Leitner box tracking, review UI, review API). Physical card review is managed entirely offline. Keep `written_down` tracking so users can see which practice items still need to be physically written as cards.

## What Stays

- `written_down` field on `practice_items`
- Home page write-down pill (`/practice?written_down=false`)
- `dashboard-summary` API — simplified to return only `{ writeDownCount: number }`
- All flashcard content fields on practice items: `flashcard_front`, `flashcard_back`, `flashcard_note`

## What Goes

### Pages & Components
- `app/flashcards/page.tsx` — delete
- `components/LeitnerDashboard.tsx` — delete
- `components/NavDrawer.tsx` — remove flashcards entry from `TABS` array

### API Routes
- `app/api/practice-items/leitner-review/route.ts` — delete
- `app/api/practice-items/route.ts` — remove `getDueFlashcards` function and `flashcards=due` query param branch; remove `leitner_box` and `leitner_due_date` from `PRACTICE_ITEMS_COLUMNS`
- `app/api/practice-items/[id]/route.ts` — remove the `written_down = true → leitner_box = 1, leitner_due_date = today` side-effect; remove `formatDateISO` import from `lib/leitner`

### Lib
- `lib/leitner.ts` — delete (leitnerPass, leitnerFail, formatDateISO)
- `lib/dashboard-summary.ts` — remove leitner card query; remove `leitnerDue`, `dueBoxes`, `nextDueDate` from `DashboardSummary` interface and return value; keep only `writeDownCount`

### Types (`lib/types.ts`)
- Remove `BoxSummary` interface
- Remove `LeitnerResponse` interface
- Remove `leitner_box` and `leitner_due_date` from `PracticeItem`

### Home Page (`app/page.tsx`)
- Remove `DashboardSummary` local interface fields: `leitnerDue`, `dueBoxes`, `nextDueDate`
- Remove the two leitner widget `<Link>` blocks (cards-due and caught-up states)
- Keep the write-down pill `<Link>` block

### Database
- New migration: `DROP COLUMN leitner_box, DROP COLUMN leitner_due_date` from `practice_items`

### Tests
- `__tests__/lib/leitner.test.ts` — delete
- `__tests__/api/leitner-review.test.ts` — delete
- `__tests__/api/dashboard-summary.test.ts` — rewrite: remove leitner assertions, test only `writeDownCount`
- `__tests__/api/practice-items.test.ts` — remove any leitner-related assertions

## Data Flow After Change

```
written_down = true  →  PATCH /api/practice-items/:id
                         update: { written_down: true }
                         (no leitner side-effect)

Home page loads  →  GET /api/dashboard-summary
                     response: { writeDownCount: number }
                     renders write-down pill only
```

## Out of Scope

- No changes to flashcard content generation in `lib/claude.ts` — `flashcard_front/back/note` fields remain; the app just doesn't track which physical pile a card is in.
- No changes to the practice items list page or any other screens.
