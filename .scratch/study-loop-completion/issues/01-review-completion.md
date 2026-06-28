Status: done

## What to build

Make Sessions explicitly completable. The Review inbox should show everything the user hasn't finished reviewing — not just unopened sessions. The Session page should give the user a clear way to close off a session once they're done.

Two connected changes:

**Review inbox filter:** Shift the inbox query from `last_viewed_at IS NULL` to `reviewed_at IS NULL AND status != 'error'`. Sessions the user opened but didn't explicitly finish now stay visible in the inbox. The partial index `sessions_unreviewed_idx` already covers this filter.

**Context-aware StudyPrompt CTA:** The StudyPrompt bar gains a "Finish review" secondary button alongside the existing primary CTA. The primary CTA becomes context-driven:
- No saved Vocabulary Items → primary = "Save a phrase" (scrolls to first annotation), secondary = "Finish review"
- Has saved Vocabulary Items → primary = "Study", secondary = "Finish review"

Tapping "Finish review" calls `PATCH /api/sessions/:id` with `{ reviewed: true }` (endpoint already exists and sets `reviewed_at`), then navigates to `/review`.

## Acceptance criteria

- [x] Review inbox shows all sessions where `reviewed_at IS NULL`, including sessions the user has previously opened
- [x] Sessions with `reviewed_at` set no longer appear in the inbox
- [x] StudyPrompt bar shows "Finish review" as a secondary action on all ready sessions
- [x] When no Vocabulary Items are saved, primary CTA reads "Save a phrase"
- [x] When Vocabulary Items exist, primary CTA reads "Study"
- [x] Tapping "Finish review" sets `reviewed_at` on the session
- [x] After "Finish review", user lands on `/review`

## Blocked by

None — can start immediately.
