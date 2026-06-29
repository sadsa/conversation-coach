# ADR 0017 — `/study` route with dual item-loading modes

**Status:** Accepted  
**Date:** 2026-06-29

## Context

Study sessions (`LessonClient`) were originally launched in-place on the session review page, fed a hand-picked array of annotations the user had just saved. Two new entry points require study to be reachable from elsewhere:

1. **Review inbox** — a session badge shows "Ready to study"; tapping "Study" should go directly into a study session scoped to that session's saved phrases, bypassing the session detail page.
2. **Vocabulary page widget** — a due-count banner lets the user work through their full SRS queue without navigating to any specific session.

These two contexts have meaningfully different item-selection semantics and SRS behaviour, but share the same `LessonClient` UI. Embedding `LessonClient` inline on both the review inbox and the vocabulary page would duplicate mounting logic and complicate both layouts. A shared route is the cleaner host.

## Decision

Introduce a `/study` route that mounts `LessonClient`. The route distinguishes two modes via query parameter:

### Session-scoped mode — `/study?session_id=<id>`

Triggered from the review inbox session badge. Loads **all** `practice_items` for the given session regardless of `due` date — SRS scheduling is bypassed. After the session ends, the user is shown a "Want to study more?" prompt that navigates to `/vocabulary` (where globally due items may remain).

FSRS write-back still occurs: each card studied updates `due`, `stability`, `reps`, and `last_review` as normal. Bypassing SRS means the items are included even if not yet due; it does not mean their study is unrecorded.

### SRS mode — `/study` (no session_id)

Triggered from the vocabulary page due-count widget. Loads all `practice_items` where `due <= now` across all sessions. Full SRS queue, normal scheduling. No "Want to study more?" prompt on completion — the user has already addressed all due items.

### Why bypass SRS for session-scoped study?

A user who has just reviewed a session's annotations and saved three phrases should be able to drill all three immediately, even if none are technically "due" yet (e.g. first-time saves). Forcing SRS gating at this point creates friction against a natural learning loop: review → drill → move on.

## Consequences

- `LessonClient` receives `phrases: LessonPhrase[]` in both modes; item-loading happens in the route's server component or a loader, not inside `LessonClient` itself.
- The existing in-place mount on the session review page remains for now; it is a third entry point feeding `LessonClient` directly and is not affected by this ADR.
- Future entry points (e.g. per-row "Study this phrase" in the vocabulary list) can use `/study?item_ids=a,b,c` as a natural extension of the same pattern.
- The "Want to study more?" prompt is conditional on `searchParams.session_id` being present — a simple guard in the post-session screen.

## Alternatives considered

**Inline mount on both pages:** Avoids a new route but duplicates mounting logic and couples two unrelated page layouts to `LessonClient`'s full-screen behaviour. Rejected.

**Single mode (always SRS):** Simpler, but blocks immediate drilling of newly saved phrases. The "just reviewed this session" learning loop is a primary use case. Rejected.

**Always include all items (no SRS anywhere):** Loses the scheduling benefit that makes spaced repetition effective for long-term retention. Rejected for the vocabulary widget entry point.
