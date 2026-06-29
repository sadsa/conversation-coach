# 02 — Session item: state badge and counts

Status: done
PRD: `.scratch/review-study-improvements/PRD.md`
Depends on: `01-session-review-state-loader`

## What this issue covers

Update the session item card in the Review inbox to show:
- A status badge reflecting the Session Review State
- Two counts: **X saved · Y due**
- A contextual action button on the badge

## Acceptance criteria

**Counts**
- Each session item shows `X saved · Y due` using the `saved_count` and `due_count` values from the loader (issue 01)
- Counts are hidden for sessions that have no `review_state` (still processing)

**Status badge**
- **Partial** → badge reads "In progress"; action button reads "Review" → navigates to session detail page
- **Ready to study** → badge reads "Ready to study"; action button reads "Study" → navigates to `/study?session_id=<id>` (the route created in issue 04; use a plain link for now — the route does not need to exist yet for this issue to ship)
- **Nothing kept** → badge reads "Nothing kept"; no action button; instead shows an inline delete prompt ("Remove this session?") with confirm/cancel
- Sessions with no `review_state` show no badge

**Delete prompt**
- Confirming delete removes the session (same optimistic delete + undo behaviour as the existing swipe-to-delete)
- Cancelling dismisses the prompt and leaves the session in place

## Testing

- Component test for the session item: assert each badge state renders the correct label and button
- Assert that the delete prompt appears only for `nothing_kept` state
- Assert confirm/cancel behaviour (optimistic removal / prompt dismissal)
- Prior art: existing `DashboardRecentSessions` / session item component tests
