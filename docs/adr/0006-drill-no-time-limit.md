# Drill sessions have no time limit — the learner decides when they are done

The original Drill implementation imposed a 10-minute hard cap with a 2-minute warning, mirroring the Conversation session model. The cap was there as a safety rail (Gemini Live has its own session length limits) and to prevent runaway API spend. In practice it punishes slower learners and contradicts the core purpose of a Drill: practise a phrase until you feel comfortable, not until a clock runs out. The discomfort of being mid-phrase when the session ends is worse than the cost of the occasional very long session.

We removed the app-level cap entirely. The learner ends the Drill by pressing the End button when they feel ready. The Gemini connection will still close on its own if the underlying API limit is hit; when that happens the session transitions to the review screen with whatever was captured — identical to the user pressing End themselves. No timer display is shown anywhere in the Drill UI, including review: showing elapsed time creates the same quiet pressure as a countdown.

## Considered Options

- **Keep the 10-minute cap** — predictable cost, known Gemini compatibility. Rejected: contradicts learner-paced mastery; the warning toast creates anxiety at exactly the wrong moment.
- **Raise the cap (e.g. 20–30 min)** — reduces interruptions, still bounded. Rejected: still arbitrary; a learner who needs 35 minutes gets cut off. The boundary is a policy decision that doesn't belong in the UI.
- **No cap, learner ends (chosen)** — respects the learner's pace; Gemini disconnect handled gracefully as a natural session end.
