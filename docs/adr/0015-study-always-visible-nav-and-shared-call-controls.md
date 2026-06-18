# ADR 0015 — Study controls: always-visible Back/Next + shared call-control row

**Status:** Accepted  
**Date:** 2026-06-18  
**Supersedes:** [0014](./0014-study-client-card-focused-ui.md)

## Context

ADR 0014 gave the Study session (`LessonClient`) a deliberately bare card-focused UI: card advancement was driven **only** by horizontal swipe (right = advance, left = re-drill the previous card), and the session controls (mute, end call) were hidden by default, revealed by tapping anywhere outside the card.

In testing this failed exactly where swipe-only models tend to: the swipe direction was non-obvious, a wrong-direction swipe did nothing visible, and the learner lost time figuring out why the card wouldn't advance. There was no always-visible affordance to fall back on. This is the same failure mode ADR 0001 had already avoided for the annotation sheet by choosing deliberate tapping over swipe.

Three sources had also drifted out of sync:

- **`CONTEXT.md`** described an *"always-visible 'Got it' button"* (singular) for advancement.
- **ADR 0014** specified swipe only, with a persistent controls footer explicitly rejected.
- **The code** followed 0014 — swipe + hidden chrome — and shipped the unused i18n keys `lesson.gotIt` / `lesson.gotItAria`.

## Decision

Make every Study control **persistent and visible at thumb's reach**, while keeping swipe as a secondary shortcut.

### Always-visible Back / Next under the card
Two pills sit directly beneath the focus card. Navigation is **bidirectional** — Back exists primarily to recover from an accidental Next, not to re-drill. Back is disabled (dimmed, no reflow) on the first card. Next is slightly emphasized over Back to signal the main flow.

### Swipe coexists with the buttons
The `drag="x"` gesture and its directional overlays remain for users who prefer it. Button taps reuse the swipe-out animation — the `onDragEnd` success branch is extracted into a shared `animateThenAdvance(dir)` helper so a tap animates the card off-screen exactly like a drag release.

### Back re-syncs the Coach
Going back re-sends `formatStudyCardAdvance` for the previous card, identical to advancing. This upholds the `CONTEXT.md` invariant that the Coach is always synced to the card on screen. A silent back (swap the visible card without signalling) was rejected — it desyncs the Coach's voice from the screen, a worse bug than the swipe ambiguity this ADR fixes.

### Shared call-control row with PracticeClient
The hidden controls layer is removed. In its place, Study adopts the same bottom control row as `PracticeClient`: **Mute · live waveform · End**, each a glyph-over-label column. The standalone `AudioReactiveDots` row is consolidated into this row's centre column. End call living in this bottom row keeps it physically separated from Next (up under the card), so an accidental, unrecoverable end-call tap is structurally unlikely — separation by component rather than by styling.

### Onboarding hint removed
The one-shot `lesson.hint` ("Swipe between cards · tap to show controls") existed solely to teach an invisible gesture. With visible buttons and visible controls, the affordance is self-evident. The hint and its machinery (`HINT_KEY`, `hintVisible`, the first-listening trigger) are removed.

## Consequences

- `LessonClient` loses `controlsVisible`, `showControlsBriefly`, the controls hide-timer, the `controls-layer` overlay, and the hint machinery — a net simplification.
- Study and Practise now share one call-control layout; future control changes should be made in both (or extracted to a shared component).
- The card content is unchanged — correction only, no native-language translation or tags. A separate proposal (translation / grammar tags / "IN FOCUS" eyebrow) would reopen 0014's immersion stance and needs its own ADR.
- **Vertical fit risk:** card (`min-h-[200px]`) + progress pips + pill row + full call-control row may crowd small phones within the fixed top/bottom inset. Verify before shipping.

## Alternatives considered

**Buttons replace swipe entirely (one model):** More consistent with ADR 0001's single-affordance philosophy, but discards a gesture that already works and is tested. Rejected in favour of coexistence — the bug was the *absence* of a visible affordance, not the presence of swipe.

**Single forward-only "Ready to move on" button:** Rejected — an accidental advance needs a way back, which requires a second affordance.

**Keep mute/end hidden behind tap-to-reveal:** Rejected — the hidden-chrome model was itself disliked in testing and contributed to the "where did my controls go" confusion.
