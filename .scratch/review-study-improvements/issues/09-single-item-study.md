# 09 — Vocabulary row: single-item study action

Status: done
PRD: `.scratch/review-study-improvements/PRD.md`
Depends on: `04-study-route`

## What this issue covers

Add a "Study" action to the per-row context menu (`RowActionsMenu`) on each Vocabulary Item in the Vocabulary list.

## Acceptance criteria

- Each Vocabulary Item row's `RowActionsMenu` includes a "Study" action
- Tapping "Study" navigates to `/study?item_ids=<id>`
- The action appears for all Vocabulary Items regardless of their `due` date or `reviewed` state
- The action is positioned logically within the menu alongside the existing actions (mark studied, move back, delete)

## Testing

- Component test: assert "Study" action appears in the row menu
- Assert the link href is `/study?item_ids=<id>` with the correct item ID
- Prior art: existing `RowActionsMenu` tests
