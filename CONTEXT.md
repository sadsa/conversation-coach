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
The third phase of the learning loop — both the methodology step and the act. The act of Study is a voice session with the Coach covering all Vocabulary Items saved from a specific Session. Same UI controls as a Conversation; the Coach corrects repeated mistakes; the user may exit at any time with no mastery gate. Launched via a persistent CTA on the Session page. Backed by `practice_items` in the DB.

Card advancement during Study is always learner-initiated: the Coach teaches one card, then cues the user to tap "Got it" when ready — the Coach does not advance the card automatically. The Coach speaks one sentence per turn throughout; it never chains questions or statements in a single turn.
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

**Not useful** (flag):
A user signal that an Annotation is irrelevant to them — hides it from the transcript. Mutually exclusive with saving the Annotation as a Practice Item. DB column: `is_unhelpful` (stable, not renamed).
_Avoid_: Unhelpful, dismissed, hidden

**Correction**:
The improved form of a phrase within an Annotation. May be null for naturalness observations where no single fix exists.

**Vocabulary Item**:
A user-selected Annotation saved from a Review. The user-facing label is "vocabulary item." DB table: `practice_items` (stable, not renamed). Created by explicit user action — never auto-generated.
_Avoid_: Flashcard, saved item, write item, practice item (DB/internal term only)

**Studied** (state):
A Vocabulary Item that the user has manually marked as done. DB column: `written_down` (stable, not renamed). Not surfaced in the UI for now — mastery is not tracked automatically.
_Avoid_: Written, written down (too prescriptive — implies physical writing)

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

**Coach**:
The AI counterpart in Conversations and Drills. In chat mode it presents as "Coach"; in call mode it adopts a named persona, but the underlying entity is the same. Named in the app title ("Conversation Coach").
_Avoid_: AI, bot, agent, assistant

### The Handoff

**Review→Study Handoff**:
The transition from finishing Review to beginning Study. Bridged by the Study CTA (see below) appearing after each save.

**Study CTA**:
A persistent button on the Session page that appears whenever the user has saved at least one Vocabulary Item (including items from prior visits). Launches the Study voice session for this Session directly — does not navigate away. On mobile, appears in the transcript after the sheet dismisses. On desktop renders below the right panel. See `components/StudyPrompt.tsx` (internal name kept for stability).

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
