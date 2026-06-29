# 08 — Vocabulary page: due-count widget

Status: done
PRD: `.scratch/review-study-improvements/PRD.md`
Depends on: `04-study-route` (for the link target to exist)

## What this issue covers

Add a compact banner to the Vocabulary page showing how many Vocabulary Items are due for SRS review, with a link to start an SRS study session.

## Acceptance criteria

- A compact banner appears above the Vocabulary list (and below the filter bar if present) when `dueCount > 0`
- Banner reads e.g. **"3 phrases due"** with a **"Study now"** button linking to `/study`
- The banner is hidden entirely when `dueCount = 0`
- `dueCount` is loaded server-side (already computed in the Vocabulary page loader — verify the existing `dueCount` prop reaches the client component)
- The banner is a standalone reusable component — it should be extractable to the home page in a future iteration without modification
- The banner is compact: it should not dominate the page or push the list far down

## Testing

- Component test: renders with count and link when `dueCount > 0`; renders nothing when `dueCount = 0`
- Assert the "Study now" link href is `/study`
