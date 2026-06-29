# Conversation Coach

A Spanish language learning app built around a three-step loop: record a spoken conversation, review AI-generated corrections, then study the phrases you flagged.

## Language

### The Learning Loop

**Practise**:
A live voice session where the user speaks Spanish. Produces a Session.
_Avoid_: Practice (US spelling used in code paths, but "Practise" is the user-facing term)

**Review**:
The act of reading through a Session's Annotations and deciding which ones to save. Not a route or a screen — a phase of the loop.
_Avoid_: Transcript view, analysis

**Study**:
The third phase of the learning loop — both the methodology step and the act. The act of Study is a voice session with the Coach covering Vocabulary Items. Same UI controls as a Conversation; the Coach corrects repeated mistakes; the user may exit at any time with no mastery gate. Backed by `practice_items` in the DB.

Two launch modes:
- **Session-scoped Study**: covers all Vocabulary Items from a specific Session regardless of SRS due date. Launched from the Session page CTA or the Review inbox badge. After completion, prompts "Want to study more?" to surface globally due items.
- **SRS Study**: covers all Vocabulary Items due for review across all Sessions (`due ≤ now`). Launched from the due-count widget on Vocabulary. No post-session prompt.

Card advancement during Study is always learner-initiated and reversible: the user moves forward or back between cards at will (always-visible controls), and may also swipe. The Coach never advances the card automatically and never mentions the controls; it stays synced to whichever card is on screen, including after the user moves back. Each card is a self-contained mini-lesson on a single phrase, with no time limit, taught in three internal phases: explain (state the correction in one sentence, then invite a first attempt), model (a couple of varied examples of the phrase in use), and drill (prompts that use the phrase in fresh situations). The Coach leads actively and never goes silent waiting — after each drill attempt it reacts briefly and offers another drill, so there is no dead air; the learner moves on whenever they choose. Turns are short and natural (one idea, roughly one to two sentences) rather than rigidly capped at one sentence. The Coach only ever sees the current card's phrase — it never looks ahead — and never voices the card's explanation, which is already on screen. There is no open-ended free conversation phase; unscripted chat belongs to Talk freely.
_Avoid_: Drill (absorbed into Study), Write, practice list

**Loop**:
The three-step cycle: Practise → Review → Study → (Practise again). A user completes a loop each time they practise a phrase from their Study queue.

### Sessions and Corrections

**Session**:
A single captured interaction — either a Recording or a voice session (Practise or Drill). Has a processing pipeline (uploading → transcribing → identifying → analysing → ready). Belongs to one user.

**Recording**:
A Session created by uploading an audio file (voice note, WhatsApp clip, etc.). DB value: `session_type = 'upload'`.
_Avoid_: Upload (the action, not the artifact), Conversation (too specific — may be a monologue)

**Annotation**:
A single correction or observation on a segment of the user's speech, produced by Claude. Has an original phrase and optionally a corrected form. The internal `type` field (`grammar` | `naturalness`) is a pipeline detail — do not surface it in the UI; users do not need to distinguish the two.
_Avoid_: Correction (overloaded — also used for the corrected text itself)

**Dismiss** (annotation action):
The act of marking an Annotation as not worth keeping during Review. The user has consciously read it and decided to pass. Reversible. In the Review flow this is the counterpart to saving — together they determine the Session Review State. DB column: `is_unhelpful` (stable, not renamed). The UI label is "Ignore"; the mental model is "dismiss."
_Avoid_: Unhelpful, not useful, hidden

**Correction**:
The improved form of a phrase within an Annotation. May be null for naturalness observations where no single fix exists.

**Vocabulary Item**:
A user-selected Annotation saved from a Review. The user-facing label is "vocabulary item." DB table: `practice_items` (stable, not renamed). Created by explicit user action — never auto-generated.
_Avoid_: Flashcard, saved item, write item, practice item (DB/internal term only)

**Studied** (state):
A Vocabulary Item that has been covered in at least one Study session. Set automatically when the phrase appears during a Study voice session — not by manual user action. Drives the bold/normal weight distinction in Vocabulary (unstudied = bold, studied = normal). Also the trigger that initialises SRS scheduling for the item. DB column: `reviewed` on `practice_items`.
_Avoid_: Written, written down (column dropped), manually marked

**Conversation**:
A Session created by having an open-ended voice exchange with the Coach (Scenario or Talk freely mode). Always bidirectional. DB value: `session_type = 'voice_practice'`. Part of the Practise phase.
_Avoid_: Practise session (redundant with the loop phase name), voice practice

