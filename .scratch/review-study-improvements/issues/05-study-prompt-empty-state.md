# 05 — StudyPrompt: remove "Save a phrase" and update empty state

Status: done
PRD: `.scratch/review-study-improvements/PRD.md`

## What this issue covers

Remove the "Save a phrase" button from `StudyPrompt` and replace the zero-saved-items state with copy that reflects the session's review progress.

## Background

`StudyPrompt` is the persistent toast-style bar at the bottom of the session review page. It currently shows:
- When `count > 0`: "Study" button + "Finish review" button
- When `count = 0`: "Save a phrase" button + "Finish review" button

The "Save a phrase" button is being removed. The zero-saved state should instead communicate review progress to the user.

## Acceptance criteria

- The "Save a phrase" button is removed from `StudyPrompt` in all states
- When `count = 0` and the session has unseen annotations (partial state): show copy along the lines of "Keep going — save anything worth practising"
- When `count = 0` and all annotations are dismissed (nothing kept): show copy along the lines of "Nothing saved — you can remove this session"
- The "Finish review" / "Study" buttons are otherwise unchanged
- `StudyPrompt` accepts the session's `review_state` as a prop to drive the copy variation (or a derived boolean — whichever is the cleaner interface given what the parent already has)

## Testing

- Modify existing tests in `__tests__/components/StudyPrompt.test.tsx`
- Assert "Save a phrase" is absent in all rendered states
- Assert the correct empty-state copy appears for `partial` vs `nothing_kept` review state
- Prior art: `__tests__/components/StudyPrompt.test.tsx`
