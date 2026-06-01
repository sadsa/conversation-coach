# ADR 0003 — Studied items remain inline (dimmed, bottom-anchored) instead of a separate archive view

**Status:** Accepted  
**Date:** 2026-06-02

## Context

The Study page (`/write`) previously split items into two views: an active queue (`!written_down`) and a separate "Studied" archive (`written_down`), reached via a footer pill at the bottom of the active list. Marking an item studied moved it out of the active list immediately; recovering an accidentally-studied item required scrolling to the bottom, tapping the archive pill, finding the item, and tapping again to un-study — four steps across two navigation states.

## Decision

Studied items stay in the same list, pushed to the bottom below a minimal `"Studied · N"` divider, rendered at reduced opacity. Trailing tap is symmetric: it marks active items as studied and un-studies studied items in one tap. The separate archive view (`view === 'written'` state), `ArchiveFooterLink`, and `WrittenViewHeader` are removed.

When the active queue is empty, the existing empty state renders above the divider so the user gets positive feedback before scrolling into the studied section.

## Alternatives considered

**Separate archive view (status quo)** — clean queue, but recovery friction is high: four steps to undo an accidental mark. Penalises a common mistake.

**Interspersed dimming** — studied items stay in their original position, dimmed in place. Keeps relative order but forces the eye to skip noise on every scroll; bottom-anchoring keeps the active queue scannable.

**Dedicated undo toast only** — show a toast after marking studied with an undo action, but no persistent recovery path. Fails when the user doesn't notice the toast or needs to recover later.

## Consequences

- Recovery from an accidental study mark drops from four steps (two navigation states) to one tap.
- The `view` state machine in `WriteList` is removed, simplifying the component.
- The active queue remains clean for typical use; studied items are out of the way but reachable by scrolling.
- Long-term: if the studied section grows very large, a "clear all studied" action may be needed — not addressed here.
