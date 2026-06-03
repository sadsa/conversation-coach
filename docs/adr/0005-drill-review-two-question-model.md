# Drill review uses two independent yes/no questions, not Save/Discard

The Conversation review screen uses a Save/Discard prompt because the session recording is the primary artifact. In a Drill the primary artifact is the learning event — the user practising a specific phrase until they feel comfortable. The recording is incidental.

So the Drill review screen asks two independent questions instead of one bundled decision:

1. **"Did you get comfortable with this phrase?"** (default: No) — marks the Practice Item as Studied if Yes.
2. **"Save this Drill session?"** (default: Yes) — submits the recording for analysis and navigates to `/sessions/[id]` if Yes.

A single "Done" CTA fires both actions based on the current selections. Both No is equivalent to Discard — nothing saved, item stays in the Study queue, user returns to `/write`. The review screen is skipped entirely if no speech was captured (unchanged from today).