**Real Life Scenario** (mode):
A Conversation mode where the Coach plays a named persona and the user answers an incoming call. The persona is revealed after the user speaks first. Previously called "Call mode" in code (`mode: 'call'`), then "Scenario". Marked Beta in the UI.
_Avoid_: Scenario, Call, role play

**Talk freely** (mode):
A Conversation mode with no script or persona — the Coach opens and the user talks about whatever they want. Previously called "Chat mode" in code (`mode: 'chat'`), then "Free flow".
_Avoid_: Free flow, Chat


**Vocabulary**:
The cross-session repository of all saved Vocabulary Items, grouped by Session. A secondary nav surface for reviewing what has been saved over time — not a task list. Route: `/vocabulary`.
_Avoid_: Study queue, practice list, write

**Wild Capture**:
A Vocabulary Item added manually by the user — not derived from a Session Annotation. Captures a phrase heard outside the app (podcast, real conversation, etc.). The user provides the phrase and the context it was used in; the Coach enriches it into flashcard form in the background. Appears in Vocabulary under a dedicated "From real life" group.
_Avoid_: Manual entry, custom phrase

**Session Review State**:
The derived state of a Session based on what the user has done with its Annotations. Three values:
- **Partial** — at least one Annotation has not been acted on (neither saved nor dismissed).
- **Nothing kept** — all Annotations have been dismissed; no Vocabulary Items saved. Triggers a prompt to delete the Session.
- **Ready to study** — all Annotations acted on; at least one saved as a Vocabulary Item.

Derived from annotation data — not an explicit flag. Replaces the binary `reviewed_at` model as the primary signal in the Review inbox.
_Avoid_: Reviewed, completed, marked as done

**Review Completion**:
The explicit act of marking a Session as fully reviewed. Triggered by the "Finish review" CTA on the Session page. Sets `sessions.reviewed_at`. Superseded in practice by Session Review State as the richer signal — `reviewed_at` is retained for backwards compatibility.
_Avoid_: Mark as read, dismiss

**SRS Schedule**:
The spaced-repetition schedule attached to a Vocabulary Item once it has been Studied. Powered by FSRS (`due`, `stability`, `reps`, and related columns on `practice_items`). The `due` date determines when a phrase surfaces as "due for review" in Vocabulary. Phase 1: passive — Vocabulary shows a "due today" badge. Phase 2 (future): an active review queue.
_Avoid_: Anki-style review, flashcard deck

**Coach**:
The AI counterpart in Conversations and Drills. In chat mode it presents as "Coach"; in call mode it adopts a named persona, but the underlying entity is the same. Named in the app title ("Conversation Coach").
_Avoid_: AI, bot, agent, assistant

### The Handoff

**Review→Study Handoff**:
The transition from finishing Review to beginning Study. Bridged by the Study CTA (see below) appearing after each save.

**Study CTA**:
A persistent control on the Session page that appears whenever the user has saved at least one Vocabulary Item (including items from prior visits). Launches the Study voice session for this Session directly — does not navigate away. See `components/StudyPrompt.tsx` (internal name kept for stability).

**Annotation Review Model (mobile vs desktop)**:
On mobile, saving a Practice Item closes the `AnnotationSheet` entirely. The user returns to the transcript and taps the next annotation deliberately. On desktop, the right panel stays open with prev/next navigation so the user can step through corrections while the transcript remains visible on the left. See `docs/adr/0001-annotation-sheet-mobile-interaction-model.md`.

### Installation

**Install Nudge**:
The two-surface prompt that teaches new mobile users to add the app to their home screen. Surface 1: a skippable onboarding step shown after the language pick (first login only); Surface 2: a dismissible banner on `/` for users who skipped. Both surfaces disappear permanently once the app is running in standalone mode (already installed). Desktop users never see either surface.
_Avoid_: Install prompt, install banner (too narrow — describes only one surface)

## Example dialogue

> **Dev:** A user saves three phrases, then leaves the session page without going to Study. Next time they open that session, does the Study Prompt show?
>
> **Domain expert:** Yes — the Prompt fires whenever saved Practice Items exist for that session, regardless of when they were saved. The user might be back precisely because they want to study them.
>
> **Dev:** What if they've already studied all three? Does the Prompt disappear?
>
> **Domain expert:** Not automatically. "End of Review" isn't a concept we track — the session page has no completion state. The Prompt shows as long as there are saved items; it's the user's job to navigate away.
