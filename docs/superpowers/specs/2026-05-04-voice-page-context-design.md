# Voice Page Context — Design Spec

**Date:** 2026-05-04
**Status:** Approved
**Builds on:** [`2026-05-03-global-voice-control-design.md`](./2026-05-03-global-voice-control-design.md) — that spec set up the global voice surface and listed "Page content awareness" as phase 3 future work. This is that phase 3.

---

## Overview

Today the voice coach knows *which* page the user is on (a one-line route hint) but not *what's on it*. This spec adds page-content awareness for the two pages where it matters most: the Write list (`/write`) and the session transcript (`/sessions/[id]`). On those routes the coach gets the user's actual pending corrections or the relevant transcript excerpts injected into its system prompt at connect time, so the user can talk about "this one" / "the third correction" / "the part about subjunctive" without re-explaining themselves.

Other authenticated routes (home, settings, status, identify, recordings) keep today's generic behaviour.

---

## Goals

- On `/write`, the coach knows every pending (`!written_down`) correction the user is looking at.
- On `/sessions/[id]`, the coach knows the annotated portions of the transcript and the corrections themselves.
- The user can refer to items by deixis ("this one", "the third", "the part about ser/estar") and the coach anchors its answer.
- Pinned-at-connect: the agent's mental model is locked when `start()` fires, so mid-session edits don't whiplash the conversation.
- No new server round-trip on connect — the data is already in client state on the relevant page.

## Non-goals

- **No mid-session refresh.** If the user adds, writes, or deletes items mid-call, the coach doesn't see it until the next session.
- **No coach-driven actions** ("save this", "next correction", "mark as written"). Free-form reference only — same boundary as today.
- **No quiz / drill mode.** That's a future use case (D in the brainstorm); the prompt stays free-form.
- **No flashcard fields, no importance scores in the prompt.** Excluded for v1 to keep the prompt focused; can be added later if needed.
- **No background-tab persistence.** Inherited limit from the global control spec.
- **No fallback to /api fetch.** If the route client hasn't published its context, we fall through to today's generic behaviour rather than re-querying server-side.

---

## Architecture

### Plumbing model

Same window-global pattern as today's `__ccSessionTitle` bridge — extended into a typed payload. The route client (`TranscriptClient`, `WriteClient`) publishes its data on mount and clears on unmount; the controller reads it lazily inside `start()`.

The existing `__ccSessionTitle` global collapses into `__ccVoiceContext.sessionTitle` so we maintain one bridge, not two.

### Files

| File | Change |
|------|--------|
| `lib/voice-context.ts` | **New.** Pure builders `buildSessionContext()` / `buildWriteContext()`; the 8000-char cap; speaker resolution helper. |
| `__tests__/lib/voice-context.test.ts` | **New.** Unit tests for builders, neighbour expansion, dedupe, cap, speaker mapping. |
| `lib/voice-agent.ts` | Drop the `items: FocusedCorrection[]` parameter from `connect()` and `buildSystemPrompt()` (already dead — controller has been passing `[]`). Add new `pageContext?: VoicePageContext` parameter. Render the page-context block in the prompt. |
| `components/VoiceController.tsx` | Read `window.__ccVoiceContext` inside `start()`, pass through to `connect()`. Drop the unused `[]` items arg. |
| `components/TranscriptClient.tsx` | Replace the existing `__ccSessionTitle` `useEffect` with a single one that publishes `__ccVoiceContext` of `kind: 'session'`. |
| `components/WriteClient.tsx` | Add a `useEffect` that publishes `__ccVoiceContext` of `kind: 'write'` (only when `items.length > 0`). |
| `types/window.d.ts` | Replace `__ccSessionTitle` declaration with `__ccVoiceContext`. |

### Removed surface

- `FocusedCorrection` type (was the public shape of items passed to `connect()`).
- The `items` parameter on `connect()` and `buildSystemPrompt()`.
- `window.__ccSessionTitle` global.

These are all internal — no API consumers — so the breakage is confined to the two call sites updated in this PR.

---

## Data shapes

### Window global

