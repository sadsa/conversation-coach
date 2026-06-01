# ADR 0002 — Practise home shows live sessions only; upload entry point moves to Review

**Status:** Accepted  
**Date:** 2026-06-01

## Context

The Practise home (`/`) previously offered three doors: Real Life Scenario (live call), Free flow (live chat), and Share a voice note (a tutorial link to `/onboarding?step=2` that teaches the user to share a WhatsApp/Signal recording via the Web Share Target).

The "Share a voice note" door is conceptually different from the other two: it does not start a live practice session. It teaches a workflow for submitting a pre-recorded conversation for review. The user who arrives at that door has already spoken — they are not practising, they are feeding a recording into the Review pipeline.

Having it on the Practise home created a category error: a new user reading the three doors would reasonably expect all three to involve speaking now. It also diluted the signal of the Practise step in the methodology rail (Practise → Review → Study).

## Decision

Remove the "Share a voice note" door from the Practise home. Upload entry points (share target pickup and any explicit upload flow) live in the Review step, which already owns the inbox of sessions awaiting analysis.

The Practise home becomes strictly "start a live voice session now":
- **Free flow** — primary door (prominent, full-width treatment, conversation starter chips)
- **Real Life Scenario** — secondary door below it

The service worker share-target redirect still lands on `/` (unchanged), but `PractiseClient` continues to handle the IndexedDB pickup and push straight to the status screen — no door tap required for share-target files. The door itself is simply no longer visible.

## Alternatives considered

**Keep the door but label it differently** — e.g. "I have a recording." This still puts a non-practice action on the Practise screen. Rejected: the label change doesn't fix the category error.

**Move upload to Settings** — Settings is for configuration, not content entry. Rejected on the same conceptual grounds.

## Consequences

- A user who arrives intending to upload a recording must navigate to Review. First-visit friction increases slightly for that path; this is acceptable because recording upload is not a first-session behaviour.
- The share-target file pickup (WhatsApp/Signal → home → auto-upload) is unaffected — it bypasses the door entirely.
- The onboarding tutorial at `/onboarding?step=2` remains reachable; a link to it should be added within the Review screen or a relevant onboarding moment.
