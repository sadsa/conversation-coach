# 04 — `/study` route with dual loading modes

Status: done
PRD: `.scratch/review-study-improvements/PRD.md`
ADR: `docs/adr/0017-study-route-dual-loading-modes.md`

## What this issue covers

Create a new `/study` route that hosts `LessonClient` and loads Vocabulary Items in one of two modes. This is the foundational issue for all study entry points.

## Acceptance criteria

**Route**
- `/study` renders `LessonClient` with the appropriate set of `LessonPhrase` items
- The route is auth-guarded (same middleware as all other routes)

**Session-scoped mode** (`/study?session_id=<id>`)
- Loads all `practice_items` for the given session belonging to the current user, regardless of `due` date
- After the session ends, shows a "Want to study more?" screen with a button navigating to `/vocabulary`
- If the session has no Vocabulary Items, redirects to the session detail page with a toast or inline message

**SRS mode** (`/study` with no params)
- Loads all `practice_items` where `due <= now` for the current user, across all sessions
- After the session ends, returns the user to `/vocabulary` (or `/review`) with no additional prompt
- If no items are due, redirects to `/vocabulary`

**Single-item mode** (`/study?item_ids=<id1>,<id2>`)
- Loads the specified `practice_items` by ID, scoped to the current user (user_id check required)
- After the session ends, returns the user to `/vocabulary`

**FSRS write-back**
- In all modes, FSRS write-back occurs after each card is studied (due, stability, reps, last_review updated with `Rating.Good`)
- This is the same write-back that already occurs in the session-page Study flow — reuse that logic

**Existing session-page Study**
- The existing in-place `LessonClient` mount on the session detail page is not changed by this issue

## Testing

- Unit test the study item loader: assert session-scoped mode returns all items for that session regardless of `due`; assert SRS mode returns only items where `due <= now`; assert single-item mode returns only the specified IDs and enforces `user_id`
- Component/integration test: navigating to `/study?session_id=<id>` with no items redirects correctly
- Prior art: existing loader tests in `__tests__/lib/`