```ts
// types/window.d.ts
declare global {
  interface Window {
    __ccVoiceContext?: VoicePageContext
  }
}

// lib/voice-context.ts
export type VoicePageContext =
  | {
      kind: 'session'
      sessionTitle: string
      excerpts: SessionExcerpt[]
      annotations: SessionAnnotation[]
    }
  | {
      kind: 'write'
      items: WriteContextItem[]
    }

export interface SessionExcerpt {
  position: number
  speaker: 'user' | 'other'   // already resolved against session.user_speaker_labels
  text: string
  isAnnotated: boolean        // true iff at least one annotation references this segment
}

export interface SessionAnnotation {
  segmentPosition: number     // links into excerpts[] by SessionExcerpt.position
  type: 'grammar' | 'naturalness'
  original: string
  correction: string | null
  explanation: string
}

export interface WriteContextItem {
  original: string
  correction: string | null
  explanation: string
  segmentText: string | null   // the in-context sentence; null for legacy items without annotation_id
  sessionTitle: string | null  // null only if the source session was deleted
}
```

### Builders

Both builders are pure functions — given the data the route client already has in state, return the typed payload (or `null` if the payload would be empty).

```ts
export function buildSessionContext(
  session: SessionDetail['session'],
  segments: TranscriptSegment[],
  annotations: Annotation[]
): VoicePageContext | null

export function buildWriteContext(
  items: PracticeItem[]
): VoicePageContext | null
```

`buildSessionContext` returns `null` only if `segments.length === 0` (still loading or empty session). When `annotations.length === 0` it returns a `kind: 'session'` payload with empty `excerpts` and `annotations` arrays — the prompt block then collapses to "the user is reviewing X" so the coach can acknowledge the conversation without inventing detail.

`buildWriteContext` returns `null` when `items.length === 0` so the empty Write list falls through to today's generic greeting.

### Excerpt expansion (A3)

For each annotation, take the segment it references plus the immediate neighbour on each side (positions `n-1`, `n`, `n+1`). Dedupe across overlapping ranges. Output ordered by `position` ascending. `isAnnotated` is computed once at the end by intersecting excerpt positions with annotation segment positions.

### Speaker resolution

`session.user_speaker_labels` is `('A' | 'B')[] | null`. The mapping at build time:
- If a segment's `speaker` is in `user_speaker_labels` → `'user'`.
- Otherwise → `'other'`.
- If `user_speaker_labels` is null (single-speaker session that never went through identify) → all segments map to `'user'`.

We resolve to `'user' / 'other'` rather than passing raw `A` / `B` because the coach's prompt language ("the user said …") would otherwise need a separate translation step.

### Safety cap

The rendered page-context prompt block is capped at **8000 characters** total per payload. If exceeded:
- **`kind: 'session'`** — drop annotations from the **end** of the list (transcript-position order) and recompute excerpts until under cap. Excerpts that exist only because of dropped annotations are dropped too.
- **`kind: 'write'`** — drop items from the **end** of the list. `loadPracticeItems` returns newest first by default (`created_at` descending), so the items at the end are the oldest pending corrections — the ones least likely to be top-of-mind.

Logged via `lib/logger.ts` (`log.warn('voice-context cap hit', { kind, originalCount, keptCount })`) so we can tune later. The cap is a backstop; with A3 expansion (3 segments × ~50 tokens each per annotation) a typical 30-min session sits around 2–3k chars, and a 20-item Write list around 1–2k.

---

## Prompt structure

`buildSystemPrompt` signature:

```ts
buildSystemPrompt(
  targetLanguage: TargetLanguage,
  routeContext: VoiceRouteContext,
  pageContext?: VoicePageContext
): string
```

Body order, top-to-bottom:

1. **Language block** — unchanged.
2. **Route hint** — unchanged. One sentence.
3. **Page-context block** — only if `pageContext` is present. Plain enumerated text. Structural labels in English; user content in the target language. Format below.
4. **Opening guidance** — see "Opening guidance" section below.

### Page-context block — `kind: 'write'`

```
Pending corrections the user has saved:
1. "tengo veinticinco anios" → "tengo veinticinco años" — the n with a tilde marks the palatal nasal sound; without it you've spelled "anus" (from "Cena con Marcela")
2. "estoy 25 años" → "tengo 25 años" — Spanish uses "tener" for age, not "estar" (from "Lección de gramática")
…
```

