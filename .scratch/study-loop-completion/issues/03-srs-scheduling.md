Status: done

## What to build

Wire up SRS scheduling so that studying a phrase sets its next review date, and surface overdue phrases visually on the Vocabulary page.

**FSRS initialisation:** When `PATCH /api/practice-items/:id` is called with `{ reviewed: true }` for the first time (i.e. `reviewed` was previously `false`), the API handler initialises the FSRS fields using `ts-fsrs` with a "Good" rating on the first repetition. This writes `due`, `stability`, `difficulty`, `reps`, `lapses`, `last_review`, and `fsrs_state` back to the row. Subsequent calls where `reviewed` is already `true` advance the FSRS state normally (another "Good" repetition).

**Due today indicator:** `loadPracticeItems()` returns a `dueCount` field alongside the items — a count of rows where `due <= now()` and `reviewed = true`. The Vocabulary page renders a summary chip above the session groups (e.g. "3 due for review"). The chip is read-only in this release — tapping it does nothing. An active review queue is out of scope.

All FSRS columns (`due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `last_review`, `fsrs_state`) already exist on `practice_items` from migration `20260410000000`. The `ts-fsrs` package is already installed. No migration is needed.

## Acceptance criteria

- [x] First study of a phrase writes FSRS fields including a `due` date to the row
- [x] `due` date reflects a "Good" rating on first repetition (per `ts-fsrs` defaults)
- [x] Subsequent study of the same phrase advances the FSRS state (due date pushed further out)
- [x] `loadPracticeItems()` returns a `dueCount` of items where `due <= now()`
- [x] Vocabulary page displays a chip showing the number of due items
- [x] Chip is visible only when `dueCount > 0`
- [x] Chip is non-interactive (no navigation or action on tap)

## Blocked by

- `02-studied-state.md` — FSRS initialisation is triggered by the `reviewed: true` write-back that issue 2 introduces.
