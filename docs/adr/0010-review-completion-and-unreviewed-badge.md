# ADR 0010 — Review completion gesture, post-review screen, and unreviewed badge

**Status:** Accepted  
**Date:** 2026-06-14

## Context

Users can start a voice practice session, generate a transcript with Claude annotations, and exit the app without ever returning to review it. There was no signal in the UI telling the user how many sessions awaited their attention, and no deliberate "I'm done reviewing this" gesture — opening a transcript auto-stamped `last_viewed_at`, conflating "viewed" with "reviewed".

The goal is to close the Speak → Review → Refine loop: surface pending reviews, give the user a deliberate completion action, and bridge them into Refine (drill) immediately after review while the session is fresh.

## Decisions

### 1. Separate `reviewed_at` column — do not repurpose `last_viewed_at`

A new nullable `reviewed_at` timestamp column is added to `sessions`. It is set only by an explicit user action, never auto-stamped.

`last_viewed_at` is left unchanged — it drives the bold/unread styling on session rows in `/review` and has its own read/unread toggle. Repurposing it would silently break existing sessions and conflate two distinct concepts: "the user opened this" vs "the user deliberately finished reviewing this".

### 2. Badge count = sessions where `reviewed_at IS NULL`

The unreviewed count includes both in-progress sessions (uploading/transcribing/identifying/analysing) and ready sessions never marked reviewed. This reflects the user's intent to move toward intentional review completion — a session in processing will eventually demand attention.

### 3. Badge lives on the Review nav tab — not the header

A numeric badge is added to the Review tab in `BottomNav` and `NavDrawer`. A header bell icon was considered but rejected: it implies a notification centre that doesn't exist, and adds a new navigation destination with no clear target. The Review tab already is the right destination — it just needs the count.

### 4. "Mark as reviewed" replaces the StudyPrompt pill

The floating `StudyPrompt` pill ("Study N corrections → /refine") is removed. In its place, the fixed bottom surface now hosts two mutually exclusive states:

- **Corrections still below fold** → "Next correction" pill (existing scroll behaviour)
- **All corrections in view** → "Mark as reviewed" button

The StudyPrompt was removed because it did two jobs (celebrating progress + prompting navigation) and competed with the next-correction pill. The badge on the Review tab now carries the navigation signal to `/refine`.

### 5. "Mark as reviewed" triggers an in-place completion screen

After tapping "Mark as reviewed", the transcript view swaps out for a completion screen rendered in-place on `/sessions/[id]` — no route change. This follows the pattern of `LessonClient` mounting in-place on `/refine`.

The completion screen has two variants:

- **Phrases saved**: list of practice items saved during this review, each with a "Drill this phrase" CTA that launches `LessonClient` in-place (single-phrase, same pattern as `/refine`). "Back to reviews" navigates to `/review`.
- **Nothing saved**: simple "Review complete" confirmation + "Back to reviews". Does not resurface annotations — the user made a deliberate choice not to save anything.

### 6. Multi-phrase drill deferred

A sequential multi-phrase drill (passing an array to `LessonClient`) is the intended end state for the completion screen. It is deferred until `LessonClient` supports phrase queuing. The single-phrase launch ships first without blocking the Review → Refine bridge.

## Alternatives considered

- **Badge in the header** — rejected; implies a notification centre, adds a redundant nav surface.
- **Repurpose `last_viewed_at`** — rejected; silent breaking change for existing sessions, conflates viewed and reviewed.
- **Navigate to `/refine` after mark-reviewed** — rejected; drops the user into the full Study queue without acknowledging the session they just finished.
- **Show annotations on zero-phrase completion screen** — rejected; second-guesses the user's decision not to save anything.