Items rendered in the order returned by the builder (which preserves `loadPracticeItems`' default order — created_at descending). Empty `correction` field renders as `original` repeated, matching the existing `FocusedCorrection` rendering.

### Page-context block — `kind: 'session'`

```
The user is reviewing this conversation excerpt:
[user, position 12]: …
[other, position 14]: …
[user, position 16]: …  ← annotated

Annotations on this excerpt:
1. On the user line at position 16: "X" → "Y" — explanation…
2. …
```

Position numbers come straight from `transcript_segments.position`. `← annotated` is a literal string suffix on lines where `isAnnotated === true`. When `excerpts.length === 0` (no annotations) the block collapses to:

```
The user is reviewing the conversation titled '<sessionTitle>'.
```

(This duplicates the route hint but is intentional — when the user has zero annotations, that one sentence IS the page context.)

### Opening guidance

Replaces the current `items.length === 0` branch in `buildSystemPrompt`:

| Condition | Sentence appended at end of prompt |
|-----------|------------------------------------|
| `pageContext` present | "The user may refer to these by deixis ('this one', 'the third', 'the part about …'). When they do, anchor your answer to the specific item. Otherwise stay free-form. Be brief — one or two sentences, then wait for the user to respond." |
| `pageContext` absent | "The user has not given you a specific topic. Greet them briefly and ask how you can help." |

The "be brief" guidance migrates over from today's `items.length > 0` branch — same intent.

---

## Lifecycle

### Publish

`TranscriptClient` publishes on mount, re-publishes when its `detail` snapshot changes (so re-renders driven by user actions like adding an annotation update the global), and clears on unmount:

```ts
useEffect(() => {
  window.__ccVoiceContext = buildSessionContext(detail.session, detail.segments, detail.annotations) ?? undefined
  return () => { delete window.__ccVoiceContext }
}, [detail])
```

`WriteClient` does the analogous publish keyed on `items`:

```ts
useEffect(() => {
  window.__ccVoiceContext = buildWriteContext(items) ?? undefined
  return () => { delete window.__ccVoiceContext }
}, [items])
```

### Read

Inside `useVoiceController.start()`:

```ts
const pageContext = typeof window !== 'undefined' ? window.__ccVoiceContext : undefined
const agent = await connect(targetLanguage, callbacks, deriveRouteContext(pathname), pageContext)
```

Pinned at connect: the value read here is what the agent gets for the whole session. Subsequent navigation, list edits, or even Strict-Mode unmount cycles don't reach the live agent.

### Mid-session navigation

User starts on `/write`, walks to `/sessions/123`. `WriteClient` unmounts and `delete`s the global; `TranscriptClient` mounts and rewrites it. **The agent doesn't care** — its system prompt was set at connect time. The strip stays up; the conversation continues unchanged. This matches today's session-survives-navigation behaviour and is the same trade-off we already accepted for the route hint.

### Navigation ordering

Next.js runs the leaving route's effect cleanup before the entering route's effect bodies on a normal client-side transition, so the old route's `delete` always lands before the new route's write. The global is therefore always either `undefined` (between routes) or the freshly-mounted route's payload — never a stale one from the route just left.

The only place the order inverts is React Strict Mode's dev-only mount → unmount → remount cycle on the same component. There the second cleanup would `delete` after the second mount has already published. We accept that — Strict Mode is dev-only, and the controller reads the global at `start()`, not on every render, so a transient inconsistency between renders never reaches the agent.

---

## Errors and edge cases

| Situation | Behaviour |
|-----------|-----------|
| User on `/write` with empty list | `buildWriteContext` returns null → no global set → falls through to generic "no specific topic" greeting. |
| Session still loading (RSC streaming) | `TranscriptClient` not yet mounted → no global → generic greeting. Acceptable; loading is brief. |
| Session with zero annotations | Publish `kind: 'session'` with empty arrays; prompt collapses to "user is reviewing 'X'". |
| Session with 50+ annotations | 8000-char cap kicks in; excess dropped from the end with a warn log. |
| Session deleted under a practice item | `sessionTitle` is null on that item; rendered as `(from an unknown session)` in the prompt, matching the WriteSheet's existing fallback wording. |
| User on `/` (or any non-write/non-session route) | Neither client publishes → no global → generic greeting. Matches today. |
| Browser without `window` (SSR) | The `typeof window !== 'undefined'` guard in `start()` means it's a no-op on the server. `start()` is only called from a client component anyway. |

---

## Tests

### `lib/voice-context.test.ts` (new)

- Neighbour expansion: single annotation at position 5 → excerpts at 4, 5, 6.
- Dedupe: two annotations at positions 5 and 6 → excerpts at 4, 5, 6, 7 (5 and 6 not duplicated).
- Edge: annotation at position 0 → excerpts at 0, 1 (no negative positions).
- Edge: annotation at last position → excerpts include the prior segment, not a non-existent next.
- Speaker resolution: `user_speaker_labels: ['A']` → segment with speaker A maps to `'user'`, B maps to `'other'`. Null labels → all `'user'`.
- `isAnnotated` flag set correctly across the deduped list.
- Cap: synthetic session that exceeds 8000 chars drops annotations from the end until under cap; returns the kept count for the log assertion.
- `buildWriteContext([])` returns null.
- `buildSessionContext` with empty segments returns null.
- `buildSessionContext` with segments but no annotations returns a payload with `excerpts: []` and `annotations: []`.

### `lib/voice-agent.test.ts` (extend existing)

- `buildSystemPrompt` × `pageContext: undefined` → no page-context block; opening guidance is the "no specific topic" line.
- `buildSystemPrompt` × `pageContext: { kind: 'write', items: [...] }` → renders the "Pending corrections:" block with each item; opening guidance is the deixis line.
- `buildSystemPrompt` × `pageContext: { kind: 'session', excerpts, annotations }` → renders the "user is reviewing this excerpt" block + speakers + `← annotated` markers + annotations list.
- `buildSystemPrompt` × `pageContext: { kind: 'session' }` with zero annotations → collapses to the single-line "reviewing 'X'" form.
- Same matrix for both `targetLanguage` values (the language block changes but the page-context block does not — assert that explicitly).

### `components/VoiceController.test.ts` (extend existing)

- Set `window.__ccVoiceContext = { kind: 'write', items: [...] }`, call `start()`, assert the mocked `connect()` received that payload as its 4th argument.
- With `window.__ccVoiceContext = undefined`, assert `connect()` received `undefined`.
- After `start()` resolves, mutate `window.__ccVoiceContext` and assert nothing further is sent (pin-at-connect verification).

### `components/TranscriptClient.test.tsx` (extend existing)

- On mount, `window.__ccVoiceContext` is set to a `kind: 'session'` payload with the expected `sessionTitle`, `excerpts.length`, and `annotations.length`.
- On unmount, `window.__ccVoiceContext` is `undefined`.

### `components/WriteClient.test.tsx` (extend existing)

- On mount with non-empty items, the global is set to a `kind: 'write'` payload with the expected `items.length`.
- On mount with empty items, the global is `undefined`.

---

## Migration & rollout

Single PR, no feature flag. The user-visible change is purely additive (the coach gets smarter on two pages); no UI surface changes; no schema changes; no env vars.

Smoke check before merge:
1. Start session on `/write` with 3+ pending items. Ask "what's the third correction about?". Coach answers using the actual third item.
2. Start session on `/sessions/<id>` with 5+ annotations. Ask "what was the part about subjunctive?". Coach answers from the transcript content.
3. Start session on `/` (no page context). Coach falls back to "how can I help?" greeting.
4. Start on `/write`, walk to `/sessions/<id>` mid-call, ask the coach about the session. Coach still talks about the Write list (pinned at connect — confirmation that the spec's stated behaviour is what ships).
5. Open `/write` with zero items. Start session. Coach falls back to generic greeting.

---

## Future work

- **Mid-session context refresh.** If the pinned-at-connect trade-off bites in practice, add an `agent.updatePageContext(...)` method that re-injects context as a model-context-update message. Will need Gemini's session-update API support — currently we only set system instruction at setup time.
- **Quiz / drill mode.** Use case D from brainstorming. Would build on the same `pageContext` payload but flip the opening guidance to "drive the conversation; pick an item, ask the user to use it in a sentence, give feedback".
- **Voice-commanded actions.** "Mark this as written" / "next correction". Would need a server-side parser on the agent's text channel — currently we only consume the audio channel.
- **Selective subset by user gesture.** "I want to talk about *just* these 3 items." Would need a UI affordance (multi-select on the Write list?) and a fourth `kind: 'subset'` payload. Out of scope until the simpler default proves itself.
- **Importance / flashcard fields in the prompt.** Excluded for v1; revisit if the coach's responses feel like they're missing nuance the importance score would have given them.
