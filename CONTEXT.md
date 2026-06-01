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
The user's personal queue of saved Corrections they intend to learn. Backed by `practice_items` in the DB. Route: `/write` (kept for stability).
_Avoid_: Write, practice list

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

**Practice Item**:
A user-selected Annotation saved to their Study queue. Created by explicit user action — never auto-generated.
_Avoid_: Flashcard, saved item, write item

**Studied** (state):
A Practice Item that the user has marked as done — moved from the active Study queue to the Studied archive. The act is method-agnostic: the user may physically write the phrase, drill it mentally, or review it another way. DB column: `written_down` (stable, not renamed). The archive view is the "Studied" list.
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


**Drill**:
A structured voice session seeded by a specific Practice Item, launched from the Study queue. The user initiates it to practise a phrase in context — self-directed, not teacher-led. Produces a Session record. Part of the Study phase of the loop.
_Avoid_: Lesson (teacher-led connotation), practice session (conflicts with Practise the loop phase)

**Coach**:
The AI counterpart in Conversations and Drills. In chat mode it presents as "Coach"; in call mode it adopts a named persona, but the underlying entity is the same. Named in the app title ("Conversation Coach").
_Avoid_: AI, bot, agent, assistant

### The Handoff

**Review→Study Handoff**:
The transition from finishing Review to beginning Study. Bridged by the Study Prompt (see below) appearing after each save.

**Study Prompt**:
A persistent floating pill on the Session page that appears whenever the user has saved at least one Practice Item (including items from prior visits). Shows a count ("Study N saved →") and navigates to `/write`. On mobile, the pill appears in the transcript after the sheet dismisses — it never renders simultaneously with the open sheet. On desktop the pill renders below the right panel. See `components/StudyPrompt.tsx`.

**Annotation Review Model (mobile vs desktop)**:
On mobile, saving a Practice Item closes the `AnnotationSheet` entirely. The user returns to the transcript and taps the next annotation deliberately. On desktop, the right panel stays open with prev/next navigation so the user can step through corrections while the transcript remains visible on the left. See `docs/adr/0001-annotation-sheet-mobile-interaction-model.md`.

## Example dialogue

> **Dev:** A user saves three phrases, then leaves the session page without going to Study. Next time they open that session, does the Study Prompt show?
>
> **Domain expert:** Yes — the Prompt fires whenever saved Practice Items exist for that session, regardless of when they were saved. The user might be back precisely because they want to study them.
>
> **Dev:** What if they've already studied all three? Does the Prompt disappear?
>
> **Domain expert:** Not automatically. "End of Review" isn't a concept we track — the session page has no completion state. The Prompt shows as long as there are saved items; it's the user's job to navigate away.
