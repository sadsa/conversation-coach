# ADR 0016 — `is_unhelpful` as the user-facing dismiss action in session review

**Status:** Accepted  
**Date:** 2026-06-29

## Context

`annotations.is_unhelpful` (+ `unhelpful_at`) was added in migration `20260419` and wired to a `PATCH /api/annotations/:id` toggle. The original intent, documented in `CLAUDE.md`, was narrow: *"Use only for unhelpful signal — not for UX state."* The field was conceived as a feedback signal to the AI pipeline — marking annotations the model got wrong — not as a way to drive review-flow state.

In practice, when a user sits with a session's annotations and decides some aren't worth saving, they need a way to say "I've seen this, skip it." Without an explicit dismiss action, the app cannot distinguish between an annotation the user hasn't reached yet and one they've consciously decided to pass on. This distinction is load-bearing: it is the only way to determine whether a session is **partially reviewed** (annotations still unseen) versus **reviewed with nothing kept** (all seen, all passed on).

Adding a separate `dismissed` / `dismissed_at` column would introduce a near-duplicate of `is_unhelpful` for the exact same gesture.

## Decision

Treat `is_unhelpful` as the user-facing **dismiss** action throughout the session review flow. A toggled (true) annotation means "I've seen this and I'm not keeping it." The field remains reversible — the existing toggle behaviour is unchanged.

The three session review states now derive from annotation data alone:

| State | Condition |
|---|---|
| **Partial** | At least one annotation where `is_unhelpful = false` and no corresponding `practice_item` |
| **Nothing kept** | All annotations `is_unhelpful = true`, no `practice_items` saved |
| **Ready to study** | All annotations acted on (saved or dismissed), at least one `practice_item` saved |

`CLAUDE.md` is updated to reflect this: `is_unhelpful` is both an AI-quality signal and the user-facing dismiss mechanism; the two uses are compatible because the gesture is the same — the user is saying the annotation has no value to them.

## Consequences

- No schema change required; the existing field and API route are sufficient.
- UI copy for the toggle should read "Dismiss" (or similar) in the session review context, not "Unhelpful" — the label change is surface-only.
- The "nothing kept" state surfaces a delete prompt in the session detail: the user is asked whether to remove the session entirely.
- Future AI-quality analysis that reads `is_unhelpful` will include user dismissals as well as genuine model errors. This is acceptable — both represent "this annotation added no value."

## Alternatives considered

**Separate `dismissed` column:** Clean separation of concerns, but doubles the schema for an identical gesture. Rejected — the field meanings are close enough that a single field with updated documentation is preferable.

**Infer review state from `last_viewed_at`:** A timestamp tells you the session was opened, not which annotations were considered. Too coarse to distinguish partial from complete review. Rejected.
