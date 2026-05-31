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
A single recorded conversation. Has a processing pipeline (uploading → transcribing → identifying → analysing → ready). Belongs to one user.

**Annotation**:
A single correction or observation on a segment of the user's speech, produced by Claude. Has a type (grammar, naturalness), an original phrase, and optionally a corrected form.
_Avoid_: Correction (overloaded — also used for the corrected text itself)

**Correction**:
The improved form of a phrase within an Annotation. May be null for naturalness observations where no single fix exists.

**Practice Item**:
A user-selected Annotation saved to their Study queue. Created by explicit user action — never auto-generated.
_Avoid_: Flashcard, saved item, write item

### The Handoff Problem

**Review→Study Handoff**:
The transition from finishing Review to beginning Study. Currently the weakest seam in the Loop — no forward CTA exists after saving a Practice Item. Resolved by a persistent floating CTA (see below).

**Study Prompt**:
A fixed/floating CTA that appears on the Session page whenever the user has at least one saved Practice Item (including items saved on prior visits). Shows a count ("Study N saved phrases →") and navigates to `/write` on tap. Disappears when the user navigates away.

## Example dialogue

> **Dev:** A user saves three phrases, then leaves the session page without going to Study. Next time they open that session, does the Study Prompt show?
>
> **Domain expert:** Yes — the Prompt fires whenever saved Practice Items exist for that session, regardless of when they were saved. The user might be back precisely because they want to study them.
>
> **Dev:** What if they've already studied all three? Does the Prompt disappear?
>
> **Domain expert:** Not automatically. "End of Review" isn't a concept we track — the session page has no completion state. The Prompt shows as long as there are saved items; it's the user's job to navigate away.
